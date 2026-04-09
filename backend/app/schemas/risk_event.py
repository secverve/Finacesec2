from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import AdminActionType, RiskDecision, RiskEventStatus, RiskSeverity


class RuleHitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_code: str
    rule_name: str
    description: str
    score: int
    severity: RiskSeverity
    reason: str
    created_at: datetime


class AdminActionHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    admin_user_id: str
    action_type: AdminActionType
    comment: str
    created_at: datetime


class RiskEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    order_id: str | None
    total_score: int
    severity: RiskSeverity
    decision: RiskDecision
    status: RiskEventStatus
    summary: str
    symbol: str
    ip_address: str
    region: str
    device_id: str
    created_at: datetime


class RiskEventDetailResponse(RiskEventResponse):
    rule_hits: list[RuleHitResponse]
    admin_actions: list[AdminActionHistoryResponse]

