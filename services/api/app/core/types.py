"""Portable column types: Postgres-native on Supabase (jsonb, text[], vector(384), timestamptz), JSON on SQLite offline mode."""
import os
from datetime import timezone

from sqlalchemy import JSON, DateTime, Float, Text
from sqlalchemy.dialects import postgresql
from sqlalchemy.types import TypeDecorator

EMBED_DIM = 384
JSONB = JSON().with_variant(postgresql.JSONB(), "postgresql")


class UTCDateTime(TypeDecorator):
    """timestamptz on Postgres, plain DateTime on SQLite. The app always sees naive UTC (see clock.now())."""
    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=dialect.name == "postgresql"))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.replace(tzinfo=timezone.utc) if dialect.name == "postgresql" else value

    def process_result_value(self, value, dialect):
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)


class StrList(TypeDecorator):
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.ARRAY(Text))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value, dialect):
        return list(value) if value is not None else []

    def process_result_value(self, value, dialect):
        return list(value) if value is not None else []


class Embedding(TypeDecorator):
    """vector(384) via pgvector on Postgres; JSON list on SQLite. PG_EMBEDDING_TYPE=array maps to float8[]
    (only for Postgres instances without the pgvector extension, e.g. CI)."""
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            if os.environ.get("PG_EMBEDDING_TYPE") == "array":
                return dialect.type_descriptor(postgresql.ARRAY(Float))
            from pgvector.sqlalchemy import Vector
            return dialect.type_descriptor(Vector(EMBED_DIM))
        return dialect.type_descriptor(JSON())

    def process_result_value(self, value, dialect):
        return [float(x) for x in value] if value is not None else None
