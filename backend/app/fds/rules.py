from decimal import Decimal

from app.core.config import get_settings
from app.core.enums import RiskSeverity
from app.fds.types import RuleContext, RuleDefinition, RuleHitResult


def build_rule_catalog() -> list[RuleDefinition]:
    settings = get_settings()
    abnormal_regions = set(settings.abnormal_region_codes)

    return [
        RuleDefinition(
            rule_code="NEW_DEVICE_HIGH_AMOUNT",
            rule_name="New device large-value order",
            description="A large-value order was submitted from an unseen device.",
            score=35,
            severity=RiskSeverity.CAUTION,
            reason_template="Large-value order detected from new device {device_id}.",
            condition=lambda ctx: ctx.is_new_device and ctx.order_amount >= settings.high_amount_threshold,
        ),
        RuleDefinition(
            rule_code="FOREIGN_IP_FAST_ORDER",
            rule_name="High-risk region order after login",
            description="An order was placed from a high-risk region after a successful login.",
            score=45,
            severity=RiskSeverity.SUSPICIOUS,
            reason_template="Order placed from region {region} after login.",
            condition=lambda ctx: (
                ctx.latest_success_login is not None and ctx.request_context.region.upper() in abnormal_regions
            ),
        ),
        RuleDefinition(
            rule_code="FAILED_LOGIN_THEN_ORDER",
            rule_name="Repeated failed login before order",
            description="The user placed an order after multiple recent login failures.",
            score=30,
            severity=RiskSeverity.CAUTION,
            reason_template="Order placed after {recent_failed_logins} recent failed logins.",
            condition=lambda ctx: ctx.recent_failed_logins >= 3,
        ),
        RuleDefinition(
            rule_code="HIGH_AMOUNT_SPIKE",
            rule_name="Order amount spike",
            description="The order amount is much higher than the user's normal pattern.",
            score=40,
            severity=RiskSeverity.SUSPICIOUS,
            reason_template="Order amount is significantly above the user's historical average.",
            condition=lambda ctx: (
                ctx.behavior_profile is not None
                and Decimal(str(ctx.behavior_profile.average_order_amount or 0)) > 0
                and ctx.order_amount
                >= Decimal(str(ctx.behavior_profile.average_order_amount))
                * Decimal(str(settings.order_spike_multiplier))
            ),
        ),
        RuleDefinition(
            rule_code="BURST_ORDER_ACTIVITY",
            rule_name="Burst cancel or modify activity",
            description="The account showed a recent burst of cancel or modify activity.",
            score=30,
            severity=RiskSeverity.CAUTION,
            reason_template="Detected {recent_cancel_or_modify_count} recent cancel or modify actions.",
            condition=lambda ctx: ctx.recent_cancel_or_modify_count >= settings.order_cancel_burst_threshold,
        ),
        RuleDefinition(
            rule_code="WATCHLIST_STOCK_ORDER",
            rule_name="Watchlist stock order",
            description="The order targets a stock currently on the watchlist.",
            score=50,
            severity=RiskSeverity.SUSPICIOUS,
            reason_template="Order targets watchlist stock {symbol}.",
            condition=lambda ctx: ctx.stock.is_watchlist,
        ),
        RuleDefinition(
            rule_code="SAME_IP_MULTI_ACCOUNT",
            rule_name="Same IP multi-account trading",
            description="Another account traded the same stock from the same IP in the review window.",
            score=55,
            severity=RiskSeverity.CRITICAL,
            reason_template="Another account traded from IP {ip_address} in the same review window.",
            condition=lambda ctx: ctx.same_ip_peer_orders >= 1,
        ),
    ]


def evaluate_rules(context: RuleContext) -> list[RuleHitResult]:
    hits: list[RuleHitResult] = []
    for rule in build_rule_catalog():
        if rule.condition(context):
            hits.append(
                RuleHitResult(
                    rule_code=rule.rule_code,
                    rule_name=rule.rule_name,
                    description=rule.description,
                    score=rule.score,
                    severity=rule.severity,
                    reason_template=rule.reason_template,
                    reason=rule.reason_template.format(
                        device_id=context.request_context.device_id,
                        region=context.request_context.region,
                        recent_failed_logins=context.recent_failed_logins,
                        recent_cancel_or_modify_count=context.recent_cancel_or_modify_count,
                        symbol=context.stock.symbol,
                        ip_address=context.request_context.ip_address,
                    ),
                )
            )
    return hits
