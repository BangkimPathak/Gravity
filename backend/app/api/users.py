from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, cast, String, case

from app.core.database import get_db
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate
from app.api.auth import get_current_user
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/search", response_model=List[UserOut])
async def search_users(
    q: str = Query(..., min_length=1, description="Search term for user ID, username, email, or full name"),
    include_self: bool = Query(False, description="Whether to include the current user in results"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Searches the database for users by:
    - User ID (exact number or matching ID string)
    - Email address or phone number (case-insensitive)
    - Username (case-insensitive, '@' prefix handled)
    - Full name (case-insensitive)
    """
    raw_query = q.strip()
    clean_q = raw_query
    
    # Strip common search prefixes like '@', '#', 'id:', 'uid:'
    if clean_q.startswith("@") or clean_q.startswith("#"):
        clean_q = clean_q[1:].strip()
    elif clean_q.lower().startswith("id:"):
        clean_q = clean_q[3:].strip()
    elif clean_q.lower().startswith("uid:"):
        clean_q = clean_q[4:].strip()

    if not clean_q:
        clean_q = raw_query

    search_term = f"%{clean_q}%"
    prefix_term = f"{clean_q}%"

    # Base search filters across ID, Email, Username, Full Name
    search_conditions = [
        User.username.ilike(search_term),
        User.phone_or_email.ilike(search_term),
        User.full_name.ilike(search_term),
        cast(User.id, String).ilike(search_term)
    ]

    # If numeric, check exact integer ID as well
    if clean_q.isdigit():
        try:
            search_conditions.append(User.id == int(clean_q))
        except (ValueError, OverflowError):
            pass

    where_clauses = [or_(*search_conditions)]
    if not include_self:
        where_clauses.append(User.id != current_user.id)

    # Smart priority ordering:
    # Priority 1: Exact ID match, exact username match, or exact email match
    # Priority 2: Username / Full Name / Email starts with query
    # Priority 3: Other substring matches
    is_num = clean_q.isdigit()
    exact_id_cond = (User.id == int(clean_q)) if is_num else False
    
    order_priority = case(
        (exact_id_cond, 1),
        (User.username.ilike(clean_q), 1),
        (User.phone_or_email.ilike(clean_q), 1),
        (User.username.ilike(prefix_term), 2),
        (User.full_name.ilike(prefix_term), 2),
        (User.phone_or_email.ilike(prefix_term), 2),
        else_=3
    )

    query_stmt = (
        select(User)
        .where(and_(*where_clauses))
        .order_by(order_priority, User.username.asc())
        .limit(30)
    )

    result = await db.execute(query_stmt)
    users = result.scalars().all()

    out = []
    for u in users:
        u_out = UserOut.model_validate(u)
        u_out.is_online = ws_manager.is_user_online(u.id)
        out.append(u_out)

    return out

@router.get("/directory", response_model=List[UserOut])
async def list_user_directory(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists available contacts for starting new conversations."""
    result = await db.execute(
        select(User).where(User.id != current_user.id).order_by(User.username.asc()).limit(50)
    )
    users = result.scalars().all()
    out = []
    for u in users:
        u_out = UserOut.model_validate(u)
        u_out.is_online = ws_manager.is_user_online(u.id)
        out.append(u_out)
    return out

@router.get("/{user_id}", response_model=UserOut)
async def get_user_profile(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves a user's public profile and live presence."""
    uid = int(user_id) if str(user_id).isdigit() else user_id
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    u_out = UserOut.model_validate(user)
    u_out.is_online = ws_manager.is_user_online(user.id)
    return u_out

@router.put("/me", response_model=UserOut)
async def update_my_profile(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Updates the authenticated user's profile information."""
    if user_in.username:
        # Check uniqueness
        existing = await db.execute(
            select(User).where(User.username == user_in.username, User.id != current_user.id)
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Username already in use")
        current_user.username = user_in.username

    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    if user_in.birthday is not None:
        current_user.birthday = user_in.birthday
    if user_in.region is not None:
        current_user.region = user_in.region
    if user_in.avatar_url is not None:
        current_user.avatar_url = user_in.avatar_url
    if user_in.status_bio is not None:
        current_user.status_bio = user_in.status_bio

    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)
