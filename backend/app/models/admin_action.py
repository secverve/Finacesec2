from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AdminActionType
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AdminAction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "admin_actions"

    risk_event_id: Mapped[str] = mapped_column(ForeignKey("risk_events.id"), index=True)
    admin_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action_type: Mapped[AdminActionType] = mapped_column(Enum(AdminActionType))
    comment: Mapped[str] = mapped_column(String(255))

    risk_event = relationship("RiskEvent", back_populates="admin_actions")
    admin_user = relationship("User", back_populates="admin_actions")

