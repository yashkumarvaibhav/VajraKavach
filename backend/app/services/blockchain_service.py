"""
VajraKavach — Blockchain Service
Implements a blockchain layer over audit logs with Merkle trees and proof-of-work.

Each block contains a batch of audit log entries. The block is sealed with:
  - A Merkle root computed from the entry hashes
  - A proof-of-work nonce (difficulty: 2 leading zeros)
  - A hash linking to the previous block
"""

import hashlib
import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.models.audit import AuditLog
from app.models.audit_block import AuditBlock


GENESIS_BLOCK_HASH = "0" * 64
DIFFICULTY = 2  # Number of leading zeros required in block hash
BLOCK_SIZE = 10  # Max entries per block


def compute_merkle_root(hashes: List[str]) -> str:
    """Compute the Merkle root from a list of SHA-256 hashes."""
    if not hashes:
        return hashlib.sha256(b"empty").hexdigest()

    level = list(hashes)
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])  # Duplicate last hash for odd count
        next_level = []
        for i in range(0, len(level), 2):
            combined = level[i] + level[i + 1]
            next_level.append(hashlib.sha256(combined.encode("utf-8")).hexdigest())
        level = next_level

    return level[0]


def compute_block_hash(
    block_number: int,
    previous_block_hash: str,
    merkle_root: str,
    timestamp: str,
    nonce: int,
) -> str:
    """Compute the SHA-256 hash of a block."""
    payload = f"{block_number}|{previous_block_hash}|{merkle_root}|{timestamp}|{nonce}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def mine_block(
    block_number: int,
    previous_block_hash: str,
    merkle_root: str,
    timestamp: str,
) -> tuple:
    """
    Perform proof-of-work mining to find a nonce that produces a hash
    with the required number of leading zeros.
    Returns (nonce, block_hash).
    """
    prefix = "0" * DIFFICULTY
    nonce = 0
    while True:
        block_hash = compute_block_hash(
            block_number, previous_block_hash, merkle_root, timestamp, nonce
        )
        if block_hash.startswith(prefix):
            return nonce, block_hash
        nonce += 1


async def get_latest_block(db: AsyncSession) -> Optional[AuditBlock]:
    """Get the most recent block in the chain."""
    result = await db.execute(
        select(AuditBlock).order_by(desc(AuditBlock.block_number)).limit(1)
    )
    return result.scalar_one_or_none()


async def get_unblocked_entries(db: AsyncSession) -> List[AuditLog]:
    """Get audit log entries not yet included in any block."""
    latest_block = await get_latest_block(db)

    if latest_block:
        # Get IDs already in blocks
        all_blocks = await db.execute(select(AuditBlock.entry_ids))
        blocked_ids = set()
        for row in all_blocks.scalars().all():
            for eid in row.split(","):
                eid = eid.strip()
                if eid:
                    blocked_ids.add(eid)

        # Convert blocked_ids to UUIDs for proper SQL filtering
        blocked_uuid_list = [uuid.UUID(eid) for eid in blocked_ids if eid]

        if blocked_uuid_list:
            result = await db.execute(
                select(AuditLog)
                .where(AuditLog.id.notin_(blocked_uuid_list))
                .order_by(AuditLog.created_at)
                .limit(BLOCK_SIZE)
            )
        else:
            result = await db.execute(
                select(AuditLog).order_by(AuditLog.created_at).limit(BLOCK_SIZE)
            )
        return result.scalars().all()
    else:
        result = await db.execute(
            select(AuditLog).order_by(AuditLog.created_at).limit(BLOCK_SIZE)
        )
        return result.scalars().all()


async def create_block(db: AsyncSession) -> Optional[AuditBlock]:
    """
    Create a new block from pending (unblocked) audit log entries.
    Performs proof-of-work mining.
    Returns the new block, or None if no pending entries.
    """
    entries = await get_unblocked_entries(db)
    if not entries:
        return None

    # Get previous block
    latest = await get_latest_block(db)
    previous_hash = latest.block_hash if latest else GENESIS_BLOCK_HASH
    block_number = (latest.block_number + 1) if latest else 1

    # Compute Merkle root from entry hashes
    entry_hashes = [e.entry_hash for e in entries]
    merkle_root = compute_merkle_root(entry_hashes)

    # Mine the block
    now = datetime.utcnow()
    timestamp = now.isoformat()
    nonce, block_hash = mine_block(block_number, previous_hash, merkle_root, timestamp)

    entry_ids = ",".join(str(e.id) for e in entries)

    block = AuditBlock(
        id=uuid.uuid4(),
        block_number=block_number,
        previous_block_hash=previous_hash,
        merkle_root=merkle_root,
        nonce=nonce,
        block_hash=block_hash,
        entry_count=len(entries),
        entry_ids=entry_ids,
        timestamp=now,
    )
    db.add(block)
    await db.flush()
    return block


async def verify_blockchain(db: AsyncSession) -> dict:
    """
    Verify the integrity of the entire blockchain.
    Checks:
    1. Each block's hash is valid (recomputable with correct nonce)
    2. Each block links to the previous block correctly
    3. Each block's Merkle root matches its entries
    4. Proof-of-work is valid (leading zeros)
    """
    result = await db.execute(
        select(AuditBlock).order_by(AuditBlock.block_number)
    )
    blocks = result.scalars().all()

    if not blocks:
        return {"valid": True, "total_blocks": 0, "broken_at": None}

    prefix = "0" * DIFFICULTY
    expected_prev = GENESIS_BLOCK_HASH

    for block in blocks:
        # Check previous hash link
        if block.previous_block_hash != expected_prev:
            return {
                "valid": False,
                "total_blocks": len(blocks),
                "broken_at": block.block_number,
                "reason": "previous_hash_mismatch",
            }

        # Recompute block hash
        recomputed = compute_block_hash(
            block.block_number,
            block.previous_block_hash,
            block.merkle_root,
            block.timestamp.isoformat(),
            block.nonce,
        )

        if recomputed != block.block_hash:
            return {
                "valid": False,
                "total_blocks": len(blocks),
                "broken_at": block.block_number,
                "reason": "block_hash_mismatch",
            }

        # Check proof-of-work
        if not block.block_hash.startswith(prefix):
            return {
                "valid": False,
                "total_blocks": len(blocks),
                "broken_at": block.block_number,
                "reason": "invalid_proof_of_work",
            }

        # Verify Merkle root against actual entries
        entry_id_list = [eid.strip() for eid in block.entry_ids.split(",") if eid.strip()]
        if entry_id_list:
            entries_result = await db.execute(
                select(AuditLog).where(AuditLog.id.in_(entry_id_list))
            )
            entries = entries_result.scalars().all()
            entry_hashes = [e.entry_hash for e in sorted(entries, key=lambda e: str(e.id))]
            # Sort by the order in entry_ids
            hash_map = {str(e.id): e.entry_hash for e in entries}
            ordered_hashes = [hash_map[eid] for eid in entry_id_list if eid in hash_map]
            recomputed_merkle = compute_merkle_root(ordered_hashes)
            if recomputed_merkle != block.merkle_root:
                return {
                    "valid": False,
                    "total_blocks": len(blocks),
                    "broken_at": block.block_number,
                    "reason": "merkle_root_mismatch",
                }

        expected_prev = block.block_hash

    return {"valid": True, "total_blocks": len(blocks), "broken_at": None}
