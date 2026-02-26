"""
VajraKavach — Message Routes
E2E encrypted messaging (1-to-1 and group).
Server stores ONLY ciphertext.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.models.message import Message, Conversation
from app.models.user import User
from app.schemas.message import MessageSend, MessageResponse, ConversationResponse
from app.dependencies import get_current_user
from app.services.audit_service import create_audit_log

router = APIRouter(prefix="/api/messages", tags=["Messaging"])


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
    """
    conversation_id = req.conversation_id

    if not conversation_id:
        # Create a new 1-to-1 conversation
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
    """List conversations where the current user has messages."""
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

    return [
        ConversationResponse(
            id=str(c.id),
            name=c.name,
            is_group=c.is_group,
            created_at=c.created_at,
        )
        for c in conversations
    ]


@router.get("/conversations/{conversation_id}", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all messages in a conversation (returns ciphertext — client decrypts)."""
    # Verify user is part of this conversation
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

    # Fetch all messages
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
