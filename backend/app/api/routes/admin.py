from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_admin_user, get_request_context
from app.db.session import get_db
from app.fds.types import RequestContext
from app.models.user import User
from app.schemas.admin import AdminActionRequest, AdminActionResponse, AuditLogResponse
from app.schemas.risk_event import RiskEventDetailResponse, RiskEventResponse
from app.services.admin_service import apply_admin_action, get_risk_event_detail, list_audit_logs, list_risk_events

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

