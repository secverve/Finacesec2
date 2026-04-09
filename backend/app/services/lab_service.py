from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import OrderSide, OrderType
from app.fds.types import RequestContext
from app.models.user import User
from app.schemas.order import OrderCreateRequest
from app.services.audit_service import record_audit
from app.services.auth_service import authenticate_user, get_user_by_email
from app.services.order_service import create_order


@dataclass(frozen=True, slots=True)
class LabScenario:
    code: str
    title: str
    description: str
    detection_focus: str
    expected_outcome: str


SCENARIOS = [
    LabScenario(
        code="watchlist_high_value",
        title="감시종목 고액주문",
        description="신규 디바이스와 고위험 지역에서 감시종목을 대량 매수합니다.",
        detection_focus="신규기기, 고위험 지역, 감시종목, 고액주문",
        expected_outcome="차단 또는 보류 후 관리자 검토",
    ),
    LabScenario(
        code="credential_stuffing_then_trade",
        title="계정대입 후 주문",
        description="반복 로그인 실패 뒤 해외 지역에서 주문을 발생시킵니다.",
        detection_focus="로그인 실패 누적, 해외 접속, 주문 연계",
        expected_outcome="FDS 고위험 이벤트 생성",
    ),
    LabScenario(
        code="same_ip_multi_account",
        title="동일IP 다계정 거래",
        description="동일 IP에서 다른 계정들이 같은 종목을 연속 매매합니다.",
        detection_focus="동일IP, 다계정, 종목중복, 고액주문",
        expected_outcome="다계정 연계 탐지 및 차단",
    ),
]


def list_lab_scenarios() -> list[dict]:
    return [scenario.__dict__ for scenario in SCENARIOS]


def _get_demo_users(db: Session) -> tuple[User, User]:
    settings = get_settings()
    trader = get_user_by_email(db, settings.demo_user_email)
    analyst = get_user_by_email(db, settings.second_user_email)
    if trader is None or analyst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo users not found")
    return trader, analyst


def _execute_order(
    db: Session,
    user: User,
    *,
    symbol: str,
    quantity: int,
    region: str,
    ip_address: str,
    device_id: str,
) -> tuple[str, str | None]:
    order = create_order(
        db,
        user,
        OrderCreateRequest(
            account_id=user.account.id,
            symbol=symbol,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=quantity,
            price=None,
        ),
        RequestContext(ip_address=ip_address, region=region, device_id=device_id),
    )
    risk_event_id = order.risk_event.id if order.risk_event else None
    return order.id, risk_event_id


def execute_lab_scenario(
    db: Session,
    scenario_code: str,
    admin_user: User,
    context: RequestContext,
) -> dict:
    settings = get_settings()
    trader, analyst = _get_demo_users(db)
    created_order_ids: list[str] = []
    created_risk_event_ids: list[str] = []

    if scenario_code == "watchlist_high_value":
        order_id, risk_event_id = _execute_order(
            db,
            trader,
            symbol="051910",
            quantity=5,
            region="CN",
            ip_address="172.16.20.11",
            device_id="lab-watchlist-device",
        )
        created_order_ids.append(order_id)
        if risk_event_id:
            created_risk_event_ids.append(risk_event_id)

    elif scenario_code == "credential_stuffing_then_trade":
        for attempt in range(5):
            try:
                authenticate_user(
                    db,
                    settings.demo_user_email,
                    f"WrongPassword{attempt}!",
                    RequestContext(
                        ip_address="203.0.113.50",
                        region="RU",
                        device_id="lab-credential-stuffing",
                    ),
                )
            except ValueError:
                pass

        order_id, risk_event_id = _execute_order(
            db,
            trader,
            symbol="035420",
            quantity=6,
            region="RU",
            ip_address="203.0.113.50",
            device_id="lab-credential-stuffing",
        )
        created_order_ids.append(order_id)
        if risk_event_id:
            created_risk_event_ids.append(risk_event_id)

    elif scenario_code == "same_ip_multi_account":
        first_order_id, first_risk_event_id = _execute_order(
            db,
            analyst,
            symbol="005930",
            quantity=3,
            region="KR",
            ip_address="198.51.100.77",
            device_id="lab-shared-ip-analyst",
        )
        second_order_id, second_risk_event_id = _execute_order(
            db,
            trader,
            symbol="051910",
            quantity=5,
            region="CN",
            ip_address="198.51.100.77",
            device_id="lab-shared-ip-trader",
        )
        created_order_ids.extend([first_order_id, second_order_id])
        created_risk_event_ids.extend(
            [risk_event_id for risk_event_id in [first_risk_event_id, second_risk_event_id] if risk_event_id]
        )

    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab scenario not found")

    record_audit(
        db=db,
        actor_user_id=admin_user.id,
        event_type="LAB_SCENARIO_EXECUTED",
        target_type="LAB_SCENARIO",
        target_id=scenario_code,
        context=context,
        payload={
            "scenario_code": scenario_code,
            "created_order_ids": created_order_ids,
            "created_risk_event_ids": created_risk_event_ids,
            "outcome": "COMPLETED",
        },
    )

    return {
        "scenario_code": scenario_code,
        "message": "Lab scenario executed",
        "created_order_ids": created_order_ids,
        "created_risk_event_ids": created_risk_event_ids,
    }
