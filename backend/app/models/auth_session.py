from datetime import UTC, datetime

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AuthStrength, SessionStatus
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AuthSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    security_device_id: Mapped[str | None] = mapped_column(ForeignKey("security_devices.id"), nullable=True, index=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    ip_address: Mapped[str] = mapped_column(String(64))
    region: Mapped[str] = mapped_column(String(16))
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    auth_strength: Mapped[AuthStrength] = mapped_column(Enum(AuthStrength), default=AuthStrength.PASSWORD_ONLY)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.ACTIVE)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    expires_at: Mapped[datetime] = mapped_column(index=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user = relationship("User", back_populates="auth_sessions")
    security_device = relationship("SecurityDevice", back_populates="sessions")
