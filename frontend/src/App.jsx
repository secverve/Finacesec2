import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { api } from "./api/client";
import HtsChart from "./HtsChart";
import {
  ACCOUNT_STATUS_LABELS,
  DEMO_USERS,
  LOWER_TABS,
  MARKET_LABELS,
  ORDER_SIDE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  REGION_LABELS,
  RISK_DECISION_LABELS,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
  ROLE_LABELS,
  TOP_TABS,
  buildChartSeries,
  buildInvestorFlows,
  buildOrderBook,
  buildStockSnapshot,
  buildTradeTape,
  buildUserRiskRows,
  formatChange,
  formatPercent,
  formatPrice,
  formatTime,
  formatVolume,
  getSignedClass,
  localizeMessage,
  normalizeStockName,
} from "./htsData";

function MetricValue({ label, value, className = "" }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

function ValuePill({ value, variant = "neutral" }) {
  if (!value) {
    return null;
  }

  return <span className={`value-pill value-pill-${variant}`}>{value}</span>;
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
  const [searchText, setSearchText] = useState("");
  const [marketView, setMarketView] = useState("ALL");
  const [lowerTab, setLowerTab] = useState("orders");
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
  const deferredSearch = useDeferredValue(searchText);

  // EFFECTS
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

  useEffect(() => {
    refreshDashboard();
  }, [token]);

  // ACTIONS
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
          price:
            current.order_type === "LIMIT" && !current.price && stockList[0]?.current_price
              ? Number(stockList[0].current_price)
              : current.price,
        }));
      });
    } catch (refreshError) {
      setError(localizeMessage(refreshError.message));
      if (String(refreshError.message).toLowerCase().includes("token")) {
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await api.login(loginForm, deviceId);
      setToken(result.access_token);
    } catch (loginError) {
      setError(localizeMessage(loginError.message));
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      if (token) {
        await api.logout(token, deviceId);
      }
    } catch (logoutError) {
      setError(localizeMessage(logoutError.message));
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
      setError(localizeMessage(submitError.message));
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
        {
          action_type: actionType,
          comment:
            actionType === "APPROVE"
              ? "관리자 승인 처리"
              : actionType === "BLOCK"
                ? "관리자 차단 처리"
                : "추가 인증 요청",
        },
        deviceId,
      );
      await refreshDashboard(token);
    } catch (actionError) {
      setError(localizeMessage(actionError.message));
      setLoading(false);
    }
  }

  function handleSelectStock(stock) {
    setOrderForm((current) => ({
      ...current,
      symbol: stock.symbol,
      price: current.order_type === "LIMIT" ? Number(stock.current_price) : current.price,
    }));
  }

  // DERIVED
  const filteredStocks = stocks.filter((stock) => {
    const marketMatched =
      marketView === "ALL"
        ? true
        : marketView === "WATCH"
          ? stock.is_watchlist
          : stock.market === marketView;
    const keyword = deferredSearch.trim().toLowerCase();
    const stockName = normalizeStockName(stock).toLowerCase();

    return marketMatched && (!keyword || stock.symbol.includes(keyword) || stockName.includes(keyword));
  });

  const stockRows = filteredStocks.length ? filteredStocks : stocks;
  const selectedStock = stockRows.find((stock) => stock.symbol === orderForm.symbol) || stocks[0] || null;
  const snapshot = buildStockSnapshot(selectedStock);
  const orderBook = buildOrderBook(selectedStock, snapshot);
  const chartSeries = buildChartSeries(selectedStock, snapshot);
  const investorFlows = buildInvestorFlows(selectedStock, snapshot);
  const tradeTape = buildTradeTape(selectedStock, orders, snapshot);
  const riskRows = buildUserRiskRows(user, orders, riskEvents, selectedStock);
  const holdings = portfolio?.holdings || [];

  // LOGIN_VIEW
  if (!token) {
    return (
      <main className="login-desktop">
        <section className="login-window">
          <header className="window-title-bar">
            <div className="window-title-left">
              <span className="window-logo">V</span>
              <span>[1000] VERVE HTS 로그인</span>
            </div>
            <div className="window-controls">
              <span />
              <span />
              <span />
            </div>
          </header>

          <div className="login-body">
            <aside className="login-info">
              <p className="login-mini-title">VERVE FDS 모의투자</p>
              <h1>국내주식 HTS 접속</h1>
              <ul className="login-feature-list">
                <li>실시간 주문 모사 및 FDS 평가</li>
                <li>호가형 시세화면과 체결창 제공</li>
                <li>관리자 계정으로 위험이벤트 조치 가능</li>
              </ul>
            </aside>

            <section className="login-form-panel">
              <div className="login-box-header">접속정보</div>
              <form className="login-grid" onSubmit={handleLogin}>
                <label>
                  아이디
                  <input
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  비밀번호
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <button type="submit" className="hts-primary-button" disabled={loading}>
                  {loading ? "접속 중..." : "로그인"}
                </button>
              </form>

              <div className="quick-account-strip">
                {DEMO_USERS.map((demo) => (
                  <button
                    key={demo.email}
                    type="button"
                    className="hts-secondary-button"
                    onClick={() => setLoginForm({ email: demo.email, password: demo.password })}
                  >
                    {demo.label}
                  </button>
                ))}
              </div>

              {error ? <p className="status-text error">{error}</p> : null}
            </section>
          </div>
        </section>
      </main>
    );
  }

  // MAIN_VIEW
  return (
    <main className="hts-desktop">
      <section className="hts-window">
        <header className="window-title-bar">
          <div className="window-title-left">
            <span className="window-logo">V</span>
            <span>[0101] 현재가(1)</span>
          </div>
          <div className="window-controls">
            <span />
            <span />
            <span />
          </div>
        </header>

        <div className="top-tab-strip">
          {TOP_TABS.map((tab, index) => (
            <button key={tab} type="button" className={`top-tab ${index === 0 ? "active" : ""}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="search-toolbar">
          <div className="toolbar-group">
            <label className="inline-field">
              <span>시장</span>
              <select value={marketView} onChange={(event) => setMarketView(event.target.value)}>
                {Object.entries(MARKET_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field search-field">
              <span>종목검색</span>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="종목코드/종목명"
              />
            </label>
          </div>

          <div className="toolbar-group toolbar-actions">
            <div className="toolbar-user-box">
              <strong>{user?.full_name}</strong>
              <span>{ROLE_LABELS[user?.role] || user?.role}</span>
            </div>
            <button type="button" className="hts-secondary-button" onClick={() => refreshDashboard(token)}>
              새로고침
            </button>
            <button type="button" className="hts-secondary-button" onClick={handleLogout}>
              종료
            </button>
          </div>
        </div>

        {error ? <p className="status-text error">{error}</p> : null}
        {loading ? <p className="status-text">시세 및 주문 정보를 불러오는 중입니다.</p> : null}

        <div className="hts-grid">
          <aside className="column-left">
            <section className="hts-panel">
              <div className="panel-title">종목 리스트</div>
              <div className="panel-body compact">
                <table className="hts-table quote-table">
                  <thead>
                    <tr>
                      <th>코드</th>
                      <th>종목명</th>
                      <th>현재가</th>
                      <th>구분</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRows.map((stock) => {
                      const rowSnapshot = buildStockSnapshot(stock);
                      return (
                        <tr
                          key={stock.id}
                          className={stock.symbol === selectedStock?.symbol ? "selected" : ""}
                          onClick={() => handleSelectStock(stock)}
                        >
                          <td>{stock.symbol}</td>
                          <td>{normalizeStockName(stock)}</td>
                          <td className={getSignedClass(rowSnapshot.change)}>{formatPrice(stock.current_price)}</td>
                          <td>{stock.is_watchlist ? "감시" : "일반"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="hts-panel">
              <div className="panel-title">계좌 현황</div>
              <div className="panel-body metric-box">
                <MetricValue label="계좌번호" value={portfolio?.account?.account_number || "-"} />
                <MetricValue label="예수금" value={`${formatPrice(portfolio?.total_cash)} 원`} />
                <MetricValue label="총자산" value={`${formatPrice(portfolio?.total_asset_value)} 원`} />
                <MetricValue
                  label="계좌상태"
                  value={ACCOUNT_STATUS_LABELS[portfolio?.account?.status] || portfolio?.account?.status || "-"}
                />
              </div>
            </section>
          </aside>

          <section className="column-center">
            <section className="hts-panel">
              <div className="panel-title">
                현재가
                <span className="panel-title-inline">
                  {selectedStock ? `${selectedStock.symbol} ${normalizeStockName(selectedStock)}` : "-"}
                </span>
              </div>
              <div className="panel-body price-summary">
                <div className="price-core">
                  <div className="price-code-box">
                    <span className="code-chip">{selectedStock?.symbol}</span>
                    <div>
                      <strong>{normalizeStockName(selectedStock)}</strong>
                      <span>{selectedStock?.market || "KOSPI"}</span>
                    </div>
                  </div>
                  <div className="price-block">
                    <strong className={`primary-price ${getSignedClass(snapshot?.change)}`}>
                      {formatPrice(snapshot?.currentPrice)}
                    </strong>
                    <span className={getSignedClass(snapshot?.change)}>
                      {formatChange(snapshot?.change)} / {formatPercent(snapshot?.changeRate)}
                    </span>
                  </div>
                </div>

                <div className="metric-grid">
                  <MetricValue label="시가" value={formatPrice(snapshot?.open)} />
                  <MetricValue label="고가" value={formatPrice(snapshot?.high)} className="is-up" />
                  <MetricValue label="저가" value={formatPrice(snapshot?.low)} className="is-down" />
                  <MetricValue label="전일가" value={formatPrice(snapshot?.previousClose)} />
                  <MetricValue label="거래량" value={formatVolume(snapshot?.volume)} />
                  <MetricValue label="거래대금" value={formatVolume(snapshot?.tradingValue)} />
                </div>
              </div>
            </section>

            <div className="center-split">
              <section className="hts-panel">
                <div className="panel-title">호가잔량</div>
                <div className="panel-body compact">
                  <table className="hts-table orderbook-table">
                    <thead>
                      <tr>
                        <th>호가</th>
                        <th>증감률</th>
                        <th>잔량</th>
                        <th>증권사</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderBook.map((row) => (
                        <tr key={`${row.side}-${row.level}`} className={row.side === "ask" ? "ask-row" : "bid-row"}>
                          <td className={getSignedClass(row.price - snapshot.previousClose)}>{formatPrice(row.price)}</td>
                          <td className={getSignedClass(row.rate)}>{formatPercent(row.rate)}</td>
                          <td>{formatVolume(row.quantity)}</td>
                          <td>{row.broker}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="hts-panel">
                <div className="panel-title">분차트</div>
                <div className="panel-body chart-panel-body">
                  <HtsChart series={chartSeries} />
                </div>
              </section>
            </div>

            <section className="hts-panel">
              <div className="panel-title">체결 / 시간</div>
              <div className="panel-body compact">
                <table className="hts-table trade-tape-table">
                  <thead>
                    <tr>
                      <th>시간</th>
                      <th>체결가</th>
                      <th>대비</th>
                      <th>매도호가</th>
                      <th>매수호가</th>
                      <th>체결량</th>
                      <th>구분</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeTape.map((row) => (
                      <tr key={row.id}>
                        <td>{row.time}</td>
                        <td className={getSignedClass(row.change)}>{formatPrice(row.price)}</td>
                        <td className={getSignedClass(row.change)}>{formatChange(row.change)}</td>
                        <td className="is-up">{formatPrice(row.sellPrice)}</td>
                        <td className="is-down">{formatPrice(row.buyPrice)}</td>
                        <td>{formatVolume(row.quantity)}</td>
                        <td>{ORDER_SIDE_LABELS[row.side] || row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <aside className="column-right">
            <section className="hts-panel">
              <div className="panel-title">주문</div>
              <div className="panel-body">
                <form className="order-entry-grid" onSubmit={handleSubmitOrder}>
                  <label className="inline-field vertical">
                    <span>계좌</span>
                    <input value={portfolio?.account?.account_number || ""} disabled />
                  </label>
                  <label className="inline-field vertical">
                    <span>종목</span>
                    <input value={selectedStock ? `${selectedStock.symbol} ${normalizeStockName(selectedStock)}` : ""} disabled />
                  </label>
                  <label className="inline-field vertical">
                    <span>매매구분</span>
                    <select
                      value={orderForm.side}
                      onChange={(event) => setOrderForm((current) => ({ ...current, side: event.target.value }))}
                    >
                      <option value="BUY">매수</option>
                      <option value="SELL">매도</option>
                    </select>
                  </label>
                  <label className="inline-field vertical">
                    <span>주문유형</span>
                    <select
                      value={orderForm.order_type}
                      onChange={(event) =>
                        setOrderForm((current) => ({
                          ...current,
                          order_type: event.target.value,
                          price:
                            event.target.value === "LIMIT" && selectedStock
                              ? Number(selectedStock.current_price)
                              : current.price,
                        }))
                      }
                    >
                      <option value="MARKET">시장가</option>
                      <option value="LIMIT">지정가</option>
                    </select>
                  </label>
                  <label className="inline-field vertical">
                    <span>수량</span>
                    <input
                      type="number"
                      min="1"
                      value={orderForm.quantity}
                      onChange={(event) => setOrderForm((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </label>
                  <label className="inline-field vertical">
                    <span>가격</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      disabled={orderForm.order_type === "MARKET"}
                      value={orderForm.order_type === "MARKET" ? formatPrice(snapshot?.currentPrice) : orderForm.price}
                      onChange={(event) => setOrderForm((current) => ({ ...current, price: event.target.value }))}
                    />
                  </label>
                  <label className="inline-field vertical">
                    <span>접속지역</span>
                    <select
                      value={orderForm.region}
                      onChange={(event) => setOrderForm((current) => ({ ...current, region: event.target.value }))}
                    >
                      {Object.entries(REGION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="order-button-row">
                    <button
                      type="button"
                      className="order-action-button buy"
                      onClick={() => setOrderForm((current) => ({ ...current, side: "BUY" }))}
                    >
                      매수
                    </button>
                    <button
                      type="button"
                      className="order-action-button sell"
                      onClick={() => setOrderForm((current) => ({ ...current, side: "SELL" }))}
                    >
                      매도
                    </button>
                    <button type="submit" className="order-submit-button" disabled={loading || !selectedStock}>
                      {ORDER_SIDE_LABELS[orderForm.side]} 주문
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="hts-panel">
              <div className="panel-title">투자자별 동향</div>
              <div className="panel-body compact">
                <table className="hts-table investor-table">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>매도</th>
                      <th>매수</th>
                      <th>순매수</th>
                      <th>비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investorFlows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{formatVolume(row.sell)}</td>
                        <td>{formatVolume(row.buy)}</td>
                        <td className={getSignedClass(row.net)}>{formatChange(row.net)}</td>
                        <td>{row.ratio.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="hts-panel">
              <div className="panel-title">FDS 감시</div>
              <div className="panel-body risk-stack">
                {riskRows.length ? (
                  riskRows.map((row) => (
                    <article key={row.id} className="risk-card">
                      <div className="risk-card-header">
                        <strong>{row.symbol}</strong>
                        <ValuePill value={RISK_SEVERITY_LABELS[row.severity] || row.severity} variant="risk" />
                      </div>
                      <div className="risk-card-meta">
                        <span>점수 {row.total_score}</span>
                        <span>{RISK_DECISION_LABELS[row.decision] || row.decision}</span>
                        <span>{RISK_STATUS_LABELS[row.status] || ORDER_STATUS_LABELS[row.status] || row.status}</span>
                      </div>
                      <p>{row.summary || "주문 감시 이벤트"}</p>
                      {user?.role === "ADMIN" ? (
                        <div className="risk-card-actions">
                          <button type="button" onClick={() => handleAdminAction(row.id, "APPROVE")}>
                            승인
                          </button>
                          <button type="button" onClick={() => handleAdminAction(row.id, "BLOCK")}>
                            차단
                          </button>
                          <button type="button" onClick={() => handleAdminAction(row.id, "REQUEST_ADDITIONAL_AUTH")}>
                            추가인증
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="empty-box">현재 선택 종목에 대한 감시 이벤트가 없습니다.</div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <section className="lower-panel">
          <div className="lower-tab-strip">
            {LOWER_TABS.filter((tab) => (tab.key === "audit" ? user?.role === "ADMIN" : true)).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`lower-tab ${lowerTab === tab.key ? "active" : ""}`}
                onClick={() => setLowerTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="panel-body compact">
            {lowerTab === "orders" ? (
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>주문시각</th>
                    <th>종목</th>
                    <th>구분</th>
                    <th>주문유형</th>
                    <th>수량</th>
                    <th>상태</th>
                    <th>FDS</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{formatTime(order.created_at)}</td>
                      <td>{normalizeStockName(order)}</td>
                      <td>{ORDER_SIDE_LABELS[order.side] || order.side}</td>
                      <td>{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</td>
                      <td>{formatVolume(order.quantity)}</td>
                      <td>{ORDER_STATUS_LABELS[order.status] || order.status}</td>
                      <td className={getSignedClass(order.fds_score)}>{order.fds_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {lowerTab === "risk" ? (
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>종목</th>
                    <th>등급</th>
                    <th>판정</th>
                    <th>상태</th>
                    <th>점수</th>
                  </tr>
                </thead>
                <tbody>
                  {riskRows.length ? (
                    riskRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.created_at ? formatTime(row.created_at) : "-"}</td>
                        <td>{row.symbol}</td>
                        <td>{RISK_SEVERITY_LABELS[row.severity] || row.severity}</td>
                        <td>{RISK_DECISION_LABELS[row.decision] || row.decision}</td>
                        <td>{RISK_STATUS_LABELS[row.status] || ORDER_STATUS_LABELS[row.status] || row.status}</td>
                        <td>{row.total_score}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">표시할 FDS 이벤트가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : null}

            {lowerTab === "holdings" ? (
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>종목</th>
                    <th>보유수량</th>
                    <th>평균단가</th>
                    <th>현재가</th>
                    <th>평가금액</th>
                    <th>평가손익</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.length ? (
                    holdings.map((holding) => (
                      <tr key={holding.symbol}>
                        <td>{normalizeStockName(holding)}</td>
                        <td>{formatVolume(holding.quantity)}</td>
                        <td>{formatPrice(holding.average_price)}</td>
                        <td>{formatPrice(holding.current_price)}</td>
                        <td>{formatPrice(holding.market_value)}</td>
                        <td className={getSignedClass(holding.unrealized_pnl)}>{formatPrice(holding.unrealized_pnl)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">보유 종목이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : null}

            {lowerTab === "audit" && user?.role === "ADMIN" ? (
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>이벤트</th>
                    <th>대상</th>
                    <th>지역</th>
                    <th>디바이스</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length ? (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatTime(log.created_at)}</td>
                        <td>{log.event_type}</td>
                        <td>{`${log.target_type} ${log.target_id || "-"}`}</td>
                        <td>{REGION_LABELS[log.region] || log.region}</td>
                        <td>{log.device_id}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">감사 로그가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
