from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AdditionalAuthStatus
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AdditionalAuthRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "additional_auth_requests"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    risk_event_id: Mapped[str] = mapped_column(ForeignKey("risk_events.id"), index=True)
    status: Mapped[AdditionalAuthStatus] = mapped_column(
        Enum(AdditionalAuthStatus), default=AdditionalAuthStatus.PENDING
    )
    channel: Mapped[str] = mapped_column(String(32), default="APP")
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    risk_event = relationship("RiskEvent", back_populates="additional_auth_requests")

