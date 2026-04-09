from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RiskSeverity
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RuleHit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "rule_hits"

    risk_event_id: Mapped[str] = mapped_column(ForeignKey("risk_events.id"), index=True)
    rule_code: Mapped[str] = mapped_column(String(64), index=True)
    rule_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(255))
    score: Mapped[int] = mapped_column()
    severity: Mapped[RiskSeverity] = mapped_column(Enum(RiskSeverity))
    reason: Mapped[str] = mapped_column(String(255))

    risk_event = relationship("RiskEvent", back_populates="rule_hits")

