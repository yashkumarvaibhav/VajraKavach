"""
VajraKavach — Database Setup
Async SQLAlchemy engine and session management for PostgreSQL.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """Dependency: yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables (for development). Use Alembic in production."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns that may not exist on older databases
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS force_reauth_at TIMESTAMP"))
        await conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS has_left BOOLEAN DEFAULT FALSE"))
        # Backfill created_by for groups that have NULL (pick earliest member)
        await conn.execute(
            text("""
                UPDATE conversations c
                SET created_by = sub.user_id
                FROM (
                    SELECT DISTINCT ON (conversation_id) conversation_id, user_id
                    FROM conversation_members
                    ORDER BY conversation_id, joined_at ASC
                ) sub
                WHERE c.id = sub.conversation_id
                  AND c.is_group = TRUE
                  AND c.created_by IS NULL
            """)
        )
