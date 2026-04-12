"""
VajraKavach — Message Routes
E2E encrypted messaging (1-to-1 and group), server-side encrypted announcements.
Server stores ONLY ciphertext.
"""

import uuid
import base64
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func

from app.database import get_db
from app.models.message import Message, Conversation, ConversationMember
from app.models.announcement import Announcement
from app.models.user import User
from app.models.connection import Connection, ConnectionStatus
from app.schemas.message import MessageSend, MessageResponse, ConversationResponse, GroupCreate, GroupMemberResponse
from app.schemas.announcement import AnnouncementCreate, AnnouncementResponse
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log
from app.services.encryption_service import encrypt_data, decrypt_data
from app.utils.ip import get_client_ip
from app.services.action_rate_limit_service import check_action_rate_limit, record_action

router = APIRouter(prefix="/api/messages", tags=["Messaging"])


async def _find_existing_conversation(db: AsyncSession, user_a_id, user_b_id):
    """Find an existing 1-to-1 conversation between two users."""
    result = await db.execute(
        select(Conversation)
        .join(Message, Message.conversation_id == Conversation.id)
        .where(
            Conversation.is_group == False,
            or_(
                and_(Message.sender_id == user_a_id, Message.recipient_id == user_b_id),
                and_(Message.sender_id == user_b_id, Message.recipient_id == user_a_id),
            ),
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _build_message_response(m: Message, sender_name: str = None) -> MessageResponse:
    """Build a MessageResponse from a Message object."""
    if m.deleted_for_everyone:
        return MessageResponse(
            id=str(m.id),
            conversation_id=str(m.conversation_id),
            sender_id=str(m.sender_id),
            sender_name=sender_name,
            recipient_id=str(m.recipient_id) if m.recipient_id else None,
            ciphertext="This message was deleted",
            signature=None,
            is_server_encrypted=m.is_server_encrypted,
            deleted_for_everyone=True,
            created_at=m.created_at,
        )
    return MessageResponse(
        id=str(m.id),
        conversation_id=str(m.conversation_id),
        sender_id=str(m.sender_id),
        sender_name=sender_name,
        recipient_id=str(m.recipient_id) if m.recipient_id else None,
        ciphertext=m.ciphertext,
        signature=m.signature,
        is_server_encrypted=m.is_server_encrypted,
        deleted_for_everyone=False,
        created_at=m.created_at,
    )


def _looks_like_hybrid_ciphertext(blob: str) -> bool:
    """Basic structural validation for the WebCrypto payload format used by the client."""
    try:
        raw = base64.b64decode(blob, validate=True)
    except Exception:
        return False

    if len(raw) < 2 + 12 + 16:
        return False

    key_len = (raw[0] << 8) | raw[1]
    # [2-byte key length][encrypted key][12-byte IV][AES-GCM ciphertext+tag]
    return key_len > 0 and len(raw) > 2 + key_len + 12


def _is_valid_e2e_ciphertext(ciphertext: str, *, is_group: bool) -> bool:
    """Reject plaintext submissions so the API only persists encrypted payloads."""
    prefix = "E2EG:" if is_group else "E2E:"
    if not isinstance(ciphertext, str) or not ciphertext.startswith(prefix):
        return False

    try:
        payload = json.loads(ciphertext[len(prefix):])
    except json.JSONDecodeError:
        return False

    if is_group:
        return (
            isinstance(payload, dict)
            and bool(payload)
            and all(
                isinstance(user_id, str)
                and user_id
                and isinstance(blob, str)
                and blob
                and _looks_like_hybrid_ciphertext(blob)
                for user_id, blob in payload.items()
            )
        )

    if not isinstance(payload, dict):
        return False

    sender_blob = payload.get("s")
    recipient_blob = payload.get("r")
    return isinstance(recipient_blob, str) and bool(recipient_blob) and _looks_like_hybrid_ciphertext(recipient_blob) and (
        sender_blob is None or (isinstance(sender_blob, str) and _looks_like_hybrid_ciphertext(sender_blob))
    )


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    req: MessageSend,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send an encrypted message.
    For 1-to-1: provide recipient_id (conversation_id optional).
    For group: provide conversation_id (recipient_id optional).
    """
    await check_action_rate_limit(db, "message_send", str(current_user.id))

    conversation_id = req.conversation_id
    is_group_message = False

    if conversation_id:
        # Verify user is part of this conversation
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = conv_result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        is_group_message = bool(conv.is_group)
        if conv.is_group:
            # Reject messages to archived groups
            if conv.is_archived:
                raise HTTPException(status_code=403, detail="This group has been archived. No new messages allowed.")
            # Check membership
            member_check = await db.execute(
                select(ConversationMember).where(
                    ConversationMember.conversation_id == uuid.UUID(conversation_id),
                    ConversationMember.user_id == current_user.id,
                )
            )
            member = member_check.scalar_one_or_none()
            if not member:
                raise HTTPException(status_code=403, detail="Not a member of this group")
            if member.has_left:
                raise HTTPException(status_code=403, detail="You have left this group. You cannot send messages.")
    else:
        if not req.recipient_id:
            raise HTTPException(status_code=400, detail="Either conversation_id or recipient_id is required")
        # Enforce accepted connection before allowing DMs
        conn_check = await db.execute(
            select(Connection).where(
                Connection.status == ConnectionStatus.ACCEPTED,
                or_(
                    and_(Connection.requester_id == current_user.id, Connection.addressee_id == req.recipient_id),
                    and_(Connection.requester_id == req.recipient_id, Connection.addressee_id == current_user.id),
                ),
            )
        )
        if not conn_check.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="You can only message users you are connected with")
        # Try to find an existing 1-to-1 conversation
        existing = await _find_existing_conversation(
            db, str(current_user.id), req.recipient_id
        )
        if existing:
            conversation_id = str(existing.id)
        else:
            conversation = Conversation(
                id=uuid.uuid4(),
                is_group=False,
            )
            db.add(conversation)
            await db.flush()
            conversation_id = str(conversation.id)

    if not _is_valid_e2e_ciphertext(req.ciphertext, is_group=is_group_message):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Private messages must be client-side encrypted before submission.",
        )

    message = Message(
        id=uuid.uuid4(),
        conversation_id=uuid.UUID(conversation_id),
        sender_id=current_user.id,
        recipient_id=uuid.UUID(req.recipient_id) if req.recipient_id else None,
        ciphertext=req.ciphertext,
        signature=req.signature,
        is_server_encrypted=False,
    )
    db.add(message)
    await db.flush()

    await create_audit_log(
        db=db,
        action="message.send",
        user_id=str(current_user.id),
        resource="message",
        resource_id=str(message.id),
        details={"conversation_id": conversation_id, "recipient_id": req.recipient_id},
        ip_address=get_client_ip(request),
    )

    # Push real-time WebSocket notification to conversation participants
    from app.routes.websocket import notify_conversation
    ws_event = {
        "type": "new_message",
        "conversation_id": conversation_id,
        "sender_id": str(current_user.id),
        "sender_name": current_user.full_name,
    }
    notify_targets = []
    if is_group_message:
        # Notify all group members
        members_result = await db.execute(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == uuid.UUID(conversation_id),
                ConversationMember.has_left == False,
            )
        )
        notify_targets = [str(r[0]) for r in members_result.fetchall()]
    else:
        notify_targets = [str(current_user.id)]
        if req.recipient_id:
            notify_targets.append(req.recipient_id)
    asyncio.create_task(notify_conversation(notify_targets, ws_event))

    await record_action(db, "message_send", str(current_user.id))

    return MessageResponse(
        id=str(message.id),
        conversation_id=str(message.conversation_id),
        sender_id=str(message.sender_id),
        sender_name=current_user.full_name,
        recipient_id=str(message.recipient_id) if message.recipient_id else None,
        ciphertext=message.ciphertext,
        signature=message.signature,
        is_server_encrypted=message.is_server_encrypted,
        created_at=message.created_at,
    )


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List conversations where the current user has messages or is a member."""
    uid = str(current_user.id)

    # Get 1-to-1 conversations via messages
    dm_result = await db.execute(
        select(Conversation)
        .join(Message, Message.conversation_id == Conversation.id)
        .where(
            Conversation.is_group == False,
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id,
            ),
        )
        .distinct()
    )
    dm_convs = dm_result.scalars().all()

    # Get group conversations via membership
    group_result = await db.execute(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(
            Conversation.is_group == True,
            ConversationMember.user_id == current_user.id,
        )
        .distinct()
    )
    group_convs = group_result.scalars().all()

    all_convs = {str(c.id): c for c in dm_convs}
    for c in group_convs:
        all_convs[str(c.id)] = c

    responses = []
    for c in all_convs.values():
        # Check if all messages are deleted for user
        all_msgs_result = await db.execute(
            select(Message).where(Message.conversation_id == c.id)
        )
        all_msgs = all_msgs_result.scalars().all()
        visible_msgs = [m for m in all_msgs if not m.deleted_for_everyone and uid not in (m.deleted_for or [])]
        if len(all_msgs) > 0 and len(visible_msgs) == 0 and not c.is_group:
            continue

        # Get latest message timestamp for sorting
        last_msg_time = max((m.created_at for m in visible_msgs), default=None) if visible_msgs else None

        partner_id = None
        partner_name = None
        member_count = None
        is_archived = False
        has_left = False
        created_by_name = None

        if c.is_group:
            is_archived = bool(c.is_archived)
            # Count active members (not left)
            count_result = await db.execute(
                select(func.count(ConversationMember.id)).where(
                    ConversationMember.conversation_id == c.id,
                    ConversationMember.has_left == False,
                )
            )
            member_count = count_result.scalar() or 0
            # Check if current user has left
            my_member = await db.execute(
                select(ConversationMember).where(
                    ConversationMember.conversation_id == c.id,
                    ConversationMember.user_id == current_user.id,
                )
            )
            my_membership = my_member.scalar_one_or_none()
            if my_membership:
                has_left = bool(my_membership.has_left)
            # Get creator name
            if c.created_by:
                creator_res = await db.execute(select(User).where(User.id == c.created_by))
                creator_user = creator_res.scalar_one_or_none()
                if creator_user:
                    created_by_name = creator_user.full_name
        else:
            # Find the other user in this conversation
            msg_result = await db.execute(
                select(Message).where(Message.conversation_id == c.id).limit(1)
            )
            sample_msg = msg_result.scalar_one_or_none()
            if sample_msg:
                if str(sample_msg.sender_id) == uid:
                    other_id = str(sample_msg.recipient_id) if sample_msg.recipient_id else None
                else:
                    other_id = str(sample_msg.sender_id)

                if other_id:
                    partner_id = other_id
                    user_result = await db.execute(select(User).where(User.id == other_id))
                    partner_user = user_result.scalar_one_or_none()
                    if partner_user:
                        partner_name = partner_user.full_name

        responses.append(ConversationResponse(
            id=str(c.id),
            name=c.name or partner_name,
            is_group=c.is_group,
            is_archived=is_archived,
            has_left=has_left,
            partner_id=partner_id,
            partner_name=partner_name,
            member_count=member_count,
            created_by=str(c.created_by) if c.created_by else None,
            created_by_name=created_by_name,
            created_at=c.created_at,
            last_message_at=last_msg_time,
        ))

    # Sort by most recent message first
    responses.sort(key=lambda r: r.last_message_at or r.created_at, reverse=True)

    return responses


@router.get("/conversations/{conversation_id}", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all messages in a conversation (returns ciphertext — client decrypts).
    Filters out messages that were soft-deleted for the current user."""
    # Check conversation exists
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Verify membership
    if conv.is_group:
        member_check = await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == uuid.UUID(conversation_id),
                ConversationMember.user_id == current_user.id,
            )
        )
        member = member_check.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this group")
        # Members who left can still read (has_left=True is allowed here)
    else:
        result = await db.execute(
            select(Message).where(
                Message.conversation_id == conversation_id,
                or_(
                    Message.sender_id == current_user.id,
                    Message.recipient_id == current_user.id,
                ),
            )
        )
        if not result.scalars().first():
            raise HTTPException(status_code=403, detail="Not part of this conversation")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
        .offset(offset)
        .limit(limit)
    )
    messages = result.scalars().all()

    # Build sender name cache for group chats
    sender_names = {}
    if conv.is_group:
        sender_ids = list(set(str(m.sender_id) for m in messages))
        for sid in sender_ids:
            user_res = await db.execute(select(User).where(User.id == sid))
            u = user_res.scalar_one_or_none()
            sender_names[sid] = u.full_name if u else "Unknown"

    uid = str(current_user.id)
    response_msgs = []
    for m in messages:
        if uid in (m.deleted_for or []):
            continue
        sender_name = sender_names.get(str(m.sender_id)) if conv.is_group else None
        response_msgs.append(await _build_message_response(m, sender_name))
    return response_msgs


@router.get("/user/{user_id}/public-key")
async def get_user_public_key(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a user's public key for E2E encryption."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not user.public_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User has no public key")

    return {"user_id": str(user.id), "public_key": user.public_key}


@router.get("/my-private-key")
async def get_my_private_key(
    current_user: User = Depends(get_current_user),
):
    """Legacy endpoint kept disabled after the browser-side key migration."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Private keys are browser-managed now. Use the migration flow if needed.",
    )


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    for_everyone: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Soft-delete a message.
    - for_everyone=false (default): deletes for the current user only
    - for_everyone=true: deletes for everyone (only the sender can do this)
    """
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    uid = str(current_user.id)

    # For group messages, check group membership; for DMs, check sender/recipient
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == msg.conversation_id)
    )
    conv = conv_result.scalar_one_or_none()

    is_participant = False
    if conv and conv.is_group:
        member_check = await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == msg.conversation_id,
                ConversationMember.user_id == current_user.id,
            )
        )
        is_participant = member_check.scalar_one_or_none() is not None
    else:
        is_participant = uid == str(msg.sender_id) or uid == str(msg.recipient_id)

    if not is_participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your message")

    if for_everyone:
        if uid != str(msg.sender_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the sender can delete for everyone")
        msg.deleted_for_everyone = True
    else:
        deleted = list(msg.deleted_for or [])
        if uid not in deleted:
            deleted.append(uid)
        msg.deleted_for = deleted


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a conversation for the current user only.
    Marks all messages as deleted_for the current user.
    The other participant's view is not affected."""
    # Verify participation
    result = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation_id,
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id,
            ),
        ).limit(1)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not part of this conversation")

    uid = str(current_user.id)
    # Mark all messages in conversation as deleted for this user
    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id)
    )
    msgs = msg_result.scalars().all()
    for m in msgs:
        deleted = list(m.deleted_for or [])
        if uid not in deleted:
            deleted.append(uid)
        m.deleted_for = deleted


# ─── Group Chat Endpoints ─────────────────────────────────────

@router.post("/groups", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    req: GroupCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new group conversation with specified members."""
    await check_action_rate_limit(db, "group_create", str(current_user.id))

    conv = Conversation(
        id=uuid.uuid4(),
        name=req.name,
        is_group=True,
        created_by=current_user.id,
    )
    db.add(conv)
    await db.flush()

    # Add creator as member
    db.add(ConversationMember(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        user_id=current_user.id,
    ))

    # Add other members
    added = 1
    for member_id in req.member_ids:
        if member_id == str(current_user.id):
            continue
        user_check = await db.execute(select(User).where(User.id == member_id))
        if user_check.scalar_one_or_none():
            db.add(ConversationMember(
                id=uuid.uuid4(),
                conversation_id=conv.id,
                user_id=uuid.UUID(member_id),
            ))
            added += 1

    await db.flush()

    await create_audit_log(
        db=db,
        action="group.create",
        user_id=str(current_user.id),
        resource="conversation",
        resource_id=str(conv.id),
        details={"name": req.name, "member_count": added},
        ip_address=get_client_ip(request),
    )

    await record_action(db, "group_create", str(current_user.id))

    return ConversationResponse(
        id=str(conv.id),
        name=conv.name,
        is_group=True,
        partner_id=None,
        partner_name=None,
        member_count=added,
        created_by=str(conv.created_by) if conv.created_by else None,
        created_by_name=current_user.full_name,
        is_archived=False,
        has_left=False,
        created_at=conv.created_at,
    )


@router.get("/groups/{group_id}/members", response_model=list[GroupMemberResponse])
async def get_group_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all members of a group conversation."""
    # Verify membership (including left members who can still view)
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this group")

    # Get group to check creator
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    creator_id = str(conv.created_by) if conv and conv.created_by else None

    result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id)
        )
    )
    members = result.scalars().all()

    responses = []
    for m in members:
        user_res = await db.execute(select(User).where(User.id == m.user_id))
        u = user_res.scalar_one_or_none()
        responses.append(GroupMemberResponse(
            user_id=str(m.user_id),
            full_name=u.full_name if u else "Unknown",
            is_creator=(str(m.user_id) == creator_id) if creator_id else False,
            has_left=bool(m.has_left),
            joined_at=m.joined_at,
        ))
    return responses


@router.post("/groups/{group_id}/members/{user_id}", status_code=status.HTTP_201_CREATED)
async def add_group_member(
    group_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a member to a group conversation (creator/admin only)."""
    # Verify group exists and requester is creator
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group not found")

    if not conv.created_by or str(conv.created_by) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the group creator can add members")

    if conv.is_archived:
        raise HTTPException(status_code=400, detail="Cannot add members to an archived group")

    # Check if user already a member
    existing = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == uuid.UUID(user_id),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member")

    # Check user exists
    user_check = await db.execute(select(User).where(User.id == user_id))
    if not user_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    db.add(ConversationMember(
        id=uuid.uuid4(),
        conversation_id=uuid.UUID(group_id),
        user_id=uuid.UUID(user_id),
    ))
    await db.flush()

    return {"detail": "Member added"}


@router.delete("/groups/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group_member(
    group_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a group (creator/admin only)."""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group not found")

    if not conv.created_by or str(conv.created_by) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the group creator can remove members")

    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Creator cannot remove themselves. Use delete group instead.")

    if conv.is_archived:
        raise HTTPException(status_code=400, detail="Cannot remove members from an archived group")

    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == uuid.UUID(user_id),
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(member)
    await db.flush()


@router.post("/groups/{group_id}/leave")
async def leave_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Leave a group. The member stays in the group with has_left=True so they can still read messages."""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group not found")

    if conv.created_by and str(conv.created_by) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Group creator cannot leave. Use delete group to archive instead.")

    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this group")
    if member.has_left:
        raise HTTPException(status_code=400, detail="You have already left this group")

    member.has_left = True
    await db.flush()
    return {"detail": "You have left the group. You can still view old messages."}


@router.post("/groups/{group_id}/delete-for-me")
async def delete_group_for_me(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Leave a group AND soft-delete all messages for this user. The group disappears from their list."""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group not found")

    if conv.created_by and str(conv.created_by) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Group creator cannot delete for themselves. Use delete group to archive instead.")

    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this group")

    # Soft-delete all messages for this user
    uid = str(current_user.id)
    msgs_result = await db.execute(
        select(Message).where(Message.conversation_id == uuid.UUID(group_id))
    )
    for msg in msgs_result.scalars().all():
        deleted_for = msg.deleted_for or []
        if uid not in deleted_for:
            msg.deleted_for = deleted_for + [uid]

    # Remove the member record entirely so the group disappears from their list
    await db.delete(member)
    await db.flush()
    return {"detail": "Group deleted for you. Messages and group removed from your list."}


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive a group (creator only). The group becomes read-only but messages remain visible to all members."""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group not found")

    if not conv.created_by or str(conv.created_by) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the group creator can delete the group")

    if conv.is_archived:
        raise HTTPException(status_code=400, detail="Group is already archived")

    conv.is_archived = True
    await db.flush()

    await create_audit_log(
        db=db,
        action="group.archive",
        user_id=str(current_user.id),
        resource="conversation",
        resource_id=group_id,
        ip_address=get_client_ip(request),
    )


# ─── Admin Announcements (Server-Side Encrypted) ──────────────────

@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    req: AnnouncementCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("platform_admin")),
):
    """Create a server-side encrypted announcement (platform admin only).
    The title and content are encrypted at rest using Fernet (AES)."""
    # Encrypt title and content with server Fernet key
    title_enc = base64.b64encode(encrypt_data(req.title.encode("utf-8"))).decode("ascii")
    content_enc = base64.b64encode(encrypt_data(req.content.encode("utf-8"))).decode("ascii")

    announcement = Announcement(
        id=uuid.uuid4(),
        sender_id=current_user.id,
        title_encrypted=title_enc,
        content_encrypted=content_enc,
        is_active=True,
    )
    db.add(announcement)
    await db.flush()

    await create_audit_log(
        db=db,
        action="announcement.create",
        user_id=str(current_user.id),
        resource="announcement",
        resource_id=str(announcement.id),
        details={"title_length": len(req.title), "server_encrypted": True},
        ip_address=get_client_ip(request),
    )

    return AnnouncementResponse(
        id=str(announcement.id),
        sender_id=str(announcement.sender_id),
        sender_name=current_user.full_name,
        title=req.title,
        content=req.content,
        is_active=announcement.is_active,
        created_at=announcement.created_at,
    )


@router.get("/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active announcements. Server decrypts on the fly for authorized users."""
    result = await db.execute(
        select(Announcement)
        .where(Announcement.is_active == True)
        .order_by(Announcement.created_at.desc())
    )
    announcements = result.scalars().all()

    responses = []
    for a in announcements:
        try:
            title = decrypt_data(base64.b64decode(a.title_encrypted)).decode("utf-8")
            content = decrypt_data(base64.b64decode(a.content_encrypted)).decode("utf-8")
        except Exception:
            title = "[Decryption error]"
            content = "[Could not decrypt announcement]"

        # Get sender name
        sender_name = None
        sender_res = await db.execute(select(User).where(User.id == a.sender_id))
        sender = sender_res.scalar_one_or_none()
        if sender:
            sender_name = sender.full_name

        responses.append(AnnouncementResponse(
            id=str(a.id),
            sender_id=str(a.sender_id),
            sender_name=sender_name,
            title=title,
            content=content,
            is_active=a.is_active,
            created_at=a.created_at,
        ))

    return responses


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("platform_admin")),
):
    """Deactivate an announcement (platform admin only)."""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    announcement.is_active = False

    await create_audit_log(
        db=db,
        action="announcement.delete",
        user_id=str(current_user.id),
        resource="announcement",
        resource_id=str(announcement.id),
        details={"deactivated": True},
        ip_address=get_client_ip(request),
    )
