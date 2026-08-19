import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import decode_access_token
from app.models.user import User
from app.models.conversation import Conversation, Participant
from app.models.message import Message
from app.schemas.message import MessageOut
from app.schemas.user import UserOut
from app.services.websocket_manager import ws_manager

logger = logging.getLogger("gravity.chat_ws")
router = APIRouter(tags=["WebSocket"])

async def get_user_from_token(token: str) -> Optional[User]:
    """Validates JWT token and retrieves user model."""
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user_id_raw = payload["sub"]
    user_id = int(user_id_raw) if str(user_id_raw).isdigit() else user_id_raw
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalars().first()

@router.websocket("/ws/chat")
async def chat_websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    Core WebSocket endpoint for bidirectional real-time messaging,
    typing presence, read receipts, and heartbeat pings.
    """
    user: Optional[User] = None
    if token:
        user = await get_user_from_token(token)

    if not user:
        # Await auth event in first message
        await websocket.accept()
        try:
            raw_msg = await websocket.receive_text()
            data = json.loads(raw_msg)
            if data.get("event") == "auth":
                auth_token = data.get("data", {}).get("token")
                user = await get_user_from_token(auth_token)
            if not user:
                await websocket.send_text(json.dumps({"event": "error", "data": {"message": "Unauthorized"}}))
                await websocket.close(code=4001)
                return
        except Exception:
            await websocket.close(code=4001)
            return
    else:
        await ws_manager.connect(user.id, websocket)

    user_id = user.id
    try:
        # Send initial connection success with server timestamp
        await websocket.send_text(json.dumps({
            "event": "connected",
            "data": {
                "user_id": user_id,
                "username": user.username,
                "server_time": datetime.now(timezone.utc).isoformat()
            }
        }))

        while True:
            raw_data = await websocket.receive_text()
            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            event_type = payload.get("event")
            data = payload.get("data", {})

            # 1. Heartbeat Ping / Pong
            if event_type in ("ping", "heartbeat"):
                await websocket.send_text(json.dumps({
                    "event": "pong",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }))
                continue

            # 2. Message Send Event
            elif event_type == "message_send":
                conversation_id = data.get("conversation_id")
                content = data.get("content")
                message_type = data.get("message_type", "text")
                media_url = data.get("media_url")
                client_temp_id = data.get("client_temp_id")

                if not conversation_id or (not content and not media_url):
                    continue

                async with AsyncSessionLocal() as session:
                    # Verify sender is in conversation
                    part_res = await session.execute(
                        select(Participant.user_id).where(Participant.conversation_id == conversation_id)
                    )
                    participant_rows = part_res.fetchall()
                    participant_ids = [r[0] for r in participant_rows]

                    if user_id not in participant_ids:
                        await websocket.send_text(json.dumps({
                            "event": "error",
                            "data": {"message": "Forbidden from sending message to this conversation"}
                        }))
                        continue

                    # Check if any recipient is currently connected
                    recipients_online = any(
                        ws_manager.is_user_online(pid) for pid in participant_ids if pid != user_id
                    )
                    initial_status = "delivered" if recipients_online else "sent"

                    # Persist message
                    msg_id = str(uuid.uuid4())
                    msg_time = datetime.now(timezone.utc)
                    new_msg = Message(
                        id=msg_id,
                        conversation_id=conversation_id,
                        sender_id=user_id,
                        content=content,
                        message_type=message_type,
                        media_url=media_url,
                        status=initial_status,
                        created_at=msg_time
                    )
                    session.add(new_msg)

                    # Update conversation timestamp
                    conv_res = await session.execute(
                        select(Conversation).where(Conversation.id == conversation_id)
                    )
                    conv = conv_res.scalars().first()
                    if conv:
                        conv.updated_at = msg_time

                    await session.commit()

                    sender_out = UserOut.model_validate(user)
                    msg_out_dict = {
                        "id": msg_id,
                        "conversation_id": conversation_id,
                        "sender_id": user_id,
                        "content": content,
                        "message_type": message_type,
                        "media_url": media_url,
                        "status": initial_status,
                        "created_at": msg_time.isoformat(),
                        "sender": sender_out.model_dump(mode="json"),
                        "client_temp_id": client_temp_id
                    }

                # Acknowledge to sender
                await websocket.send_text(json.dumps({
                    "event": "message_ack",
                    "data": msg_out_dict
                }))

                # Broadcast to other participants
                other_participants = [pid for pid in participant_ids if pid != user_id]
                if other_participants:
                    await ws_manager.broadcast_to_users(
                        other_participants,
                        "message_receive",
                        msg_out_dict
                    )

            # 3. Typing Indicators
            elif event_type in ("typing_start", "typing_stop"):
                conversation_id = data.get("conversation_id")
                if conversation_id:
                    async with AsyncSessionLocal() as session:
                        part_res = await session.execute(
                            select(Participant.user_id).where(Participant.conversation_id == conversation_id)
                        )
                        other_participants = [r[0] for r in part_res.fetchall() if r[0] != user_id]

                    if other_participants:
                        await ws_manager.broadcast_to_users(
                            other_participants,
                            event_type,
                            {
                                "conversation_id": conversation_id,
                                "user_id": user_id,
                                "username": user.username
                            }
                        )

            # 4. Status Update (e.g. Read Receipts)
            elif event_type == "status_update":
                conversation_id = data.get("conversation_id")
                status_val = data.get("status")  # 'read' | 'delivered'
                message_ids = data.get("message_ids", [])

                if conversation_id and status_val == "read":
                    async with AsyncSessionLocal() as session:
                        # Find messages in this conversation not sent by user
                        query = select(Message).where(
                            Message.conversation_id == conversation_id,
                            Message.sender_id != user_id
                        )
                        if message_ids:
                            query = query.where(Message.id.in_(message_ids))
                        else:
                            query = query.where(Message.status != "read")

                        res = await session.execute(query)
                        msgs = res.scalars().all()
                        senders_to_notify = set()
                        updated_msg_ids = []

                        for m in msgs:
                            m.status = "read"
                            senders_to_notify.add(m.sender_id)
                            updated_msg_ids.append(m.id)

                        await session.commit()

                    for sender_id in senders_to_notify:
                        await ws_manager.send_personal_message(
                            sender_id,
                            {
                                "event": "status_update",
                                "data": {
                                    "conversation_id": conversation_id,
                                    "message_ids": updated_msg_ids,
                                    "status": "read",
                                    "reader_id": user_id
                                },
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                        )

    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id, websocket)
    except Exception as exc:
        logger.error(f"WebSocket unhandled error for user {user_id}: {exc}")
        await ws_manager.disconnect(user_id, websocket)
