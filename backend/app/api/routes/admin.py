from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_admin_user, get_request_context
from app.db.session import get_db
from app.fds.types import RequestContext
from app.models.user import User
from app.schemas.admin import (
    AdminActionRequest,
    AdminActionResponse,
    AuditLogResponse,
    AuthSessionResponse,
    DeviceActionRequest,
    IncidentTimelineEntryResponse,
    RuleCatalogResponse,
    SecurityDeviceResponse,
    SecurityOverviewResponse,
    SecurityPolicyResponse,
    SessionRevokeRequest,
)
from app.schemas.common import MessageResponse
from app.schemas.lab import LabScenarioExecutionResponse, LabScenarioResponse
from app.schemas.risk_event import RiskEventDetailResponse, RiskEventResponse
from app.services.admin_service import (
    apply_admin_action,
    apply_device_action,
    get_incident_timeline,
    get_risk_event_detail,
    get_security_overview_view,
    list_audit_logs,
    list_auth_sessions_view,
    list_risk_events,
    list_rule_catalog,
    list_security_devices_view,
    list_security_policy_catalog,
    revoke_auth_session,
)
from app.services.lab_service import execute_lab_scenario, list_lab_scenarios

router = APIRouter()


@router.get("/risk-events", response_model=list[RiskEventResponse])
def risk_events(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list:
    del admin_user
    return list_risk_events(db)


@router.get("/risk-events/{risk_event_id}", response_model=RiskEventDetailResponse)
def risk_event_detail(
    risk_event_id: str,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> object:
    del admin_user
    risk_event = get_risk_event_detail(db, risk_event_id)
    if risk_event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk event not found")
    return risk_event


@router.get("/risk-events/{risk_event_id}/timeline", response_model=list[IncidentTimelineEntryResponse])
def risk_event_timeline(
    risk_event_id: str,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list:
    del admin_user
    return get_incident_timeline(db, risk_event_id)


@router.post("/risk-events/{risk_event_id}/actions", response_model=AdminActionResponse)
def handle_risk_event(
    risk_event_id: str,
    payload: AdminActionRequest,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> object:
    action = apply_admin_action(db, risk_event_id, admin_user, payload, request_context)
    db.commit()
    return action


@router.get("/audit-logs", response_model=list[AuditLogResponse])
def audit_logs(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list:
    del admin_user
    return list_audit_logs(db)


@router.get("/rules", response_model=list[RuleCatalogResponse])
def rule_catalog(
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list:
    del admin_user
    return list_rule_catalog()


@router.get("/security/overview", response_model=SecurityOverviewResponse)
def security_overview(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> dict:
    del admin_user
    return get_security_overview_view(db)


@router.get("/security/devices", response_model=list[SecurityDeviceResponse])
def security_devices(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list[dict]:
    del admin_user
    return list_security_devices_view(db)


@router.post("/security/devices/{security_device_id}/actions", response_model=MessageResponse)
def security_device_action(
    security_device_id: str,
    payload: DeviceActionRequest,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> MessageResponse:
    result = apply_device_action(db, security_device_id, admin_user, payload.action_type, payload.comment, request_context)
    db.commit()
    return MessageResponse(**result)


@router.get("/security/sessions", response_model=list[AuthSessionResponse])
def security_sessions(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list[dict]:
    del admin_user
    return list_auth_sessions_view(db)


@router.post("/security/sessions/{auth_session_id}/revoke", response_model=MessageResponse)
def revoke_security_session(
    auth_session_id: str,
    payload: SessionRevokeRequest,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> MessageResponse:
    result = revoke_auth_session(db, auth_session_id, admin_user, payload.reason, request_context)
    db.commit()
    return MessageResponse(**result)


@router.get("/security/policies", response_model=list[SecurityPolicyResponse])
def security_policies(
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list:
    del admin_user
    return list_security_policy_catalog()


@router.get("/lab/scenarios", response_model=list[LabScenarioResponse])
def lab_scenarios(
    admin_user: Annotated[User, Depends(get_admin_user)],
) -> list:
    del admin_user
    return list_lab_scenarios()


@router.post("/lab/scenarios/{scenario_code}/execute", response_model=LabScenarioExecutionResponse)
def execute_scenario(
    scenario_code: str,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(get_admin_user)],
    request_context: Annotated[RequestContext, Depends(get_request_context)],
) -> object:
    result = execute_lab_scenario(db, scenario_code, admin_user, request_context)
    db.commit()
    return result
