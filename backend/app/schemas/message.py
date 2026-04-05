"""
VajraKavach — Message Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class MessageSend(BaseModel):
    conversation_id: Optional[str] = None
    recipient_id: Optional[str] = None  # Optional for group messages
    ciphertext: str = Field(..., max_length=100000)
    signature: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_name: Optional[str] = None  # For group messages
    recipient_id: Optional[str] = None
    ciphertext: str
    signature: Optional[str] = None
    is_server_encrypted: bool
    deleted_for_everyone: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: str
    name: Optional[str] = None
    is_group: bool
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    member_count: Optional[int] = None  # For group chats
    created_at: datetime
    last_message_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GroupCreate(BaseModel):
    name: str = Field(..., max_length=100, min_length=1)
    member_ids: list[str] = Field(..., min_length=1)


class GroupMemberResponse(BaseModel):
    user_id: str
    full_name: str
    joined_at: datetime
