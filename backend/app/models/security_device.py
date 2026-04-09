from datetime import UTC, datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import DeviceTrustStatus
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SecurityDevice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "security_devices"
    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_security_device_user_device"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    display_name: Mapped[str] = mapped_column(String(120), default="등록 단말")
    fingerprint_hash: Mapped[str] = mapped_column(String(128), index=True)
    trust_status: Mapped[DeviceTrustStatus] = mapped_column(Enum(DeviceTrustStatus), default=DeviceTrustStatus.WATCH)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    compromise_signals: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    first_seen_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    last_seen_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    last_ip_address: Mapped[str] = mapped_column(String(64))
    last_region: Mapped[str] = mapped_column(String(16))
    last_user_agent: Mapped[str] = mapped_column(String(255), default="")

    user = relationship("User", back_populates="security_devices")
    sessions = relationship("AuthSession", back_populates="security_device")
