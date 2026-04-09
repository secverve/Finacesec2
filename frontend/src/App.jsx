import { startTransition, useEffect, useState } from "react";

import { api } from "./api/client";

const DEMO_USERS = [
  { label: "Trader", email: "trader@verve.local", password: "Trader1234!" },
  { label: "Admin", email: "admin@verve.local", password: "Admin1234!" },
  { label: "Analyst", email: "analyst@verve.local", password: "Analyst1234!" },
];

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatusPill({ value }) {
  return <span className={`pill pill-${String(value).toLowerCase()}`}>{value}</span>;
}

function Section({ title, subtitle, children, actions }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem("verve-fds-token") || "");
  const [deviceId] = useState(() => window.localStorage.getItem("verve-device-id") || crypto.randomUUID());
  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [orders, setOrders] = useState([]);
  const [riskEvents, setRiskEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginForm, setLoginForm] = useState({
    email: "trader@verve.local",
    password: "Trader1234!",
  });
  const [orderForm, setOrderForm] = useState({
    account_id: "",
    symbol: "",
    side: "BUY",
    order_type: "MARKET",
    quantity: 1,
    price: "",
    region: "KR",
  });

  useEffect(() => {
    window.localStorage.setItem("verve-device-id", deviceId);
  }, [deviceId]);

  useEffect(() => {
    if (token) {
      window.localStorage.setItem("verve-fds-token", token);
    } else {
      window.localStorage.removeItem("verve-fds-token");
    }
  }, [token]);

  async function refreshDashboard(activeToken = token) {
    if (!activeToken) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const me = await api.getMe(activeToken, deviceId);
      const [stockList, portfolioSnapshot, orderList] = await Promise.all([
        api.listStocks(),
        api.getPortfolio(activeToken, deviceId),
        api.listOrders(activeToken, deviceId),
      ]);

      let adminData = { riskEvents: [], auditLogs: [] };
      if (me.role === "ADMIN") {
        const [eventList, logList] = await Promise.all([
          api.listRiskEvents(activeToken, deviceId),
          api.listAuditLogs(activeToken, deviceId),
        ]);
        adminData = { riskEvents: eventList, auditLogs: logList };
      }

      startTransition(() => {
        setUser(me);
        setStocks(stockList);
        setPortfolio(portfolioSnapshot);
        setOrders(orderList);
        setRiskEvents(adminData.riskEvents);
        setAuditLogs(adminData.auditLogs);
        setOrderForm((current) => ({
          ...current,
          account_id: current.account_id || portfolioSnapshot.account?.id || "",
          symbol: current.symbol || stockList[0]?.symbol || "",
        }));
      });
    } catch (refreshError) {
      setError(refreshError.message);
      if (String(refreshError.message).toLowerCase().includes("token")) {
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, [token]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await api.login(loginForm, deviceId);
      setToken(result.access_token);
    } catch (loginError) {
      setError(loginError.message);
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      if (token) {
        await api.logout(token, deviceId);
      }
    } catch (logoutError) {
      setError(logoutError.message);
    } finally {
      setToken("");
      setUser(null);
      setPortfolio(null);
      setOrders([]);
      setRiskEvents([]);
      setAuditLogs([]);
    }
  }

  async function handleSubmitOrder(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.createOrder(
        token,
        {
          account_id: orderForm.account_id,
          symbol: orderForm.symbol,
          side: orderForm.side,
          order_type: orderForm.order_type,
          quantity: Number(orderForm.quantity),
          price: orderForm.order_type === "LIMIT" ? Number(orderForm.price) : null,
        },
        deviceId,
        orderForm.region,
      );
      await refreshDashboard(token);
    } catch (submitError) {
      setError(submitError.message);
      setLoading(false);
    }
  }

  async function handleAdminAction(riskEventId, actionType) {
    setLoading(true);
    setError("");

    try {
      await api.applyAdminAction(
        token,
        riskEventId,
        { action_type: actionType, comment: `Handled via ${actionType.toLowerCase()} action in dashboard` },
        deviceId,
      );
      await refreshDashboard(token);
    } catch (actionError) {
      setError(actionError.message);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="shell shell-centered">
        <section className="hero-card">
          <p className="eyebrow">Finance Security Desk</p>
          <h1>VERVE FDS Console</h1>
          <p className="hero-copy">
            Review accounts, place sample trades, and inspect FDS decisions from one operational surface.
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Signing in..." : "Open Console"}
            </button>
          </form>

          <div className="demo-strip">
            {DEMO_USERS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                className="ghost-button"
                onClick={() => setLoginForm({ email: demo.email, password: demo.password })}
              >
                {demo.label}
              </button>
            ))}
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Risk-Aware Trading Workspace</p>
          <h1>{user ? `${user.full_name} Console` : "Loading console..."}</h1>
          <p className="hero-copy">
            Every order runs through the FDS engine, every outcome is stored, and escalated cases stay visible for
            operations review.
          </p>
        </div>

        <div className="hero-actions">
          <div className="identity-card">
            <span>{user?.email}</span>
            <StatusPill value={user?.role || "LOADING"} />
          </div>
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="stat-grid">
        <article className="stat-card">
          <span>Total Assets</span>
          <strong>{formatMoney(portfolio?.total_asset_value)}</strong>
        </article>
        <article className="stat-card">
          <span>Cash Balance</span>
          <strong>{formatMoney(portfolio?.total_cash)}</strong>
        </article>
        <article className="stat-card">
          <span>Open Risk Events</span>
          <strong>{riskEvents.filter((item) => item.status === "OPEN").length}</strong>
        </article>
        <article className="stat-card">
          <span>Orders Logged</span>
          <strong>{orders.length}</strong>
        </article>
      </section>

      <div className="dashboard-grid">
        <Section title="Order Entry" subtitle="Trading">
          <form className="order-form" onSubmit={handleSubmitOrder}>
            <label>
              Symbol
              <select
                value={orderForm.symbol}
                onChange={(event) => setOrderForm((current) => ({ ...current, symbol: event.target.value }))}
              >
                {stocks.map((stock) => (
                  <option key={stock.id} value={stock.symbol}>
                    {stock.symbol} · {stock.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Side
              <select
                value={orderForm.side}
                onChange={(event) => setOrderForm((current) => ({ ...current, side: event.target.value }))}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </label>
            <label>
              Type
              <select
                value={orderForm.order_type}
                onChange={(event) => setOrderForm((current) => ({ ...current, order_type: event.target.value }))}
              >
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                value={orderForm.quantity}
                onChange={(event) => setOrderForm((current) => ({ ...current, quantity: event.target.value }))}
              />
            </label>
            <label>
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={orderForm.price}
                disabled={orderForm.order_type === "MARKET"}
                onChange={(event) => setOrderForm((current) => ({ ...current, price: event.target.value }))}
              />
            </label>
            <label>
              Region
              <select
                value={orderForm.region}
                onChange={(event) => setOrderForm((current) => ({ ...current, region: event.target.value }))}
              >
                <option value="KR">KR</option>
                <option value="US">US</option>
                <option value="CN">CN</option>
                <option value="RU">RU</option>
              </select>
            </label>
            <button type="submit" className="primary-button" disabled={loading || !portfolio?.account?.id}>
              {loading ? "Submitting..." : "Submit Order"}
            </button>
          </form>
        </Section>

        <Section title="Market Snapshot" subtitle="Quotes">
          <div className="stock-list">
            {stocks.map((stock) => (
              <article key={stock.id} className="mini-card">
                <div>
                  <strong>{stock.symbol}</strong>
                  <span>{stock.name}</span>
                </div>
                <div className="mini-card-side">
                  <span>{formatMoney(stock.current_price)}</span>
                  {stock.is_watchlist ? <StatusPill value="WATCHLIST" /> : null}
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Portfolio" subtitle="Account">
          <div className="portfolio-summary">
            <div>
              <span>Account Number</span>
              <strong>{portfolio?.account?.account_number || "-"}</strong>
            </div>
            <StatusPill value={portfolio?.account?.status || "LOADING"} />
          </div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Qty</th>
                  <th>Avg</th>
                  <th>Current</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {portfolio?.holdings?.length ? (
                  portfolio.holdings.map((holding) => (
                    <tr key={holding.symbol}>
                      <td>{holding.symbol}</td>
                      <td>{holding.quantity}</td>
                      <td>{formatMoney(holding.average_price)}</td>
                      <td>{formatMoney(holding.current_price)}</td>
                      <td>{formatMoney(holding.unrealized_pnl)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">No holdings yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Order Ledger" subtitle="Execution Trail">
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {orders.length ? (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>{new Date(order.created_at).toLocaleString()}</td>
                      <td>{order.symbol}</td>
                      <td>{order.side}</td>
                      <td>
                        <StatusPill value={order.status} />
                      </td>
                      <td>
                        <StatusPill value={order.risk_decision} />
                      </td>
                      <td>{order.fds_score}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6">No orders submitted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {user?.role === "ADMIN" ? (
          <Section title="Risk Events" subtitle="Admin Control">
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Severity</th>
                    <th>Decision</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {riskEvents.length ? (
                    riskEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{event.symbol}</td>
                        <td>
                          <StatusPill value={event.severity} />
                        </td>
                        <td>
                          <StatusPill value={event.decision} />
                        </td>
                        <td>
                          <StatusPill value={event.status} />
                        </td>
                        <td>{event.total_score}</td>
                        <td className="action-row">
                          <button
                            type="button"
                            className="table-button"
                            onClick={() => handleAdminAction(event.id, "APPROVE")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="table-button"
                            onClick={() => handleAdminAction(event.id, "BLOCK")}
                          >
                            Block
                          </button>
                          <button
                            type="button"
                            className="table-button"
                            onClick={() => handleAdminAction(event.id, "REQUEST_ADDITIONAL_AUTH")}
                          >
                            Step-Up
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">No risk events recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        {user?.role === "ADMIN" ? (
          <Section title="Audit Timeline" subtitle="Operations">
            <div className="audit-list">
              {auditLogs.length ? (
                auditLogs.map((log) => (
                  <article key={log.id} className="audit-item">
                    <div>
                      <strong>{log.event_type}</strong>
                      <span>
                        {log.target_type} {log.target_id || "-"}
                      </span>
                    </div>
                    <div className="audit-item-side">
                      <span>{log.region}</span>
                      <time>{new Date(log.created_at).toLocaleString()}</time>
                    </div>
                  </article>
                ))
              ) : (
                <p>No audit logs yet.</p>
              )}
            </div>
          </Section>
        ) : null}
      </div>
    </main>
  );
}
