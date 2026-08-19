from datetime import datetime, timezone
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, desc
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.conversation import Conversation, Participant
from app.models.message import Message
from app.schemas.message import MessageOut, MessageCreate
from app.schemas.user import UserOut
from app.api.auth import get_current_user
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/messages", tags=["Messages"])

@router.get("/{conversation_id}", response_model=List[MessageOut])
async def get_conversation_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=100),
    before_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves paginated message history for a conversation."""
    # Check participation
    part_query = select(Participant).where(
        Participant.conversation_id == conversation_id,
        Participant.user_id == current_user.id
    )
    part_res = await db.execute(part_query)
    if not part_res.scalars().first():
        raise HTTPException(status_code=403, detail="You are not a participant of this conversation")

    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .options(selectinload(Message.sender))
    )

    if before_id:
        target_msg_res = await db.execute(select(Message).where(Message.id == before_id))
        target_msg = target_msg_res.scalars().first()
        if target_msg:
            query = query.where(Message.created_at < target_msg.created_at)

    query = query.order_by(Message.created_at.desc()).limit(limit)
    res = await db.execute(query)
    messages = res.scalars().all()
    # Return in chronological order
    return [MessageOut.model_validate(m) for m in reversed(messages)]

@router.post("/{conversation_id}/read")
async def mark_conversation_as_read(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Marks all unread messages sent by others in this conversation as 'read'."""
    # Find all unread messages not sent by current user
    query = (
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id != current_user.id,
            Message.status != "read"
        )
    )
    res = await db.execute(query)
    unread_messages = res.scalars().all()

    if not unread_messages:
        return {"status": "ok", "updated_count": 0}

    sender_ids = set()
    updated_ids = []
    for msg in unread_messages:
        msg.status = "read"
        sender_ids.add(msg.sender_id)
        updated_ids.append(msg.id)

    # Update participant last_read_message_id
    if updated_ids:
        part_query = select(Participant).where(
            Participant.conversation_id == conversation_id,
            Participant.user_id == current_user.id
        )
        part_res = await db.execute(part_query)
        user_part = part_res.scalars().first()
        if user_part:
            user_part.last_read_message_id = updated_ids[-1]

    await db.commit()

    # Notify senders via WebSocket
    for sender_id in sender_ids:
        await ws_manager.send_personal_message(
            sender_id,
            {
                "event": "status_update",
                "data": {
                    "conversation_id": conversation_id,
                    "message_ids": updated_ids,
                    "status": "read",
                    "reader_id": current_user.id
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )

    return {"status": "ok", "updated_count": len(updated_ids)}
