from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RiskDecision, RiskEventStatus, RiskSeverity
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RiskEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "risk_events"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id"), nullable=True, index=True, unique=True)
    total_score: Mapped[int] = mapped_column(default=0)
    severity: Mapped[RiskSeverity] = mapped_column(Enum(RiskSeverity))
    decision: Mapped[RiskDecision] = mapped_column(Enum(RiskDecision))
    status: Mapped[RiskEventStatus] = mapped_column(Enum(RiskEventStatus))
    summary: Mapped[str] = mapped_column(String(255))
    ip_address: Mapped[str] = mapped_column(String(64))
    region: Mapped[str] = mapped_column(String(16))
    device_id: Mapped[str] = mapped_column(String(128))
    symbol: Mapped[str] = mapped_column(String(12))

    user = relationship("User", back_populates="risk_events")
    order = relationship("Order", back_populates="risk_event")
    rule_hits = relationship("RuleHit", back_populates="risk_event", cascade="all, delete-orphan")
    admin_actions = relationship("AdminAction", back_populates="risk_event")
    additional_auth_requests = relationship(
        "AdditionalAuthRequest", back_populates="risk_event", cascade="all, delete-orphan"
    )
