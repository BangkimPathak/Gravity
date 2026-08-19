import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.conversation import Conversation, Participant
from app.models.message import Message
from app.schemas.conversation import ConversationCreate, ConversationOut, ParticipantOut
from app.schemas.message import MessageOut
from app.schemas.user import UserOut
from app.api.auth import get_current_user
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/conversations", tags=["Conversations"])

@router.get("", response_model=List[ConversationOut])
async def list_user_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves all active conversations for the authenticated user, with last messages and unread counts."""
    # Find all conversation IDs where current user is a participant
    part_query = select(Participant.conversation_id).where(Participant.user_id == current_user.id)
    part_result = await db.execute(part_query)
    conv_ids = [r[0] for r in part_result.fetchall()]

    if not conv_ids:
        return []

    # Fetch conversations with participants
    convs_query = (
        select(Conversation)
        .where(Conversation.id.in_(conv_ids))
        .options(selectinload(Conversation.participants).joinedload(Participant.user))
        .order_by(Conversation.updated_at.desc())
    )
    convs_result = await db.execute(convs_query)
    conversations = convs_result.scalars().all()

    response_list = []
    for conv in conversations:
        # Fetch last message
        last_msg_query = (
            select(Message)
            .where(Message.conversation_id == conv.id)
            .options(selectinload(Message.sender))
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg_res = await db.execute(last_msg_query)
        last_msg = last_msg_res.scalars().first()

        # Find current user's participant record for unread count
        user_part = next((p for p in conv.participants if p.user_id == current_user.id), None)
        unread_count = 0
        if user_part:
            unread_query = select(func.count(Message.id)).where(
                Message.conversation_id == conv.id,
                Message.sender_id != current_user.id,
                Message.status != "read"
            )
            unread_res = await db.execute(unread_query)
            unread_count = unread_res.scalar() or 0

        # Calculate display title and display avatar
        display_title = conv.title
        display_avatar = conv.avatar_url
        is_online = False
        last_seen = None

        if not conv.is_group:
            # 1-on-1 chat: display other participant's name and avatar
            other_part = next((p for p in conv.participants if p.user_id != current_user.id), None)
            if other_part and other_part.user:
                display_title = other_part.user.username
                display_avatar = other_part.user.avatar_url
                is_online = ws_manager.is_user_online(other_part.user.id)
                last_seen = ws_manager.get_last_seen(other_part.user.id) or other_part.user.last_seen
            else:
                display_title = "Saved Messages"
                display_avatar = current_user.avatar_url

        conv_out = ConversationOut(
            id=conv.id,
            is_group=conv.is_group,
            title=conv.title,
            avatar_url=conv.avatar_url,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            participants=[
                ParticipantOut(
                    id=p.id,
                    conversation_id=p.conversation_id,
                    user_id=p.user_id,
                    role=p.role,
                    joined_at=p.joined_at,
                    last_read_message_id=p.last_read_message_id,
                    user=UserOut.model_validate(p.user) if p.user else None
                )
                for p in conv.participants
            ],
            last_message=MessageOut.model_validate(last_msg) if last_msg else None,
            unread_count=unread_count,
            display_title=display_title,
            display_avatar=display_avatar,
            is_online=is_online,
            last_seen=last_seen
        )
        response_list.append(conv_out)

    return response_list

@router.post("/direct", response_model=ConversationOut)
async def create_or_get_direct_conversation(
    target_user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves an existing direct chat with the target user, or creates a new one."""
    target_uid = int(target_user_id) if str(target_user_id).isdigit() else target_user_id
    if target_uid == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot start a direct conversation with yourself")

    # Verify target user exists
    t_res = await db.execute(select(User).where(User.id == target_uid))
    target_user = t_res.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    # Check for existing 1-on-1 conversation
    query = (
        select(Conversation)
        .join(Participant, Participant.conversation_id == Conversation.id)
        .where(
            Conversation.is_group == False,
            Participant.user_id.in_([current_user.id, target_user.id])
        )
        .group_by(Conversation.id)
        .having(func.count(Participant.user_id) == 2)
        .options(selectinload(Conversation.participants).joinedload(Participant.user))
    )
    existing_res = await db.execute(query)
    existing_conv = existing_res.scalars().first()

    if existing_conv:
        return ConversationOut(
            id=existing_conv.id,
            is_group=False,
            title=None,
            avatar_url=None,
            created_at=existing_conv.created_at,
            updated_at=existing_conv.updated_at,
            participants=[
                ParticipantOut(
                    id=p.id,
                    conversation_id=p.conversation_id,
                    user_id=p.user_id,
                    role=p.role,
                    joined_at=p.joined_at,
                    user=UserOut.model_validate(p.user) if p.user else None
                )
                for p in existing_conv.participants
            ],
            display_title=target_user.username,
            display_avatar=target_user.avatar_url,
            is_online=ws_manager.is_user_online(target_user.id),
            last_seen=ws_manager.get_last_seen(target_user.id) or target_user.last_seen
        )

    # Create new direct conversation
    new_conv_id = f"c-{uuid.uuid4().hex[:12]}"
    new_conv = Conversation(
        id=new_conv_id,
        is_group=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(new_conv)
    await db.flush()

    p1 = Participant(conversation_id=new_conv_id, user_id=current_user.id, role="member")
    p2 = Participant(conversation_id=new_conv_id, user_id=target_user.id, role="member")
    db.add_all([p1, p2])
    await db.commit()

    # Broadcast conversation creation event to target user
    await ws_manager.broadcast_to_users(
        [target_user_id, current_user.id],
        "conversation_created",
        {"conversation_id": new_conv_id, "initiator_id": current_user.id}
    )

    return ConversationOut(
        id=new_conv.id,
        is_group=False,
        title=None,
        avatar_url=None,
        created_at=new_conv.created_at,
        updated_at=new_conv.updated_at,
        participants=[
            ParticipantOut(id=0, conversation_id=new_conv.id, user_id=current_user.id, role="member", joined_at=new_conv.created_at, user=UserOut.model_validate(current_user)),
            ParticipantOut(id=0, conversation_id=new_conv.id, user_id=target_user.id, role="member", joined_at=new_conv.created_at, user=UserOut.model_validate(target_user))
        ],
        display_title=target_user.username,
        display_avatar=target_user.avatar_url,
        is_online=ws_manager.is_user_online(target_user.id),
        last_seen=ws_manager.get_last_seen(target_user.id) or target_user.last_seen
    )

@router.post("/group", response_model=ConversationOut)
async def create_group_conversation(
    group_in: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new group conversation with members."""
    if not group_in.title or len(group_in.title.strip()) == 0:
        raise HTTPException(status_code=400, detail="Group title is required")

    unique_participants = set(group_in.participant_ids)
    unique_participants.add(current_user.id)

    new_conv_id = f"c-grp-{uuid.uuid4().hex[:12]}"
    new_conv = Conversation(
        id=new_conv_id,
        is_group=True,
        title=group_in.title.strip(),
        avatar_url=group_in.avatar_url or f"https://api.dicebear.com/7.x/identicon/svg?seed={group_in.title}",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(new_conv)
    await db.flush()

    participants_to_add = []
    for uid in unique_participants:
        role = "admin" if uid == current_user.id else "member"
        participants_to_add.append(
            Participant(conversation_id=new_conv_id, user_id=uid, role=role)
        )
    db.add_all(participants_to_add)
    await db.commit()

    # Broadcast group creation to all members
    await ws_manager.broadcast_to_users(
        list(unique_participants),
        "group_created",
        {"conversation_id": new_conv_id, "title": new_conv.title}
    )

    return ConversationOut(
        id=new_conv.id,
        is_group=True,
        title=new_conv.title,
        avatar_url=new_conv.avatar_url,
        created_at=new_conv.created_at,
        updated_at=new_conv.updated_at,
        participants=[],
        display_title=new_conv.title,
        display_avatar=new_conv.avatar_url,
        is_online=False
    )
