from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import AdminActionType, DeviceActionType


class AdminActionRequest(BaseModel):
    action_type: AdminActionType
    comment: str


class DeviceActionRequest(BaseModel):
    action_type: DeviceActionType
    comment: str


class SessionRevokeRequest(BaseModel):
    reason: str


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


class SecurityOverviewResponse(BaseModel):
    open_risk_events: int
    auth_required_events: int
    active_sessions: int
    step_up_sessions: int
    revoked_sessions_24h: int
    trusted_devices: int
    watch_devices: int
    step_up_devices: int
    blocked_devices: int
    pending_additional_auth: int
    anomalous_logins_24h: int
    concurrent_session_users: int


class SecurityDeviceResponse(BaseModel):
    id: str
    user_id: str
    user_email: str
    device_id: str
    display_name: str
    trust_status: str
    risk_score: int
    compromise_signals: int
    is_primary: bool
    last_ip_address: str
    last_region: str
    last_user_agent: str
    active_session_count: int
    created_at: datetime
    updated_at: datetime


class AuthSessionResponse(BaseModel):
    id: str
    user_id: str
    user_email: str
    device_id: str
    device_label: str
    device_trust_status: str
    ip_address: str
    region: str
    user_agent: str
    auth_strength: str
    status: str
    risk_score: int
    expires_at: datetime
    last_seen_at: datetime
    created_at: datetime
    revoked_reason: str | None


class SecurityPolicyResponse(BaseModel):
    policy_code: str
    title: str
    layer: str
    mode: str
    status: str
    threshold: str
    description: str


class IncidentTimelineEntryResponse(BaseModel):
    timestamp: datetime
    category: str
    severity: str
    title: str
    detail: str
    source_type: str
    source_id: str | None
