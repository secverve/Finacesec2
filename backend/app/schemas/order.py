from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import OrderSide, OrderStatus, OrderType, RiskDecision, RiskSeverity


class OrderCreateRequest(BaseModel):
    account_id: str
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: int = Field(gt=0)
    price: Decimal | None = Field(default=None, gt=0)


class OrderUpdateRequest(BaseModel):
    quantity: int | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, gt=0)


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    symbol: str
    stock_name: str
    side: OrderSide
    order_type: OrderType
    status: OrderStatus
    quantity: int
    price: Decimal | None
    executed_price: Decimal | None
    executed_quantity: int
    fds_score: int
    risk_severity: RiskSeverity
    risk_decision: RiskDecision
    created_at: datetime


class ExecutionResponse(BaseModel):
    id: str
    order_id: str
    symbol: str
    quantity: int
    price: Decimal
    executed_at: datetime

