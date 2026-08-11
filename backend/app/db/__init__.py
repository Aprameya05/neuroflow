"""
Async SQLAlchemy engine + session factory.

Usage in route handlers:
    async with AsyncSessionLocal() as db:
        db.add(record)
        await db.commit()

Usage with FastAPI Depends:
    @router.get("/")
    async def handler(db: AsyncSession = Depends(get_db)):
        ...
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
