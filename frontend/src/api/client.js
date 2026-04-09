const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

async function request(path, { method = "GET", body, token, deviceId = "verve-web", region = "KR" } = {}) {
  const headers = {
    "x-device-id": deviceId,
    "x-region": region,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.detail || "Request failed";
    throw new Error(message);
  }

  return payload;
}

export const api = {
  login(credentials, deviceId) {
    return request("/auth/login", { method: "POST", body: credentials, deviceId });
  },
  getMe(token, deviceId) {
    return request("/auth/me", { token, deviceId });
  },
  logout(token, deviceId) {
    return request("/auth/logout", { method: "POST", token, deviceId });
  },
  listStocks() {
    return request("/market/stocks");
  },
  getQuote(symbol) {
    return request(`/market/quote/${symbol}`);
  },
  getCandles(symbol, interval = "1m", limit = 80) {
    return request(`/market/candles/${symbol}?interval=${interval}&limit=${limit}`);
  },
  getPortfolio(token, deviceId) {
    return request("/portfolio/me", { token, deviceId });
  },
  listOrders(token, deviceId) {
    return request("/orders", { token, deviceId });
  },
  createOrder(token, body, deviceId, region = "KR") {
    return request("/orders", { method: "POST", token, body, deviceId, region });
  },
  listRiskEvents(token, deviceId) {
    return request("/admin/risk-events", { token, deviceId });
  },
  getRiskEventDetail(token, riskEventId, deviceId) {
    return request(`/admin/risk-events/${riskEventId}`, { token, deviceId });
  },
  listAuditLogs(token, deviceId) {
    return request("/admin/audit-logs", { token, deviceId });
  },
  listRuleCatalog(token, deviceId) {
    return request("/admin/rules", { token, deviceId });
  },
  applyAdminAction(token, riskEventId, body, deviceId) {
    return request(`/admin/risk-events/${riskEventId}/actions`, {
      method: "POST",
      token,
      body,
      deviceId,
    });
  },
  listLabScenarios(token, deviceId) {
    return request("/admin/lab/scenarios", { token, deviceId });
  },
  executeLabScenario(token, scenarioCode, deviceId) {
    return request(`/admin/lab/scenarios/${scenarioCode}/execute`, {
      method: "POST",
      token,
      deviceId,
    });
  },
};
