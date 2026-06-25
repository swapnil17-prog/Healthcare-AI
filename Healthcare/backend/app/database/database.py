import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


# Default to SQLite if DATABASE_URL is not provided
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./healthcare.db")

# SQLite needs check_same_thread=False to be accessed from multiple threads in FastAPI
connect_args = {}
create_engine_kwargs = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    # Use StaticPool for in-memory SQLite to prevent database being wiped between connections
    if "memory" in DATABASE_URL or DATABASE_URL == "sqlite://" or DATABASE_URL == "sqlite:///":
        from sqlalchemy.pool import StaticPool
        create_engine_kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, connect_args=connect_args, **create_engine_kwargs)

# Create a configured "SessionLocal" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create a Base class for models to inherit from
Base = declarative_base()

# Dependency to get db session in FastAPI endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
