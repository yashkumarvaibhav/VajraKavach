"""
VajraKavach — Message Routes
E2E encrypted messaging (1-to-1 and group), server-side encrypted announcements.
Server stores ONLY ciphertext.
"""

import uuid
import base64
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func

from app.database import get_db
from app.models.message import Message, Conversation, ConversationMember
from app.models.announcement import Announcement
from app.models.user import User
from app.schemas.message import MessageSend, MessageResponse, ConversationResponse, GroupCreate, GroupMemberResponse
from app.schemas.announcement import AnnouncementCreate, AnnouncementResponse
from app.dependencies import get_current_user, require_role
from app.services.audit_service import create_audit_log
from app.services.encryption_service import encrypt_data, decrypt_data
from app.utils.ip import get_client_ip

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
    conversation_id = req.conversation_id

    if conversation_id:
        # Verify user is part of this conversation
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = conv_result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        if conv.is_group:
            # Check membership
            member_check = await db.execute(
                select(ConversationMember).where(
                    ConversationMember.conversation_id == uuid.UUID(conversation_id),
                    ConversationMember.user_id == current_user.id,
                )
            )
            if not member_check.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Not a member of this group")
    else:
        if not req.recipient_id:
            raise HTTPException(status_code=400, detail="Either conversation_id or recipient_id is required")
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

        partner_id = None
        partner_name = None
        member_count = None

        if c.is_group:
            # Count members
            count_result = await db.execute(
                select(func.count(ConversationMember.id)).where(
                    ConversationMember.conversation_id == c.id
                )
            )
            member_count = count_result.scalar() or 0
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
            partner_id=partner_id,
            partner_name=partner_name,
            member_count=member_count,
            created_at=c.created_at,
        ))

    return responses


@router.get("/conversations/{conversation_id}", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
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
        if not member_check.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this group")
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's own private key (decrypted) for E2E decryption.
    The private key is stored server-side encrypted with Fernet (AES)."""
    if not current_user.encrypted_private_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No private key found. Key was generated at registration.",
        )
    try:
        decrypted = decrypt_data(current_user.encrypted_private_key.encode("utf-8"))
        return {"private_key": decrypted.decode("utf-8")}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt private key",
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
    # Verify user is a participant
    if uid != str(msg.sender_id) and uid != str(msg.recipient_id):
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

    return ConversationResponse(
        id=str(conv.id),
        name=conv.name,
        is_group=True,
        partner_id=None,
        partner_name=None,
        member_count=added,
        created_at=conv.created_at,
    )


@router.get("/groups/{group_id}/members", response_model=list[GroupMemberResponse])
async def get_group_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all members of a group conversation."""
    # Verify membership
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this group")

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
    """Add a member to a group conversation (only existing members can add)."""
    # Verify requester is a member
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == uuid.UUID(group_id),
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this group")

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
    """Remove a member from a group (the creator or the member themselves can remove)."""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == group_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Allow: creator removes anyone, or user removes themselves
    is_creator = conv.created_by and str(conv.created_by) == str(current_user.id)
    is_self = str(current_user.id) == user_id
    if not is_creator and not is_self:
        raise HTTPException(status_code=403, detail="Only the group creator or the member themselves can remove")

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


# ─── Admin Announcements (Server-Side Encrypted) ──────────────────

@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    req: AnnouncementCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a server-side encrypted announcement (admin only).
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
    current_user: User = Depends(require_role("admin")),
):
    """Deactivate an announcement (admin only)."""
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
