"""
VajraKavach — Message Routes
E2E encrypted messaging (1-to-1 and group).
Server stores ONLY ciphertext.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from app.database import get_db
from app.models.message import Message, Conversation
from app.models.user import User
from app.schemas.message import MessageSend, MessageResponse, ConversationResponse
from app.dependencies import get_current_user
from app.services.audit_service import create_audit_log

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


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    req: MessageSend,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send an encrypted message.
    Client encrypts the message with recipient's public key before sending.
    Server stores only ciphertext.
    If no conversation_id is provided, finds or creates a 1-to-1 conversation.
    """
    conversation_id = req.conversation_id

    if not conversation_id:
        # Try to find an existing conversation between these two users
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
        recipient_id=uuid.UUID(req.recipient_id),
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
        ip_address=request.client.host if request.client else None,
    )

    return MessageResponse(
        id=str(message.id),
        conversation_id=str(message.conversation_id),
        sender_id=str(message.sender_id),
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
    """List conversations where the current user has messages, with partner info."""
    result = await db.execute(
        select(Conversation)
        .join(Message, Message.conversation_id == Conversation.id)
        .where(
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id,
            )
        )
        .distinct()
    )
    conversations = result.scalars().all()

    responses = []
    for c in conversations:
        partner_id = None
        partner_name = None

        if not c.is_group:
            # Find the other user in this conversation
            msg_result = await db.execute(
                select(Message).where(Message.conversation_id == c.id).limit(1)
            )
            sample_msg = msg_result.scalar_one_or_none()
            if sample_msg:
                if str(sample_msg.sender_id) == str(current_user.id):
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
            created_at=c.created_at,
        ))

    return responses


@router.get("/conversations/{conversation_id}", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all messages in a conversation (returns ciphertext — client decrypts)."""
    result = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation_id,
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id,
            ),
        )
    )
    check = result.scalars().first()
    if not check:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not part of this conversation")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()

    return [
        MessageResponse(
            id=str(m.id),
            conversation_id=str(m.conversation_id),
            sender_id=str(m.sender_id),
            recipient_id=str(m.recipient_id) if m.recipient_id else None,
            ciphertext=m.ciphertext,
            signature=m.signature,
            is_server_encrypted=m.is_server_encrypted,
            created_at=m.created_at,
        )
        for m in messages
    ]


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


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a specific message (only the sender can delete)."""
    result = await db.execute(
        select(Message).where(
            Message.id == message_id,
            Message.sender_id == current_user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found or not your message")
    await db.delete(msg)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation and all its messages (only if you are a participant)."""
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

    # Delete all messages in the conversation
    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id)
    )
    msgs = msg_result.scalars().all()
    for m in msgs:
        await db.delete(m)

    # Delete the conversation itself
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if conv:
        await db.delete(conv)
