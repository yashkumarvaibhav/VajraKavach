"""
VajraKavach — Message Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class MessageSend(BaseModel):
    conversation_id: Optional[str] = None       # None = create new conversation
    recipient_id: str
    ciphertext: str                              # client-side encrypted content
    signature: Optional[str] = None              # PKI digital signature


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    recipient_id: Optional[str] = None
    ciphertext: str
    signature: Optional[str] = None
    is_server_encrypted: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: str
    name: Optional[str] = None
    is_group: bool
    created_at: datetime

    class Config:
        from_attributes = True
