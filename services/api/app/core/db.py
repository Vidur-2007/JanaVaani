"""SQLAlchemy engine + session. SQLite by default (offline mode); Postgres via DATABASE_URL."""
import logging
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    kw = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kw["connect_args"] = {"check_same_thread": False}
    eng = create_engine(url, **kw)
    if url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _fk(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()
    return eng


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_engine(url: str):
    """Rebind (used by tests)."""
    global engine
    engine = _make_engine(url)
    SessionLocal.configure(bind=engine)
    return engine


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def create_all():
    """SQLite offline mode: create the tables. Postgres: the schema belongs to supabase/migrations (RLS, PostGIS,
    triggers, realtime grants), so tables are never created here; missing ones are reported instead."""
    from .. import models  # noqa: F401
    if engine.dialect.name != "postgresql":
        Base.metadata.create_all(engine)
        return
    from sqlalchemy import inspect
    missing = sorted(set(Base.metadata.tables) - set(inspect(engine).get_table_names()))
    if missing:
        logging.getLogger("janavaani").error("database is missing tables %s: run ml/apply_migrations.py", missing)
