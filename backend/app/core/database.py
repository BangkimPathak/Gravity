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

    # Tables are initialized without pre-seeded demo accounts
    pass
