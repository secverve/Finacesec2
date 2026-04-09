from sqlalchemy.orm import Session

from app.fds.types import RequestContext
from app.models.audit_log import AuditLog


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
        payload=payload,
    )
    db.add(log)
    db.flush()
    return log

