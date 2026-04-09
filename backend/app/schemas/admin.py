from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import AdminActionType


class AdminActionRequest(BaseModel):
    action_type: AdminActionType
    comment: str


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor_user_id: str | None
    event_type: str
    target_type: str
    target_id: str | None
    ip_address: str
    region: str
    device_id: str
    payload: dict
    created_at: datetime


class AdminActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    risk_event_id: str
    admin_user_id: str
    action_type: AdminActionType
    comment: str
    created_at: datetime


class RuleCatalogResponse(BaseModel):
    rule_code: str
    rule_name: str
    description: str
    score: int
    severity: str
