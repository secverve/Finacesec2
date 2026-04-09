from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMBaseModel


class AccountSummaryResponse(ORMBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_number: str
    cash_balance: Decimal
    locked_cash: Decimal
    status: str


class HoldingResponse(BaseModel):
    symbol: str
    name: str
    quantity: int
    average_price: Decimal
    current_price: Decimal
    market_value: Decimal
    unrealized_pnl: Decimal


class PortfolioResponse(BaseModel):
    account: AccountSummaryResponse
    holdings: list[HoldingResponse]
    total_asset_value: Decimal
    total_cash: Decimal
