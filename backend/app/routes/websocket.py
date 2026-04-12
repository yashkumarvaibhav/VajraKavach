"""
VajraKavach — WebSocket endpoint for real-time messaging notifications.
Clients connect with their JWT token; the server pushes lightweight
"new_message" / "conversation_update" events so the frontend can fetch
and decrypt via the existing REST API.
"""

import asyncio
import logging
import re
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from app.services.auth_service import decode_token
from app.database import async_session
from app.models.user import User

logger = logging.getLogger("vajrakavach.ws")
router = APIRouter()

# In-memory connection registry: user_id -> set of WebSocket connections
_connections: Dict[str, Set[WebSocket]] = {}
_lock = asyncio.Lock()


async def _authenticate(token: str, ws: WebSocket) -> str | None:
    """Validate JWT and return user_id or None."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    if not payload.get("totp_verified", False):
        return None
    # IP binding check (consistent with REST auth)
    token_ip = payload.get("ip")
    if token_ip and ws.client:
        # For proxied connections, check X-Real-IP header
        request_ip = ws.headers.get("x-real-ip") or (ws.client.host if ws.client else None)
        if request_ip and request_ip != token_ip:
            return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    # Verify user exists and is active
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active or user.is_suspended:
            return None
    return user_id


async def register(user_id: str, ws: WebSocket):
    async with _lock:
        if user_id not in _connections:
            _connections[user_id] = set()
        _connections[user_id].add(ws)
    logger.info(f"WS connected: user={user_id[:8]}... (total={len(_connections.get(user_id, set()))})")


async def unregister(user_id: str, ws: WebSocket):
    async with _lock:
        conns = _connections.get(user_id)
        if conns:
            conns.discard(ws)
            if not conns:
                del _connections[user_id]
    logger.info(f"WS disconnected: user={user_id[:8]}...")


async def notify_user(user_id: str, event: dict):
    """Send a JSON event to all WebSocket connections for a user."""
    async with _lock:
        conns = _connections.get(user_id, set()).copy()
    dead = []
    for ws in conns:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    if dead:
        async with _lock:
            c = _connections.get(user_id)
            if c:
                for ws in dead:
                    c.discard(ws)
                if not c:
                    del _connections[user_id]


async def notify_conversation(user_ids: list[str], event: dict):
    """Send an event to all participants in a conversation."""
    for uid in user_ids:
        await notify_user(uid, event)


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(default=None)):
    # Origin validation to prevent Cross-Site WebSocket Hijacking
    origin = ws.headers.get("origin", "")
    if not origin or not re.match(r"^https://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$", origin):
        await ws.accept()
        await ws.close(code=4003, reason="Invalid origin")
        return

    # Support both query param token and cookie-based auth
    auth_token = token
    if not auth_token:
        auth_token = ws.cookies.get("access_token")
    if not auth_token:
        await ws.accept()
        await ws.close(code=4001, reason="Missing token")
        return

    user_id = await _authenticate(auth_token, ws)
    if not user_id:
        await ws.accept()
        await ws.close(code=4003, reason="Authentication failed")
        return

    await ws.accept()
    await register(user_id, ws)

    try:
        while True:
            # Keep the connection alive; client may send pings
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected: user=%s", user_id[:8])
    except Exception as exc:
        logger.warning("WebSocket error for user=%s: %s", user_id[:8], exc)
    finally:
        await unregister(user_id, ws)
