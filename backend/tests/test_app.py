from fastapi.testclient import TestClient


def build_headers(token: str | None = None, device_id: str = "test-device", region: str = "KR") -> dict[str, str]:
    headers = {"x-device-id": device_id, "x-region": region}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def login(client: TestClient, email: str, password: str, device_id: str = "test-device", region: str = "KR") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers=build_headers(device_id=device_id, region=region),
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_health_check(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["database"] == "up"


def test_market_candles_endpoint_supports_intervals(client: TestClient) -> None:
    response = client.get("/api/v1/market/candles/005930", params={"interval": "5m", "limit": 12})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload) == 12
    assert {"timestamp", "open", "high", "low", "close", "volume"} <= set(payload[0].keys())


def test_market_order_executes_for_normal_user(client: TestClient) -> None:
    token = login(client, "trader@verve.local", "Trader1234!", device_id="trusted-device")
    portfolio_response = client.get("/api/v1/portfolio/me", headers=build_headers(token, "trusted-device"))
    account_id = portfolio_response.json()["account"]["id"]

    order_response = client.post(
        "/api/v1/orders",
        json={
            "account_id": account_id,
            "symbol": "005930",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 1,
            "price": None,
        },
        headers=build_headers(token, "trusted-device"),
    )

    assert order_response.status_code == 201, order_response.text
    payload = order_response.json()
    assert payload["status"] == "EXECUTED"
    assert payload["fds_score"] == 0
    assert payload["risk_decision"] == "ALLOW"


def test_admin_can_approve_blocked_risk_event(client: TestClient) -> None:
    trader_token = login(client, "trader@verve.local", "Trader1234!", device_id="baseline-device")
    portfolio_response = client.get("/api/v1/portfolio/me", headers=build_headers(trader_token, "baseline-device"))
    account_id = portfolio_response.json()["account"]["id"]

    blocked_order_response = client.post(
        "/api/v1/orders",
        json={
            "account_id": account_id,
            "symbol": "051910",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 3,
            "price": None,
        },
        headers=build_headers(trader_token, "suspicious-device", "CN"),
    )

    assert blocked_order_response.status_code == 201, blocked_order_response.text
    blocked_order = blocked_order_response.json()
    assert blocked_order["status"] == "BLOCKED"
    assert blocked_order["fds_score"] >= 80

    admin_token = login(client, "admin@verve.local", "Admin1234!", device_id="admin-console")
    risk_events_response = client.get("/api/v1/admin/risk-events", headers=build_headers(admin_token, "admin-console"))
    assert risk_events_response.status_code == 200, risk_events_response.text

    target_event = next(
        event for event in risk_events_response.json() if event["order_id"] == blocked_order["id"]
    )

    action_response = client.post(
        f"/api/v1/admin/risk-events/{target_event['id']}/actions",
        json={"action_type": "APPROVE", "comment": "Approved after analyst review"},
        headers=build_headers(admin_token, "admin-console"),
    )
    assert action_response.status_code == 200, action_response.text

    detail_response = client.get(
        f"/api/v1/admin/risk-events/{target_event['id']}",
        headers=build_headers(admin_token, "admin-console"),
    )
    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["status"] == "APPROVED"

    trader_orders_response = client.get("/api/v1/orders", headers=build_headers(trader_token, "baseline-device"))
    assert trader_orders_response.status_code == 200, trader_orders_response.text
    updated_order = next(order for order in trader_orders_response.json() if order["id"] == blocked_order["id"])
    assert updated_order["status"] in {"EXECUTED", "ACCEPTED"}


def test_admin_can_execute_lab_scenario(client: TestClient) -> None:
    admin_token = login(client, "admin@verve.local", "Admin1234!", device_id="lab-admin")
    response = client.post(
        "/api/v1/admin/lab/scenarios/watchlist_high_value/execute",
        headers=build_headers(admin_token, "lab-admin"),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["scenario_code"] == "watchlist_high_value"
    assert payload["created_order_ids"]
