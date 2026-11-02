"""ORM models (portable: SQLite offline mode, Postgres in deployment).
Departments and wards are versioned reference data in data/*.json (loaded by refdata.py).
Embeddings are stored as JSON float lists; on Postgres a pgvector migration can replace this column."""
import uuid
from datetime import datetime

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, Uuid)

from .core.types import JSONB, Embedding, StrList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .core import clock
from .core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return clock.now()


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    role: Mapped[str] = mapped_column(String(16), index=True)  # citizen|guest|officer|supervisor|admin
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(8), default="en")
    department_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    ward_ids: Mapped[list] = mapped_column(StrList, default=list)
    zone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    office_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    office_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)   # e.g. SL-KKP-0042
    type: Mapped[str] = mapped_column(String(16))
    label_en: Mapped[str] = mapped_column(String(160))
    ward_id: Mapped[str] = mapped_column(String(16), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class Translation(Base):
    __tablename__ = "translations"
    hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    target_lang: Mapped[str] = mapped_column(String(8), primary_key=True)
    text: Mapped[str] = mapped_column(Text)


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    title_en: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(32))
    ward_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(40), default="assigned")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Grievance(Base):
    __tablename__ = "grievances"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)  # GRV-2026-000123
    citizen_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    guest_pin_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    script: Mapped[str] = mapped_column(String(8), default="native")
    is_code_mixed: Mapped[bool] = mapped_column(Boolean, default=False)
    description_original: Mapped[str] = mapped_column(Text)        # restricted: admins only
    description_masked: Mapped[str] = mapped_column(Text)
    description_en: Mapped[str] = mapped_column(Text)
    title: Mapped[dict] = mapped_column(JSONB)
    formal_text: Mapped[dict] = mapped_column(JSONB)
    summary_en: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32))
    sub_department: Mapped[str | None] = mapped_column(String(80), nullable=True)
    secondary_departments: Mapped[list] = mapped_column(StrList, default=list)
    routing: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(40), default="registered")
    closure_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    priority_score: Mapped[int] = mapped_column(Integer, default=30)
    priority_factors: Mapped[list] = mapped_column(JSONB, default=list)
    priority_base: Mapped[dict] = mapped_column(JSONB, default=dict)  # inputs to recompute score
    is_emergency: Mapped[bool] = mapped_column(Boolean, default=False)
    emergency_confirmed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    hazards: Mapped[list] = mapped_column(StrList, default=list)
    vulnerable: Mapped[list] = mapped_column(StrList, default=list)
    sentiment: Mapped[str] = mapped_column(String(16), default="concerned")
    distress_score: Mapped[float] = mapped_column(Float, default=0.0)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[dict] = mapped_column(JSONB, default=dict)
    ward_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    asset_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    assigned_officer_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    sla_hours: Mapped[int] = mapped_column(Integer, default=96)
    sla_due_at: Mapped[datetime] = mapped_column(DateTime)
    eta_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delay_reason: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)
    support_count: Mapped[int] = mapped_column(Integer, default=1)
    related_ids: Mapped[list] = mapped_column(StrList, default=list)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    reopen_count: Mapped[int] = mapped_column(Integer, default=0)
    ai_verification: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    embedding: Mapped[list | None] = mapped_column(Embedding, nullable=True)
    embedding_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)  # semantic|lexical
    pipeline_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    media: Mapped[list["Media"]] = relationship(back_populates="grievance", order_by="Media.created_at")
    officer: Mapped["Profile | None"] = relationship(foreign_keys=[assigned_officer_id])

    __table_args__ = (
        Index("ix_grv_status_priority", "status", "priority"),
        Index("ix_grv_cat_ward_created", "category", "ward_id", "created_at"),
        Index("ix_grv_officer", "assigned_officer_id"),
    )


class Supporter(Base):
    __tablename__ = "grievance_supporters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"))
    user_key: Mapped[str] = mapped_column(String(64))  # profile id or guest session key
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    __table_args__ = (UniqueConstraint("grievance_id", "user_key", name="uq_supporter"),)


class Media(Base):
    __tablename__ = "media"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    grievance_id: Mapped[str | None] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), nullable=True, index=True)
    storage_path: Mapped[str] = mapped_column(String(300))
    uploaded_by_role: Mapped[str] = mapped_column(String(16))
    uploaded_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    purpose: Mapped[str] = mapped_column(String(24))
    quality: Mapped[dict] = mapped_column(JSONB, default=dict)
    ai: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    geo: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    phash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    grievance: Mapped["Grievance | None"] = relationship(back_populates="media")


class TimelineEvent(Base):
    __tablename__ = "timeline_events"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(32))
    actor_role: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    message_en: Mapped[str] = mapped_column(Text)
    message: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    internal: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash: Mapped[str] = mapped_column(String(64))
    __table_args__ = (UniqueConstraint("grievance_id", "seq", name="uq_event_seq"),)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    grievance_id: Mapped[str | None] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    sender: Mapped[str] = mapped_column(String(16))
    sender_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    text: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    state: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Appeal(Base):
    __tablename__ = "appeals"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"), index=True)
    reason: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16), default="filed")
    decision_note: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    decided_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), index=True)
    grievance_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    type: Mapped[str] = mapped_column(String(24))
    title: Mapped[dict] = mapped_column(JSONB)
    body: Mapped[dict] = mapped_column(JSONB)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class LiveEvent(Base):
    __tablename__ = "live_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audience: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    grievance_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AlertRow(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(10))
    title_en: Mapped[str] = mapped_column(String(300))
    detail_en: Mapped[str] = mapped_column(Text)
    ward_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    grievance_ids: Mapped[list] = mapped_column(StrList, default=list)
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class RoutingCorrection(Base):
    __tablename__ = "routing_corrections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id", ondelete="CASCADE"))
    from_department: Mapped[str] = mapped_column(String(32))
    to_department: Mapped[str] = mapped_column(String(32))
    text_original: Mapped[str] = mapped_column(Text)   # masked text only
    by_user: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AICall(Base):
    __tablename__ = "ai_calls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task: Mapped[str] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(64))
    latency_ms: Mapped[int] = mapped_column(Integer)
    ok: Mapped[bool] = mapped_column(Boolean)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False)
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)


class ModelVersion(Base):
    __tablename__ = "model_versions"
    version: Mapped[str] = mapped_column(String(32), primary_key=True)
    metrics: Mapped[dict] = mapped_column(JSONB)
    corrections_used: Mapped[int] = mapped_column(Integer, default=0)
    trained_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
