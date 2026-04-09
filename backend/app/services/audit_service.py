from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.fds.types import RequestContext
from app.models.audit_log import AuditLog


def _build_indicators(payload: dict) -> dict:
    indicators = {
        "risk_score": payload.get("risk_score"),
        "risk_event_id": payload.get("risk_event_id"),
        "status": payload.get("status"),
        "decision": payload.get("decision"),
    }

    if "created_risk_event_ids" in payload:
        indicators["created_risk_event_count"] = len(payload.get("created_risk_event_ids") or [])

    return {key: value for key, value in indicators.items() if value is not None}


def _normalize_payload(
    *,
    actor_user_id: str | None,
    event_type: str,
    target_type: str,
    target_id: str | None,
    context: RequestContext,
    payload: dict,
) -> dict:
    return {
        "schema_version": "2.0",
        "trace": {
            "audit_id": str(uuid4()),
            "request_id": context.request_id,
            "recorded_at": datetime.now(UTC).isoformat(),
        },
        "actor": {
            "user_id": actor_user_id,
        },
        "event": {
            "type": event_type,
            "category": event_type.split("_", 1)[0],
            "channel": context.channel,
        },
        "target": {
            "type": target_type,
            "id": target_id,
        },
        "request": {
            "ip_address": context.ip_address,
            "region": context.region,
            "device_id": context.device_id,
            "channel": context.channel,
            "user_agent": context.user_agent,
        },
        "indicators": _build_indicators(payload),
        "data": payload,
    }


def record_audit(
    db: Session,
    actor_user_id: str | None,
    event_type: str,
    target_type: str,
    target_id: str | None,
    context: RequestContext,
    payload: dict,
) -> AuditLog:
    log = AuditLog(
        actor_user_id=actor_user_id,
        event_type=event_type,
        target_type=target_type,
        target_id=target_id,
        ip_address=context.ip_address,
        region=context.region,
        device_id=context.device_id,
        payload=_normalize_payload(
            actor_user_id=actor_user_id,
            event_type=event_type,
            target_type=target_type,
            target_id=target_id,
            context=context,
            payload=payload,
        ),
    )
    db.add(log)
    db.flush()
    return log
