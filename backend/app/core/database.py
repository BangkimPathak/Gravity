import uuid
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from sqlalchemy import select, text
from sqlalchemy.pool import NullPool
from app.core.config import settings

# Engine configuration
engine_kwargs = {
    "echo": False,
    "future": True,
}
if "mysql" in settings.DATABASE_URL or "sqlite" in settings.DATABASE_URL:
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an asynchronous database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    """Initializes the database schema and seeds initial demo data if needed."""
    from app.models.user import User
    from app.models.conversation import Conversation, Participant
    from app.models.message import Message
    from app.models.otp import OTP
    from app.core.security import get_password_hash

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # SQLite / MySQL safe column migrations
        for col_name, col_type in [
            ("birthday", "VARCHAR(50)"),
            ("full_name", "VARCHAR(100)"),
            ("region", "VARCHAR(100)"),
            ("role", "VARCHAR(50)"),
            ("gender", "VARCHAR(20)"),
            ("age", "INTEGER"),
            ("address", "TEXT")
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
            except Exception:
                pass

    # Check if seed data should be inserted
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).limit(1))
        existing_user = result.scalars().first()
        if not existing_user:
            demo_users = [
                User(
                    id=1,
                    username="sarah_connor",
                    full_name="Sarah Connor",
                    phone_or_email="sarah@gravity.chat",
                    hashed_password=get_password_hash("password123"),
                    avatar_url="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
                    status_bio="Available for async collabs 💬",
                    birthday="1992-06-12",
                    role="Staff"
                ),
                User(
                    id=2,
                    username="alex_rivers",
                    full_name="Alex Rivers",
                    phone_or_email="alex@gravity.chat",
                    hashed_password=get_password_hash("password123"),
                    avatar_url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
                    status_bio="Building the future of real-time web 🚀",
                    birthday="1990-01-01",
                    role="Doctor"
                ),
                User(
                    id=3,
                    username="david_kim",
                    full_name="David Kim",
                    phone_or_email="david@gravity.chat",
                    hashed_password=get_password_hash("password123"),
                    avatar_url="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
                    status_bio="Coding in Python & Rust ⚡",
                    birthday="1995-11-20",
                    role="Patient"
                ),
                User(
                    id=4,
                    username="elena_rostova",
                    full_name="Elena Rostova",
                    phone_or_email="elena@gravity.chat",
                    hashed_password=get_password_hash("password123"),
                    avatar_url="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150",
                    status_bio="Designing beautiful interfaces 🎨",
                    birthday="1994-08-30",
                    role="Member"
                )
            ]
            session.add_all(demo_users)
            await session.flush()
            
            # Direct chat between Alex and Sarah
            conv1 = Conversation(id="c-alex-sarah", is_group=False)
            session.add(conv1)
            session.add_all([
                Participant(conversation_id="c-alex-sarah", user_id=2, role="member"),
                Participant(conversation_id="c-alex-sarah", user_id=1, role="member")
            ])
            session.add_all([
                Message(id="m-001", conversation_id="c-alex-sarah", sender_id=1, content="Hey Alex! Have you reviewed the new WebSocket architecture?", message_type="text", status="read"),
                Message(id="m-002", conversation_id="c-alex-sarah", sender_id=2, content="Yes! The latency metrics are looking incredible. Zero dropped frames.", message_type="text", status="read"),
                Message(id="m-003", conversation_id="c-alex-sarah", sender_id=1, content="Awesome! Let us test group channels next.", message_type="text", status="delivered")
            ])
            
            # Group chat: Engineering Team
            conv2 = Conversation(
                id="c-gravity-core-eng",
                is_group=True,
                title="Gravity Core Engineering 🛰️",
                avatar_url="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150"
            )
            session.add(conv2)
            session.add_all([
                Participant(conversation_id="c-gravity-core-eng", user_id=2, role="admin"),
                Participant(conversation_id="c-gravity-core-eng", user_id=1, role="member"),
                Participant(conversation_id="c-gravity-core-eng", user_id=3, role="member"),
                Participant(conversation_id="c-gravity-core-eng", user_id=4, role="member")
            ])
            session.add_all([
                Message(id="m-004", conversation_id="c-gravity-core-eng", sender_id=2, content="Welcome everyone to Project Gravity development channel!", message_type="text", status="read"),
                Message(id="m-005", conversation_id="c-gravity-core-eng", sender_id=3, content="MySQL 8.0 schema and Redis Pub/Sub integration is live.", message_type="text", status="read"),
                Message(id="m-006", conversation_id="c-gravity-core-eng", sender_id=4, content="Frontend UI templates are styled with pure CSS variables and dark mode.", message_type="text", status="read")
            ])
            
            await session.commit()
