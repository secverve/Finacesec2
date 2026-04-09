import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { api } from "./api/client";
import HtsChart from "./HtsChart";
import {
  ACCOUNT_STATUS_LABELS,
  AUTH_STRENGTH_LABELS,
  CANDLE_INTERVALS,
  DEMO_USERS,
  DEVICE_TRUST_LABELS,
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
  SESSION_STATUS_LABELS,
  TOP_TABS,
  buildInvestorFlows,
  buildOrderBook,
  buildStockSnapshot,
  buildTradeTape,
  buildUserRiskRows,
  formatCandleTimestamp,
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

function shortId(value) {
  if (!value) {
    return "-";
  }

  return String(value).slice(0, 8);
}

function getAuditTraceId(log) {
  return log?.payload?.trace?.request_id || log?.payload?.request_id || log?.payload?.trace_id || "-";
}

function getAuditSummary(log) {
  const payload = log?.payload?.data || {};

  if (log.event_type === "ORDER_CREATED") {
    return `${payload.symbol || "-"} ${formatVolume(payload.quantity)}주 / FDS ${payload.risk_score ?? "-"}점`;
  }

  if (log.event_type === "ADMIN_ACTION") {
    return `${payload.action_type || "-"} / ${payload.status || "-"} / ${payload.decision || "-"}`;
  }

  if (log.event_type === "LAB_SCENARIO_EXECUTED") {
    return `${payload.scenario_code || "-"} / 주문 ${payload.created_order_ids?.length || 0}건`;
  }

  if (log.event_type === "LOGIN_SUCCEEDED" || log.event_type === "LOGIN_FAILED" || log.event_type === "LOGIN_BLOCKED") {
    return `${payload.email || "-"} / ${log.ip_address}`;
  }

  const entries = Object.entries(payload).slice(0, 2);
  if (!entries.length) {
    return "-";
  }

  return entries
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.length : value}`)
    .join(" / ");
}

const ADMIN_TOP_TABS = ["실시간 관제", "사건 분석", "세션 보안", "단말 신뢰", "보안 정책", "감사/포렌식", "공격 실습", "시장 참조"];
const ADMIN_TOP_TAB_CODES = ["9001", "9002", "9003", "9004", "9005", "9006", "9007", "9008"];

export default function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem("verve-fds-token") || "");
  const [deviceId] = useState(() => window.localStorage.getItem("verve-device-id") || crypto.randomUUID());
  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [orders, setOrders] = useState([]);
  const [riskEvents, setRiskEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [ruleCatalog, setRuleCatalog] = useState([]);
  const [securityOverview, setSecurityOverview] = useState(null);
  const [securityDevices, setSecurityDevices] = useState([]);
  const [securitySessions, setSecuritySessions] = useState([]);
  const [securityPolicies, setSecurityPolicies] = useState([]);
  const [selectedRiskEventId, setSelectedRiskEventId] = useState("");
  const [selectedRiskDetail, setSelectedRiskDetail] = useState(null);
  const [selectedIncidentTimeline, setSelectedIncidentTimeline] = useState([]);
  const [riskDetailLoading, setRiskDetailLoading] = useState(false);
  const [lastLabExecution, setLastLabExecution] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [marketView, setMarketView] = useState("ALL");
  const [activeTopTab, setActiveTopTab] = useState(0);
  const [lowerTab, setLowerTab] = useState("orders");
  const [chartInterval, setChartInterval] = useState("1m");
  const [candles, setCandles] = useState([]);
  const [dailyCandles, setDailyCandles] = useState([]);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState(-1);
  const [chartLoading, setChartLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [labScenarios, setLabScenarios] = useState([]);
  const [scenarioLoadingCode, setScenarioLoadingCode] = useState("");
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
  const isAdmin = user?.role === "ADMIN";

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

  useEffect(() => {
    if (!isAdmin && (lowerTab === "audit" || lowerTab === "lab")) {
      setLowerTab("orders");
    }
  }, [isAdmin, lowerTab]);

  useEffect(() => {
    if (isAdmin && lowerTab === "orders") {
      setLowerTab("audit");
    }
  }, [isAdmin]);

  useEffect(() => {
    loadCandles();
  }, [orderForm.symbol, chartInterval]);

  useEffect(() => {
    loadDailyCandles();
  }, [orderForm.symbol]);

  useEffect(() => {
    if (!isAdmin || !token || !selectedRiskEventId) {
      setSelectedRiskDetail(null);
      setSelectedIncidentTimeline([]);
      return;
    }

    loadRiskEventDetail(selectedRiskEventId);
    loadRiskEventTimeline(selectedRiskEventId);
  }, [isAdmin, token, selectedRiskEventId]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const refreshTimer = window.setInterval(() => {
      refreshDashboard(token, { silent: true });
    }, 7000);

    return () => window.clearInterval(refreshTimer);
  }, [token]);

  useEffect(() => {
    if (!orderForm.symbol) {
      return undefined;
    }

    const candleTimer = window.setInterval(() => {
      loadCandles(orderForm.symbol, chartInterval, { silent: true });
    }, 20000);

    return () => window.clearInterval(candleTimer);
  }, [orderForm.symbol, chartInterval]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    function handleShortcut(event) {
      if (event.key === "F5") {
        event.preventDefault();
        refreshDashboard(token);
      }

      if (event.altKey && event.key === "1") {
        event.preventDefault();
        setLowerTab("orders");
      }

      if (event.altKey && event.key === "2") {
        event.preventDefault();
        setLowerTab("candles");
      }

      if (event.altKey && event.key === "3") {
        event.preventDefault();
        setLowerTab("risk");
      }

      if (event.altKey && event.key === "4") {
        event.preventDefault();
        setLowerTab("holdings");
      }

      if (event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setOrderForm((current) => ({ ...current, side: "BUY" }));
      }

      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setOrderForm((current) => ({ ...current, side: "SELL" }));
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [token]);

  async function refreshDashboard(activeToken = token, { silent = false } = {}) {
    if (!activeToken) {
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const me = await api.getMe(activeToken, deviceId);
      const stockList = await api.listStocks();
      const orderList = await api.listOrders(activeToken, deviceId);
      const portfolioSnapshot = await api.getPortfolio(activeToken, deviceId);

      let adminData = {
        riskEvents: [],
        auditLogs: [],
        labScenarios: [],
        ruleCatalog: [],
        securityOverview: null,
        securityDevices: [],
        securitySessions: [],
        securityPolicies: [],
      };
      if (me.role === "ADMIN") {
        const [eventList, logList, scenarioList, ruleList, overview, deviceList, sessionList, policyList] = await Promise.all([
          api.listRiskEvents(activeToken, deviceId),
          api.listAuditLogs(activeToken, deviceId),
          api.listLabScenarios(activeToken, deviceId),
          api.listRuleCatalog(activeToken, deviceId),
          api.getSecurityOverview(activeToken, deviceId),
          api.listSecurityDevices(activeToken, deviceId),
          api.listSecuritySessions(activeToken, deviceId),
          api.listSecurityPolicies(activeToken, deviceId),
        ]);
        adminData = {
          riskEvents: eventList,
          auditLogs: logList,
          labScenarios: scenarioList,
          ruleCatalog: ruleList,
          securityOverview: overview,
          securityDevices: deviceList,
          securitySessions: sessionList,
          securityPolicies: policyList,
        };
      }

      startTransition(() => {
        setUser(me);
        setStocks(stockList);
        setPortfolio(portfolioSnapshot);
        setOrders(orderList);
        setRiskEvents(adminData.riskEvents);
        setAuditLogs(adminData.auditLogs);
        setLabScenarios(adminData.labScenarios || []);
        setRuleCatalog(adminData.ruleCatalog || []);
        setSecurityOverview(adminData.securityOverview || null);
        setSecurityDevices(adminData.securityDevices || []);
        setSecuritySessions(adminData.securitySessions || []);
        setSecurityPolicies(adminData.securityPolicies || []);
        setOrderForm((current) => ({
          ...current,
          account_id: current.account_id || portfolioSnapshot.account?.id || "",
          symbol: current.symbol || stockList[0]?.symbol || "",
          price:
            current.order_type === "LIMIT" && !current.price && stockList[0]?.current_price
              ? String(Number(stockList[0].current_price))
              : current.price,
        }));
        if (me.role === "ADMIN") {
          const stillExists = adminData.riskEvents.some((event) => event.id === selectedRiskEventId);
          setSelectedRiskEventId(stillExists ? selectedRiskEventId : (adminData.riskEvents[0]?.id ?? ""));
        }
      });
    } catch (refreshError) {
      setError(localizeMessage(refreshError.message));
      if (String(refreshError.message).toLowerCase().includes("token")) {
        setToken("");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function loadCandles(symbol = orderForm.symbol, interval = chartInterval, { silent = false } = {}) {
    if (!symbol) {
      setCandles([]);
      setSelectedCandleIndex(-1);
      return;
    }

    if (!silent) {
      setChartLoading(true);
    }
    try {
      const candleList = await api.getCandles(symbol, interval, interval === "1d" ? 90 : 80);
      setCandles(candleList);
      setSelectedCandleIndex(candleList.length - 1);
    } catch (candleError) {
      setError(localizeMessage(candleError.message));
    } finally {
      if (!silent) {
        setChartLoading(false);
      }
    }
  }

  async function loadDailyCandles(symbol = orderForm.symbol, { silent = false } = {}) {
    if (!symbol) {
      setDailyCandles([]);
      return;
    }

    if (!silent) {
      setDailyLoading(true);
    }

    try {
      const candleList = await api.getCandles(symbol, "1d", 40);
      setDailyCandles(candleList);
    } catch (candleError) {
      setError(localizeMessage(candleError.message));
    } finally {
      if (!silent) {
        setDailyLoading(false);
      }
    }
  }

  async function loadRiskEventDetail(riskEventId) {
    if (!riskEventId) {
      setSelectedRiskDetail(null);
      return;
    }

    setRiskDetailLoading(true);
    try {
      const detail = await api.getRiskEventDetail(token, riskEventId, deviceId);
      setSelectedRiskDetail(detail);
    } catch (detailError) {
      setError(localizeMessage(detailError.message));
    } finally {
      setRiskDetailLoading(false);
    }
  }

  async function loadRiskEventTimeline(riskEventId) {
    if (!riskEventId) {
      setSelectedIncidentTimeline([]);
      return;
    }

    try {
      const timeline = await api.getRiskEventTimeline(token, riskEventId, deviceId);
      setSelectedIncidentTimeline(timeline);
    } catch (timelineError) {
      setError(localizeMessage(timelineError.message));
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
      setRuleCatalog([]);
      setSecurityOverview(null);
      setSecurityDevices([]);
      setSecuritySessions([]);
      setSecurityPolicies([]);
      setLabScenarios([]);
      setSelectedRiskEventId("");
      setSelectedRiskDetail(null);
      setSelectedIncidentTimeline([]);
      setLastLabExecution(null);
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
      await loadCandles(orderForm.symbol, chartInterval, { silent: true });
      setLowerTab("orders");
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
                : actionType === "LOCK_ACCOUNT"
                  ? "계정 잠금 처리"
                  : actionType === "UNLOCK_ACCOUNT"
                    ? "계정 잠금 해제"
                    : "추가 인증 요청",
        },
        deviceId,
      );
      await refreshDashboard(token);
      await loadRiskEventDetail(riskEventId);
    } catch (actionError) {
      setError(localizeMessage(actionError.message));
      setLoading(false);
    }
  }

  async function handleExecuteLabScenario(scenarioCode) {
    setScenarioLoadingCode(scenarioCode);
    setError("");

    try {
      const result = await api.executeLabScenario(token, scenarioCode, deviceId);
      setLastLabExecution(result);
      await refreshDashboard(token);
      if (result.created_risk_event_ids?.[0]) {
        setSelectedRiskEventId(result.created_risk_event_ids[0]);
      }
      setLowerTab("lab");
    } catch (scenarioError) {
      setError(localizeMessage(scenarioError.message));
    } finally {
      setScenarioLoadingCode("");
    }
  }

  async function handleDeviceAction(securityDeviceId, actionType) {
    setLoading(true);
    setError("");

    try {
      await api.applySecurityDeviceAction(
        token,
        securityDeviceId,
        {
          action_type: actionType,
          comment:
            actionType === "TRUST"
              ? "관리자 신뢰 단말 승인"
              : actionType === "BLOCK"
                ? "관리자 단말 차단"
                : "관리자 단계인증 유지",
        },
        deviceId,
      );
      await refreshDashboard(token);
    } catch (deviceError) {
      setError(localizeMessage(deviceError.message));
      setLoading(false);
    }
  }

  async function handleSessionRevoke(authSessionId) {
    setLoading(true);
    setError("");

    try {
      await api.revokeSecuritySession(
        token,
        authSessionId,
        {
          reason: "관리자 세션 회수",
        },
        deviceId,
      );
      await refreshDashboard(token);
    } catch (sessionError) {
      setError(localizeMessage(sessionError.message));
      setLoading(false);
    }
  }

  function handleSelectStock(stock) {
    setOrderForm((current) => ({
      ...current,
      symbol: stock.symbol,
      price: current.order_type === "LIMIT" ? String(Number(stock.current_price)) : current.price,
    }));
  }

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
  const selectedStock = stocks.find((stock) => stock.symbol === orderForm.symbol) || stockRows[0] || stocks[0] || null;
  const snapshot =
    buildStockSnapshot(selectedStock) || {
      currentPrice: 0,
      previousClose: 1,
      change: 0,
      changeRate: 0,
      open: 0,
      high: 0,
      low: 0,
      volume: 0,
      tradingValue: 0,
      tick: 10,
    };
  const activeCandle = candles[selectedCandleIndex] || candles[candles.length - 1] || null;
  const candleReferenceClose =
    candles.length > 1
      ? Number(candles[Math.max(candles.length - 2, 0)]?.close || 0)
      : Number(snapshot.previousClose || 0);
  const displaySnapshot =
    activeCandle
      ? {
          ...snapshot,
          currentPrice: Number(activeCandle.close),
          open: Number(activeCandle.open),
          high: Number(activeCandle.high),
          low: Number(activeCandle.low),
          previousClose: candleReferenceClose || Number(snapshot.previousClose || 0),
          change: Number(activeCandle.close) - (candleReferenceClose || Number(snapshot.previousClose || 0)),
          changeRate:
            candleReferenceClose || Number(snapshot.previousClose || 0)
              ? ((Number(activeCandle.close) - (candleReferenceClose || Number(snapshot.previousClose || 0))) /
                  (candleReferenceClose || Number(snapshot.previousClose || 0))) *
                100
              : 0,
          volume: Number(activeCandle.volume),
          tradingValue: Number(activeCandle.close) * Number(activeCandle.volume),
        }
      : snapshot;
  const referenceClose = Math.max(Number(displaySnapshot.previousClose || 0), 1);
  const orderBook = buildOrderBook(selectedStock, displaySnapshot);
  const investorFlows = buildInvestorFlows(selectedStock, displaySnapshot);
  const tradeTape = buildTradeTape(selectedStock, orders, displaySnapshot);
  const riskRows = buildUserRiskRows(user, orders, riskEvents, selectedStock);
  const holdings = portfolio?.holdings || [];
  const totalCostBasis = holdings.reduce(
    (sum, holding) => sum + Number(holding.average_price || 0) * Number(holding.quantity || 0),
    0,
  );
  const totalUnrealizedPnl = holdings.reduce((sum, holding) => sum + Number(holding.unrealized_pnl || 0), 0);
  const totalReturnRate = totalCostBasis ? (totalUnrealizedPnl / totalCostBasis) * 100 : 0;
  const watchlistCount = stocks.filter((stock) => stock.is_watchlist).length;
  const executedOrders = orders.filter((order) => order.status === "EXECUTED").length;
  const acceptedOrders = orders.filter((order) => order.status === "ACCEPTED").length;
  const heldOrders = orders.filter((order) => order.status === "HELD").length;
  const blockedOrders = orders.filter((order) => order.status === "BLOCKED").length;
  const criticalRiskCount = riskRows.filter((row) => row.severity === "CRITICAL").length;
  const kospiRows = stocks.filter((stock) => stock.market === "KOSPI");
  const kosdaqRows = stocks.filter((stock) => stock.market === "KOSDAQ");
  const kospiChangeRate = kospiRows.length
    ? kospiRows.reduce((sum, stock) => sum + Number(buildStockSnapshot(stock)?.changeRate || 0), 0) / kospiRows.length
    : 0;
  const kosdaqChangeRate = kosdaqRows.length
    ? kosdaqRows.reduce((sum, stock) => sum + Number(buildStockSnapshot(stock)?.changeRate || 0), 0) / kosdaqRows.length
    : 0;
  const marketIndices = [
    {
      label: "KOSPI",
      value: (2638.25 + kospiChangeRate * 8).toFixed(2),
      changeRate: kospiChangeRate,
      summary: `${kospiRows.length || 0}개 종목 기준`,
    },
    {
      label: "KOSDAQ",
      value: (854.4 + kosdaqChangeRate * 5).toFixed(2),
      changeRate: kosdaqChangeRate,
      summary: `${kosdaqRows.length || 0}개 종목 기준`,
    },
  ];
  const accountMonitorRows = [
    { label: "총자산", value: `${formatPrice(portfolio?.total_asset_value)}원`, className: "" },
    { label: "예수금", value: `${formatPrice(portfolio?.total_cash)}원`, className: "" },
    { label: "평가손익", value: `${formatPrice(totalUnrealizedPnl)}원`, className: getSignedClass(totalUnrealizedPnl) },
    { label: "수익률", value: formatPercent(totalReturnRate), className: getSignedClass(totalReturnRate) },
  ];
  const opsMonitorRows = [
    { label: "관심종목", value: `${watchlistCount}개`, className: "" },
    { label: "체결완료", value: `${executedOrders}건`, className: "" },
    { label: "접수대기", value: `${acceptedOrders}건`, className: acceptedOrders ? "is-flat" : "" },
    { label: "보류/차단", value: `${heldOrders + blockedOrders}건`, className: heldOrders + blockedOrders ? "is-down" : "" },
    { label: "위험이벤트", value: `${riskRows.length}건`, className: riskRows.length ? "is-down" : "" },
    { label: "고위험", value: `${criticalRiskCount}건`, className: criticalRiskCount ? "is-down" : "" },
  ];
  const shortcutRows = [
    { key: "F5", action: "전체 새로고침" },
    { key: "Alt+1", action: "주문 탭" },
    { key: "Alt+2", action: "분봉/일봉 탭" },
    { key: "Alt+3", action: "FDS 경보 탭" },
    { key: "Alt+4", action: "잔고 탭" },
    { key: "Alt+B / Alt+S", action: "매수 / 매도 전환" },
  ];
  const visibleLowerTabs = LOWER_TABS.filter((tab) => {
    if (tab.key === "audit" || tab.key === "lab") {
      return isAdmin;
    }
    return true;
  });
  const dailySeries = dailyCandles.length ? dailyCandles : candles;
  const chartFolderRows = ["관심그룹", "히스토리", "보유종목", "과거종목", "배터리", "반도체", "관심종목02", "관심종목03"];
  const afterHoursRows = candles
    .slice(-10)
    .reverse()
    .map((candle, index) => {
      const basis = Number(candle.close);
      const price = basis + ((index % 3) - 1) * displaySnapshot.tick;
      const change = price - Number(displaySnapshot.previousClose || 0);
      return {
        id: `${candle.timestamp}-${index}`,
        time: formatCandleTimestamp(candle.timestamp, chartInterval),
        price,
        change,
        volume: Math.max(Math.round(Number(candle.volume) * 0.08), 10),
        session: index < 4 ? "장후 단일가" : "시간외 단일가",
      };
    });
  const averageDailyVolume = dailySeries.length
    ? dailySeries.reduce((sum, candle) => sum + Number(candle.volume || 0), 0) / dailySeries.length
    : Number(displaySnapshot.volume || 0);
  const comparisonRows = [
    {
      label: "현재가 vs 전일종가",
      today: formatPrice(displaySnapshot.currentPrice),
      previous: formatPrice(displaySnapshot.previousClose),
      delta: formatPercent(displaySnapshot.changeRate),
      className: getSignedClass(displaySnapshot.changeRate),
    },
    {
      label: "시가 vs 전일종가",
      today: formatPrice(displaySnapshot.open),
      previous: formatPrice(displaySnapshot.previousClose),
      delta: formatPercent(((displaySnapshot.open - displaySnapshot.previousClose) / referenceClose) * 100),
      className: getSignedClass(displaySnapshot.open - displaySnapshot.previousClose),
    },
    {
      label: "고가 vs 전일종가",
      today: formatPrice(displaySnapshot.high),
      previous: formatPrice(displaySnapshot.previousClose),
      delta: formatPercent(((displaySnapshot.high - displaySnapshot.previousClose) / referenceClose) * 100),
      className: "is-up",
    },
    {
      label: "저가 vs 전일종가",
      today: formatPrice(displaySnapshot.low),
      previous: formatPrice(displaySnapshot.previousClose),
      delta: formatPercent(((displaySnapshot.low - displaySnapshot.previousClose) / referenceClose) * 100),
      className: "is-down",
    },
    {
      label: "거래량 vs 평균",
      today: formatVolume(displaySnapshot.volume),
      previous: formatVolume(averageDailyVolume),
      delta: formatPercent(((Number(displaySnapshot.volume || 0) - averageDailyVolume) / Math.max(averageDailyVolume, 1)) * 100),
      className: getSignedClass(Number(displaySnapshot.volume || 0) - averageDailyVolume),
    },
  ];
  const selectedRiskSummary = riskEvents.find((event) => event.id === selectedRiskEventId) || riskEvents[0] || null;
  const selectedRiskHits = selectedRiskDetail?.rule_hits || [];
  const selectedRiskActions = selectedRiskDetail?.admin_actions || [];
  const relatedAuditLogs = auditLogs.filter((log) => {
    const payload = log.payload?.data || {};
    return (
      log.target_id === selectedRiskEventId ||
      payload.risk_event_id === selectedRiskEventId ||
      (selectedRiskSummary?.order_id && log.target_id === selectedRiskSummary.order_id) ||
      (selectedRiskSummary?.order_id && payload.created_order_ids?.includes?.(selectedRiskSummary.order_id)) ||
      (selectedRiskSummary?.user_id && log.actor_user_id === selectedRiskSummary.user_id)
    );
  });
  const regionThreatRows = Object.entries(
    riskEvents.reduce((accumulator, event) => {
      const region = REGION_LABELS[event.region] || event.region;
      accumulator[region] = (accumulator[region] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([region, count]) => ({ region, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const deviceThreatRows = Object.entries(
    riskEvents.reduce((accumulator, event) => {
      accumulator[event.device_id] = (accumulator[event.device_id] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([device, count]) => ({ device, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const pendingReviewCount = riskEvents.filter((event) => event.status === "OPEN").length;
  const authRequiredCount = riskEvents.filter(
    (event) => event.status === "AUTH_REQUIRED" || event.decision === "AUTH_REQUIRED",
  ).length;
  const blockedRiskEventCount = riskEvents.filter((event) => event.decision === "BLOCKED").length;
  const watchlistThreatCount = riskEvents.filter((event) =>
    stocks.some((stock) => stock.symbol === event.symbol && stock.is_watchlist),
  ).length;
  const uniqueThreatUsers = new Set(riskEvents.map((event) => event.user_id)).size;
  const lockedActionCount = auditLogs.filter(
    (log) => log.event_type === "ADMIN_ACTION" && log.payload?.data?.action_type === "LOCK_ACCOUNT",
  ).length;
  const surveillanceSummaryCards = [
    { label: "검토 대기", value: `${pendingReviewCount}건`, note: "수동 분석 필요", className: pendingReviewCount ? "is-down" : "" },
    { label: "추가 인증", value: `${authRequiredCount}건`, note: "OTP·본인확인 요청", className: authRequiredCount ? "is-flat" : "" },
    { label: "차단 조치", value: `${blockedRiskEventCount}건`, note: "자동/수동 차단 포함", className: blockedRiskEventCount ? "is-down" : "" },
    { label: "관심종목 위협", value: `${watchlistThreatCount}건`, note: "감시종목 주문 연계", className: watchlistThreatCount ? "is-up" : "" },
  ];
  const marketReferenceRows = [...stockRows]
    .map((stock) => {
      const rowSnapshot = buildStockSnapshot(stock);
      return {
        stock,
        rowSnapshot,
      };
    })
    .sort((left, right) => Math.abs(right.rowSnapshot.changeRate) - Math.abs(left.rowSnapshot.changeRate))
    .slice(0, 8);
  const selectedEntityRows = selectedRiskSummary
    ? [
        { label: "이벤트 ID", value: shortId(selectedRiskSummary.id) },
        { label: "주문 ID", value: shortId(selectedRiskSummary.order_id) },
        { label: "종목", value: `${selectedRiskSummary.symbol}` },
        { label: "사용자", value: shortId(selectedRiskSummary.user_id) },
        { label: "접속 IP", value: selectedRiskSummary.ip_address },
        {
          label: "지역 / 디바이스",
          value: `${REGION_LABELS[selectedRiskSummary.region] || selectedRiskSummary.region} / ${selectedRiskSummary.device_id}`,
        },
      ]
    : [];
  const responseGuideRows = selectedRiskHits.slice(0, 4);
  const securityKpiCards = [
    {
      label: "활성 세션",
      value: `${securityOverview?.active_sessions || 0}건`,
      note: `고위험 ${securityOverview?.step_up_sessions || 0}건`,
      className: securityOverview?.step_up_sessions ? "is-down" : "",
    },
    {
      label: "신뢰 단말",
      value: `${securityOverview?.trusted_devices || 0}건`,
      note: `차단 ${securityOverview?.blocked_devices || 0}건`,
      className: securityOverview?.blocked_devices ? "is-down" : "",
    },
    {
      label: "추가 인증",
      value: `${securityOverview?.pending_additional_auth || 0}건`,
      note: `사건 ${securityOverview?.auth_required_events || 0}건`,
      className: securityOverview?.pending_additional_auth ? "is-flat" : "",
    },
    {
      label: "동시 세션 사용자",
      value: `${securityOverview?.concurrent_session_users || 0}명`,
      note: `이상 로그인 ${securityOverview?.anomalous_logins_24h || 0}건`,
      className: securityOverview?.concurrent_session_users ? "is-down" : "",
    },
  ];
  const highRiskSessionRows = [...securitySessions]
    .sort((left, right) => right.risk_score - left.risk_score)
    .slice(0, 8);
  const devicePostureRows = [...securityDevices]
    .sort((left, right) => right.risk_score - left.risk_score)
    .slice(0, 8);
  const incidentTimelineRows = selectedIncidentTimeline.slice(0, 20);
  const toolbarNote = isAdmin
    ? "관제 큐·세션·단말 7초 자동 갱신 / 사건 선택 후 조치 / F5 새로고침"
    : "공개 시세 API 기준, 7초 자동 갱신 / F5 새로고침 / Alt+1~4 탭 / Alt+B,S 매매";
  const displayTopTabs = isAdmin ? ADMIN_TOP_TABS : TOP_TABS;
  const displayTopTabCodes = isAdmin ? ADMIN_TOP_TAB_CODES : ["0101", "0110", "0120", "0301", "0130", "0140"];

  function renderAdminCenterView() {
    if (activeTopTab === 1) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">사건 분석</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>값</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>위험 이벤트</td>
                    <td>{selectedRiskSummary?.id || "-"}</td>
                  </tr>
                  <tr>
                    <td>종목 / 사용자</td>
                    <td>{selectedRiskSummary ? `${selectedRiskSummary.symbol} / ${selectedRiskSummary.user_id}` : "-"}</td>
                  </tr>
                  <tr>
                    <td>점수 / 등급</td>
                    <td>
                      {selectedRiskSummary ? `${selectedRiskSummary.total_score}점 / ${RISK_SEVERITY_LABELS[selectedRiskSummary.severity]}` : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td>접속 정보</td>
                    <td>
                      {selectedRiskSummary
                        ? `${selectedRiskSummary.ip_address} / ${REGION_LABELS[selectedRiskSummary.region] || selectedRiskSummary.region} / ${selectedRiskSummary.device_id}`
                        : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td>요약</td>
                    <td>{selectedRiskSummary?.summary || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">룰 히트 상세</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>룰 코드</th>
                    <th>룰명</th>
                    <th>점수</th>
                    <th>심각도</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRiskHits.length ? (
                    selectedRiskHits.map((hit) => (
                      <tr key={hit.id}>
                        <td>{hit.rule_code}</td>
                        <td>{hit.rule_name}</td>
                        <td>{hit.score}</td>
                        <td>{RISK_SEVERITY_LABELS[hit.severity] || hit.severity}</td>
                        <td>{hit.reason}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">{riskDetailLoading ? "사건 분석을 불러오는 중입니다." : "선택된 이벤트의 룰 히트가 없습니다."}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">관리자 조치 이력</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>조치</th>
                    <th>코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRiskActions.length ? (
                    selectedRiskActions.map((action) => (
                      <tr key={action.id}>
                        <td>{formatTime(action.created_at)}</td>
                        <td>{action.action_type}</td>
                        <td>{action.comment}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3">등록된 관리자 조치 이력이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 2) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">세션 보안 현황</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>사용자</th>
                    <th>단말</th>
                    <th>인증강도</th>
                    <th>상태</th>
                    <th>위험점수</th>
                    <th>조치</th>
                  </tr>
                </thead>
                <tbody>
                  {highRiskSessionRows.length ? (
                    highRiskSessionRows.map((session) => (
                      <tr key={session.id}>
                        <td>{session.user_email}</td>
                        <td>{session.device_label}</td>
                        <td>{AUTH_STRENGTH_LABELS[session.auth_strength] || session.auth_strength}</td>
                        <td>{SESSION_STATUS_LABELS[session.status] || session.status}</td>
                        <td className={getSignedClass(session.risk_score)}>{session.risk_score}</td>
                        <td>
                          {session.status === "ACTIVE" ? (
                            <button type="button" className="table-action-button" onClick={() => handleSessionRevoke(session.id)}>
                              회수
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">표시할 세션 정보가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">세션 KPI</div>
            <div className="panel-body">
              <div className="summary-strip">
                {securityKpiCards.map((card) => (
                  <article key={card.label} className="summary-card">
                    <span>{card.label}</span>
                    <strong className={card.className}>{card.value}</strong>
                    <small>{card.note}</small>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 3) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">신뢰 단말 콘솔</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>사용자</th>
                    <th>단말ID</th>
                    <th>신뢰도</th>
                    <th>위험</th>
                    <th>지역</th>
                    <th>세션</th>
                    <th>조치</th>
                  </tr>
                </thead>
                <tbody>
                  {devicePostureRows.length ? (
                    devicePostureRows.map((device) => (
                      <tr key={device.id}>
                        <td>{device.user_email}</td>
                        <td>{device.display_name}</td>
                        <td>{DEVICE_TRUST_LABELS[device.trust_status] || device.trust_status}</td>
                        <td className={getSignedClass(device.risk_score)}>{device.risk_score}</td>
                        <td>{REGION_LABELS[device.last_region] || device.last_region}</td>
                        <td>{device.active_session_count}</td>
                        <td className="table-action-cell">
                          <button type="button" className="table-action-button" onClick={() => handleDeviceAction(device.id, "TRUST")}>
                            신뢰
                          </button>
                          <button type="button" className="table-action-button" onClick={() => handleDeviceAction(device.id, "STEP_UP")}>
                            재인증
                          </button>
                          <button type="button" className="table-action-button danger" onClick={() => handleDeviceAction(device.id, "BLOCK")}>
                            차단
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">표시할 단말 정보가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">단말 위험 분포</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>단말</th>
                    <th>접속 IP</th>
                    <th>User-Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {devicePostureRows.slice(0, 5).map((device) => (
                    <tr key={`meta-${device.id}`}>
                      <td>{device.device_id}</td>
                      <td>{device.last_ip_address}</td>
                      <td>{device.last_user_agent || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 4) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">보안 정책 카탈로그</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>정책명</th>
                    <th>레이어</th>
                    <th>모드</th>
                    <th>기준</th>
                    <th>설명</th>
                  </tr>
                </thead>
                <tbody>
                  {securityPolicies.map((policy) => (
                    <tr key={policy.policy_code}>
                      <td>{policy.policy_code}</td>
                      <td>{policy.title}</td>
                      <td>{policy.layer}</td>
                      <td>{policy.mode}</td>
                      <td>{policy.threshold}</td>
                      <td>{policy.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">FDS 룰 카탈로그</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>룰 코드</th>
                    <th>룰명</th>
                    <th>점수</th>
                    <th>심각도</th>
                    <th>설명</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleCatalog.map((rule) => (
                    <tr key={rule.rule_code}>
                      <td>{rule.rule_code}</td>
                      <td>{rule.rule_name}</td>
                      <td>{rule.score}</td>
                      <td>{RISK_SEVERITY_LABELS[rule.severity] || rule.severity}</td>
                      <td>{rule.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 5) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">사건 타임라인</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>분류</th>
                    <th>심각도</th>
                    <th>제목</th>
                    <th>세부</th>
                  </tr>
                </thead>
                <tbody>
                  {incidentTimelineRows.length ? (
                    incidentTimelineRows.map((entry, index) => (
                      <tr key={`${entry.source_type}-${entry.source_id || index}`}>
                        <td>{formatTime(entry.timestamp)}</td>
                        <td>{entry.category}</td>
                        <td>{entry.severity}</td>
                        <td>{entry.title}</td>
                        <td>{entry.detail}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">선택된 사건의 타임라인이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">감사 추적</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>이벤트</th>
                    <th>대상</th>
                    <th>추적ID</th>
                    <th>요약</th>
                  </tr>
                </thead>
                <tbody>
                  {(relatedAuditLogs.length ? relatedAuditLogs : auditLogs).slice(0, 20).map((log) => (
                    <tr key={log.id}>
                      <td>{formatTime(log.created_at)}</td>
                      <td>{log.event_type}</td>
                      <td>{`${log.target_type} ${log.target_id || "-"}`}</td>
                      <td>{getAuditTraceId(log)}</td>
                      <td>{getAuditSummary(log)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 6) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">공격 실습 시나리오</div>
            <div className="panel-body lab-grid">
              {labScenarios.map((scenario) => (
                <article key={scenario.code} className="lab-card">
                  <div className="lab-card-header">
                    <div>
                      <strong>{scenario.title}</strong>
                      <p>{scenario.description}</p>
                    </div>
                    <ValuePill value="안전 실습" variant="neutral" />
                  </div>
                  <div className="lab-card-meta">
                    <span>탐지 포인트: {scenario.detection_focus}</span>
                    <span>예상 결과: {scenario.expected_outcome}</span>
                  </div>
                  <button
                    type="button"
                    className="lab-execute-button"
                    disabled={scenarioLoadingCode === scenario.code}
                    onClick={() => handleExecuteLabScenario(scenario.code)}
                  >
                    {scenarioLoadingCode === scenario.code ? "실행 중..." : "시나리오 실행"}
                  </button>
                </article>
              ))}
            </div>
          </section>

          {lastLabExecution ? (
            <section className="hts-panel">
              <div className="panel-title">최근 실습 결과</div>
              <div className="panel-body compact">
                <table className="hts-table">
                  <tbody>
                    <tr>
                      <th>시나리오</th>
                      <td>{lastLabExecution.scenario_code}</td>
                    </tr>
                    <tr>
                      <th>생성 주문</th>
                      <td>{lastLabExecution.created_order_ids?.join(", ") || "-"}</td>
                    </tr>
                    <tr>
                      <th>생성 위험 이벤트</th>
                      <td>{lastLabExecution.created_risk_event_ids?.join(", ") || "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      );
    }

    if (activeTopTab === 7) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">시장 참조</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>종목명</th>
                    <th>현재가</th>
                    <th>등락률</th>
                    <th>거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((stock) => {
                    const rowSnapshot = buildStockSnapshot(stock);
                    return (
                      <tr key={stock.id}>
                        <td>{stock.symbol}</td>
                        <td>{normalizeStockName(stock)}</td>
                        <td className={getSignedClass(rowSnapshot.change)}>{formatPrice(stock.current_price)}</td>
                        <td className={getSignedClass(rowSnapshot.changeRate)}>{formatPercent(rowSnapshot.changeRate)}</td>
                        <td>{formatVolume(rowSnapshot.volume)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="tab-view-stack">
        <section className="hts-panel">
          <div className="panel-title">실시간 경보 큐</div>
          <div className="panel-body compact">
            <table className="hts-table table-clickable">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>종목</th>
                  <th>점수</th>
                  <th>등급</th>
                  <th>판정</th>
                  <th>지역</th>
                  <th>장치</th>
                </tr>
              </thead>
              <tbody>
                {riskEvents.length ? (
                  riskEvents.map((event) => (
                    <tr
                      key={event.id}
                      className={event.id === selectedRiskEventId ? "selected" : ""}
                      onClick={() => setSelectedRiskEventId(event.id)}
                    >
                      <td>{formatTime(event.created_at)}</td>
                      <td>{event.symbol}</td>
                      <td>{event.total_score}</td>
                      <td>{RISK_SEVERITY_LABELS[event.severity] || event.severity}</td>
                      <td>{RISK_DECISION_LABELS[event.decision] || event.decision}</td>
                      <td>{REGION_LABELS[event.region] || event.region}</td>
                      <td>{event.device_id}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7">현재 관제 중인 이벤트가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="hts-panel">
          <div className="panel-title">선택 사건 포렌식</div>
          <div className="panel-body compact">
            <table className="hts-table">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>값</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>이벤트 상태</td>
                  <td>
                    {selectedRiskSummary
                      ? `${RISK_STATUS_LABELS[selectedRiskSummary.status] || selectedRiskSummary.status} / ${RISK_DECISION_LABELS[selectedRiskSummary.decision] || selectedRiskSummary.decision}`
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <td>요약</td>
                  <td>{selectedRiskSummary?.summary || "-"}</td>
                </tr>
                <tr>
                  <td>룰 히트 수</td>
                  <td>{selectedRiskHits.length}건</td>
                </tr>
                <tr>
                  <td>관련 감사 로그</td>
                  <td>{relatedAuditLogs.length}건</td>
                </tr>
                <tr>
                  <td>최근 조치</td>
                  <td>{selectedRiskActions[0] ? `${selectedRiskActions[0].action_type} / ${selectedRiskActions[0].comment}` : "없음"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  function renderCenterView() {
    if (isAdmin) {
      return renderAdminCenterView();
    }

    if (activeTopTab === 1) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">복수 현재가</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>종목명</th>
                    <th>현재가</th>
                    <th>대비</th>
                    <th>등락률</th>
                    <th>시가</th>
                    <th>고가</th>
                    <th>저가</th>
                    <th>거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((stock) => {
                    const rowSnapshot = buildStockSnapshot(stock);
                    return (
                      <tr key={stock.id} className={stock.symbol === selectedStock?.symbol ? "selected" : ""}>
                        <td>{stock.symbol}</td>
                        <td>{normalizeStockName(stock)}</td>
                        <td className={getSignedClass(rowSnapshot.change)}>{formatPrice(stock.current_price)}</td>
                        <td className={getSignedClass(rowSnapshot.change)}>{formatChange(rowSnapshot.change)}</td>
                        <td className={getSignedClass(rowSnapshot.changeRate)}>{formatPercent(rowSnapshot.changeRate)}</td>
                        <td>{formatPrice(rowSnapshot.open)}</td>
                        <td className="is-up">{formatPrice(rowSnapshot.high)}</td>
                        <td className="is-down">{formatPrice(rowSnapshot.low)}</td>
                        <td>{formatVolume(rowSnapshot.volume)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hts-panel">
            <div className="panel-title">복수 현재가 요약</div>
            <div className="panel-body market-monitor-board">
              <div className="monitor-index-strip">
                {marketIndices.map((index) => (
                  <article key={index.label} className="index-tile">
                    <span>{index.label}</span>
                    <strong>{Number(index.value).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    <em className={getSignedClass(index.changeRate)}>{formatPercent(index.changeRate)}</em>
                  </article>
                ))}
              </div>
              <div className="monitor-section-grid">
                <section className="monitor-section">
                  <div className="monitor-section-title">계좌/수익</div>
                  <table className="mini-monitor-table">
                    <tbody>
                      {accountMonitorRows.map((row) => (
                        <tr key={row.label}>
                          <th>{row.label}</th>
                          <td className={row.className}>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="monitor-section">
                  <div className="monitor-section-title">주문/FDS</div>
                  <table className="mini-monitor-table">
                    <tbody>
                      {opsMonitorRows.map((row) => (
                        <tr key={row.label}>
                          <th>{row.label}</th>
                          <td className={row.className}>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 2) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">시간외 체결</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>세션</th>
                    <th>체결가</th>
                    <th>대비</th>
                    <th>체결량</th>
                  </tr>
                </thead>
                <tbody>
                  {afterHoursRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.time}</td>
                      <td>{row.session}</td>
                      <td className={getSignedClass(row.change)}>{formatPrice(row.price)}</td>
                      <td className={getSignedClass(row.change)}>{formatChange(row.change)}</td>
                      <td>{formatVolume(row.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="hts-panel">
            <div className="panel-title">시간외 참고</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>값</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>기준 종목</td>
                    <td>{selectedStock ? `${selectedStock.symbol} ${normalizeStockName(selectedStock)}` : "-"}</td>
                  </tr>
                  <tr>
                    <td>현재 기준가</td>
                    <td>{formatPrice(displaySnapshot.currentPrice)}</td>
                  </tr>
                  <tr>
                    <td>전일 종가</td>
                    <td>{formatPrice(displaySnapshot.previousClose)}</td>
                  </tr>
                  <tr>
                    <td>예상 체결건수</td>
                    <td>{afterHoursRows.length}건</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 3) {
      return (
        <section className="hts-panel chart-workspace-panel">
          <div className="panel-title">일자별 주가</div>
          <div className="panel-body chart-workspace">
            <aside className="chart-side-explorer">
              <div className="chart-explorer-title">관심그룹</div>
              <div className="chart-folder-list">
                {chartFolderRows.map((folder) => (
                  <button key={folder} type="button" className="chart-folder-row">
                    <span className="folder-icon" />
                    <span>{folder}</span>
                  </button>
                ))}
              </div>
              <div className="chart-explorer-title">종목</div>
              <div className="chart-symbol-list">
                {stockRows.slice(0, 16).map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    className={`chart-symbol-row ${stock.symbol === selectedStock?.symbol ? "active" : ""}`}
                    onClick={() => handleSelectStock(stock)}
                  >
                    <span>{normalizeStockName(stock)}</span>
                    <strong className={getSignedClass(buildStockSnapshot(stock)?.change)}>{formatPrice(stock.current_price)}</strong>
                  </button>
                ))}
              </div>
            </aside>

            <div className="chart-main-workspace">
              <div className="chart-workspace-toolbar">
                <div className="chart-workspace-head">
                  <strong>{selectedStock ? `${selectedStock.symbol} ${normalizeStockName(selectedStock)}` : "-"}</strong>
                  <span className={getSignedClass(displaySnapshot.change)}>
                    {formatPrice(displaySnapshot.currentPrice)} / {formatPercent(displaySnapshot.changeRate)}
                  </span>
                </div>
                <div className="chart-study-strip">
                  <span>이평선 5 10 20 60</span>
                  <span>{dailyLoading ? "일봉 갱신 중..." : "일봉 차트"}</span>
                </div>
              </div>

              <div className="chart-summary-ribbon">
                <span>시가 {formatPrice(displaySnapshot.open)}</span>
                <span>고가 {formatPrice(displaySnapshot.high)}</span>
                <span>저가 {formatPrice(displaySnapshot.low)}</span>
                <span>거래량 {formatVolume(displaySnapshot.volume)}</span>
                <span>전일대비 {formatChange(displaySnapshot.change)}</span>
              </div>

              <HtsChart series={dailySeries} interval="1d" selectedIndex={Math.max(dailySeries.length - 1, 0)} showStudies />
            </div>
          </div>
        </section>
      );
    }

    if (activeTopTab === 4) {
      const maxDepth = Math.max(...orderBook.map((row) => Number(row.quantity || 0)), 1);

      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">호가잔량 추이</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>호가</th>
                    <th>잔량</th>
                    <th>비중</th>
                    <th>추이</th>
                  </tr>
                </thead>
                <tbody>
                  {orderBook.map((row) => (
                    <tr key={`${row.side}-${row.level}`}>
                      <td>{row.side === "ask" ? `매도${row.level}` : `매수${row.level}`}</td>
                      <td className={getSignedClass(row.price - displaySnapshot.previousClose)}>{formatPrice(row.price)}</td>
                      <td>{formatVolume(row.quantity)}</td>
                      <td>{((Number(row.quantity || 0) / maxDepth) * 100).toFixed(1)}%</td>
                      <td>
                        <div className="depth-bar-track">
                          <div
                            className={`depth-bar-fill ${row.side === "ask" ? "ask" : "bid"}`}
                            style={{ width: `${(Number(row.quantity || 0) / maxDepth) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    if (activeTopTab === 5) {
      return (
        <div className="tab-view-stack">
          <section className="hts-panel">
            <div className="panel-title">당일 / 전일 주가비교</div>
            <div className="panel-body compact">
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>당일</th>
                    <th>전일/평균</th>
                    <th>비교</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.today}</td>
                      <td>{row.previous}</td>
                      <td className={row.className}>{row.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="tab-view-stack">
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
                <div className="code-box-text">
                  <strong>{normalizeStockName(selectedStock)}</strong>
                  <span>
                    {MARKET_LABELS[selectedStock?.market] || selectedStock?.market || "KRX"} /{" "}
                    {selectedStock?.is_watchlist ? "관심종목" : "일반종목"}
                  </span>
                </div>
              </div>
              <div className="price-block">
                <strong className={`primary-price ${getSignedClass(displaySnapshot?.change)}`}>
                  {formatPrice(displaySnapshot?.currentPrice)}
                </strong>
                <span className={getSignedClass(displaySnapshot?.change)}>
                  {formatChange(displaySnapshot?.change)} / {formatPercent(displaySnapshot?.changeRate)}
                </span>
              </div>
            </div>

            <div className="metric-grid">
              <MetricValue label="시가" value={formatPrice(displaySnapshot?.open)} />
              <MetricValue label="고가" value={formatPrice(displaySnapshot?.high)} className="is-up" />
              <MetricValue label="저가" value={formatPrice(displaySnapshot?.low)} className="is-down" />
              <MetricValue label="전일가" value={formatPrice(displaySnapshot?.previousClose)} />
              <MetricValue label="거래량" value={formatVolume(displaySnapshot?.volume)} />
              <MetricValue label="거래대금" value={formatVolume(displaySnapshot?.tradingValue)} />
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
                      <td className={getSignedClass(row.price - displaySnapshot.previousClose)}>{formatPrice(row.price)}</td>
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
            <div className="panel-title">
              <span>차트</span>
              <span className="panel-title-inline">
                {CANDLE_INTERVALS.find((item) => item.value === chartInterval)?.label || chartInterval}
              </span>
            </div>
            <div className="panel-body chart-panel-body">
              <div className="chart-toolbar">
                <div className="interval-strip">
                  {CANDLE_INTERVALS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`interval-button ${chartInterval === item.value ? "active" : ""}`}
                      onClick={() => setChartInterval(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className="chart-status">
                  {chartLoading
                    ? "차트 불러오는 중..."
                    : `기준시각 ${activeCandle ? formatCandleTimestamp(activeCandle.timestamp, chartInterval) : "-"}`}
                </span>
              </div>

              <div className="candle-metric-grid">
                <MetricValue
                  label="기준시각"
                  value={activeCandle ? formatCandleTimestamp(activeCandle.timestamp, chartInterval) : "-"}
                />
                <MetricValue label="시가" value={activeCandle ? formatPrice(activeCandle.open) : "-"} />
                <MetricValue label="고가" value={activeCandle ? formatPrice(activeCandle.high) : "-"} className="is-up" />
                <MetricValue label="저가" value={activeCandle ? formatPrice(activeCandle.low) : "-"} className="is-down" />
                <MetricValue
                  label="종가"
                  value={activeCandle ? formatPrice(activeCandle.close) : "-"}
                  className={getSignedClass(activeCandle ? Number(activeCandle.close) - Number(activeCandle.open) : 0)}
                />
                <MetricValue label="거래량" value={activeCandle ? formatVolume(activeCandle.volume) : "-"} />
              </div>

              <HtsChart
                series={candles}
                interval={chartInterval}
                selectedIndex={selectedCandleIndex}
                onSelect={setSelectedCandleIndex}
              />
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
      </div>
    );
  }

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
            <span>[{displayTopTabCodes[activeTopTab]}] {displayTopTabs[activeTopTab]}</span>
          </div>
          <div className="window-controls">
            <span />
            <span />
            <span />
          </div>
        </header>

        <div className="top-tab-strip">
          {displayTopTabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={`top-tab ${activeTopTab === index ? "active" : ""}`}
              onClick={() => setActiveTopTab(index)}
            >
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
            <div className="toolbar-note">{toolbarNote}</div>
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
            {isAdmin ? (
              <>
                <section className="hts-panel">
                  <div className="panel-title">실시간 이벤트 큐</div>
                  <div className="panel-body compact">
                    <table className="hts-table table-clickable">
                      <thead>
                        <tr>
                          <th>시간</th>
                          <th>종목</th>
                          <th>점수</th>
                          <th>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riskEvents.length ? (
                          riskEvents.slice(0, 10).map((event) => (
                            <tr
                              key={event.id}
                              className={event.id === selectedRiskEventId ? "selected" : ""}
                              onClick={() => {
                                setSelectedRiskEventId(event.id);
                                setActiveTopTab(0);
                              }}
                            >
                              <td>{formatTime(event.created_at)}</td>
                              <td>{event.symbol}</td>
                              <td className={getSignedClass(event.total_score)}>{event.total_score}</td>
                              <td>{RISK_DECISION_LABELS[event.decision] || event.decision}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4">현재 관제 중인 이벤트가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="hts-panel">
                  <div className="panel-title">관제 스냅샷</div>
                  <div className="panel-body surveillance-summary">
                    <div className="summary-strip">
                      {surveillanceSummaryCards.map((card) => (
                        <article key={card.label} className="summary-card">
                          <span>{card.label}</span>
                          <strong className={card.className}>{card.value}</strong>
                          <small>{card.note}</small>
                        </article>
                      ))}
                    </div>

                    <div className="monitor-section-grid">
                      <section className="monitor-section">
                        <div className="monitor-section-title">지역 상위</div>
                        <table className="mini-monitor-table">
                          <tbody>
                            {(regionThreatRows.length ? regionThreatRows : [{ region: "정상", count: 0 }]).map((row) => (
                              <tr key={row.region}>
                                <th>{row.region}</th>
                                <td>{row.count}건</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>

                      <section className="monitor-section">
                        <div className="monitor-section-title">디바이스 상위</div>
                        <table className="mini-monitor-table">
                          <tbody>
                            {(deviceThreatRows.length ? deviceThreatRows : [{ device: "정상", count: 0 }]).map((row) => (
                              <tr key={row.device}>
                                <th>{row.device}</th>
                                <td>{row.count}건</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>

                      <section className="monitor-section monitor-section-wide">
                        <div className="monitor-section-title">운영 지표</div>
                        <table className="mini-monitor-table">
                          <tbody>
                            <tr>
                              <th>관제 계정</th>
                              <td>{uniqueThreatUsers}명</td>
                            </tr>
                            <tr>
                              <th>잠금 조치</th>
                              <td>{lockedActionCount}건</td>
                            </tr>
                            <tr>
                              <th>감사 로그</th>
                              <td>{auditLogs.length}건</td>
                            </tr>
                            <tr>
                              <th>활성 세션</th>
                              <td>{securityOverview?.active_sessions || 0}건</td>
                            </tr>
                            <tr>
                              <th>차단 단말</th>
                              <td>{securityOverview?.blocked_devices || 0}건</td>
                            </tr>
                            <tr>
                              <th>실습 시나리오</th>
                              <td>{labScenarios.length}종</td>
                            </tr>
                          </tbody>
                        </table>
                      </section>
                    </div>
                  </div>
                </section>

                <section className="hts-panel">
                  <div className="panel-title">시장 참조</div>
                  <div className="panel-body compact">
                    <table className="hts-table">
                      <thead>
                        <tr>
                          <th>코드</th>
                          <th>종목명</th>
                          <th>현재가</th>
                          <th>등락률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketReferenceRows.map(({ stock, rowSnapshot }) => (
                          <tr key={stock.id}>
                            <td>{stock.symbol}</td>
                            <td>{normalizeStockName(stock)}</td>
                            <td className={getSignedClass(rowSnapshot.change)}>{formatPrice(stock.current_price)}</td>
                            <td className={getSignedClass(rowSnapshot.changeRate)}>{formatPercent(rowSnapshot.changeRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <>
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
                              <td>{stock.is_watchlist ? "관심" : stock.market}</td>
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

                <section className="hts-panel">
                  <div className="panel-title">시장 모니터</div>
                  <div className="panel-body market-monitor-board">
                    <div className="monitor-index-strip">
                      {marketIndices.map((index) => (
                        <article key={index.label} className="index-tile">
                          <span>{index.label}</span>
                          <strong>
                            {Number(index.value).toLocaleString("ko-KR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                          <em className={getSignedClass(index.changeRate)}>{formatPercent(index.changeRate)}</em>
                          <small>{index.summary}</small>
                        </article>
                      ))}
                    </div>
                    <div className="monitor-section-grid">
                      <section className="monitor-section">
                        <div className="monitor-section-title">계좌 / 손익</div>
                        <table className="mini-monitor-table">
                          <tbody>
                            {accountMonitorRows.map((row) => (
                              <tr key={row.label}>
                                <th>{row.label}</th>
                                <td className={row.className}>{row.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>

                      <section className="monitor-section">
                        <div className="monitor-section-title">주문 / FDS</div>
                        <table className="mini-monitor-table">
                          <tbody>
                            {opsMonitorRows.map((row) => (
                              <tr key={row.label}>
                                <th>{row.label}</th>
                                <td className={row.className}>{row.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>

                      <section className="monitor-section monitor-section-wide">
                        <div className="monitor-section-title">단축키</div>
                        <table className="mini-monitor-table">
                          <tbody>
                            {shortcutRows.map((row) => (
                              <tr key={row.key}>
                                <th>{row.key}</th>
                                <td>{row.action}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>
                    </div>
                  </div>
                </section>
              </>
            )}
          </aside>

          <section className="column-center">{renderCenterView()}</section>

          <aside className="column-right">
            {isAdmin ? (
              <>
                <section className="hts-panel">
                  <div className="panel-title">대응 콘솔</div>
                  <div className="panel-body risk-stack">
                    {selectedRiskSummary ? (
                      <article className="risk-card">
                        <div className="risk-card-header">
                          <strong>{selectedRiskSummary.symbol}</strong>
                          <ValuePill
                            value={RISK_SEVERITY_LABELS[selectedRiskSummary.severity] || selectedRiskSummary.severity}
                            variant="risk"
                          />
                        </div>
                        <div className="risk-card-meta">
                          <span>점수 {selectedRiskSummary.total_score}</span>
                          <span>{RISK_DECISION_LABELS[selectedRiskSummary.decision] || selectedRiskSummary.decision}</span>
                          <span>{RISK_STATUS_LABELS[selectedRiskSummary.status] || selectedRiskSummary.status}</span>
                        </div>
                        <div className="risk-card-meta">
                          <span>{REGION_LABELS[selectedRiskSummary.region] || selectedRiskSummary.region}</span>
                          <span>{selectedRiskSummary.device_id}</span>
                          <span>주문 {shortId(selectedRiskSummary.order_id)}</span>
                        </div>
                        <p>{selectedRiskSummary.summary}</p>
                        <div className="risk-card-actions risk-card-actions-admin">
                          <button type="button" onClick={() => handleAdminAction(selectedRiskSummary.id, "APPROVE")}>
                            승인
                          </button>
                          <button type="button" onClick={() => handleAdminAction(selectedRiskSummary.id, "BLOCK")}>
                            차단
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdminAction(selectedRiskSummary.id, "REQUEST_ADDITIONAL_AUTH")}
                          >
                            추가인증
                          </button>
                          <button type="button" onClick={() => handleAdminAction(selectedRiskSummary.id, "LOCK_ACCOUNT")}>
                            계정잠금
                          </button>
                          <button type="button" onClick={() => handleAdminAction(selectedRiskSummary.id, "UNLOCK_ACCOUNT")}>
                            잠금해제
                          </button>
                        </div>
                      </article>
                    ) : (
                      <div className="empty-box">선택된 위험 이벤트가 없습니다.</div>
                    )}
                  </div>
                </section>

                <section className="hts-panel">
                  <div className="panel-title">연관 엔터티</div>
                  <div className="panel-body compact">
                    <table className="hts-table">
                      <tbody>
                        {selectedEntityRows.length ? (
                          selectedEntityRows.map((row) => (
                            <tr key={row.label}>
                              <th>{row.label}</th>
                              <td>{row.value}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="2">선택된 이벤트의 엔터티 정보가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="hts-panel">
                  <div className="panel-title">즉시 대응 포인트</div>
                  <div className="panel-body compact">
                    <table className="hts-table">
                      <thead>
                        <tr>
                          <th>룰</th>
                          <th>점수</th>
                          <th>사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responseGuideRows.length ? (
                          responseGuideRows.map((row) => (
                            <tr key={row.id}>
                              <td>{row.rule_name}</td>
                              <td>{row.score}</td>
                              <td>{row.reason}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="3">선택된 이벤트의 룰 히트가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="hts-panel">
                  <div className="panel-title">운영 메모</div>
                  <div className="panel-body compact">
                    <table className="hts-table">
                      <tbody>
                        <tr>
                          <th>현재 큐</th>
                          <td>{riskEvents.length}건</td>
                        </tr>
                        <tr>
                          <th>관련 감사 로그</th>
                          <td>{relatedAuditLogs.length}건</td>
                        </tr>
                        <tr>
                          <th>룰 카탈로그</th>
                          <td>{ruleCatalog.length}종</td>
                        </tr>
                        <tr>
                          <th>최근 실습</th>
                          <td>{lastLabExecution?.scenario_code || "없음"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <>
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
                                  ? String(Number(selectedStock.current_price))
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
                          type={orderForm.order_type === "MARKET" ? "text" : "number"}
                          min="0"
                          step="1"
                          disabled={orderForm.order_type === "MARKET"}
                          value={
                            orderForm.order_type === "MARKET"
                              ? `${formatPrice(displaySnapshot?.currentPrice)} (시장가)`
                              : orderForm.price
                          }
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
                      <p className="info-note">
                        해외 지역이나 신규 기기에서 대량 주문을 넣으면 FDS 규칙이 즉시 점수를 부여하고 관리자 검토로 넘깁니다.
                      </p>
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
                        </article>
                      ))
                    ) : (
                      <div className="empty-box">현재 선택 종목에 대한 감시 이벤트가 없습니다.</div>
                    )}
                  </div>
                </section>
              </>
            )}
          </aside>
        </div>

        <section className="lower-panel">
          <div className="lower-tab-strip">
            {visibleLowerTabs.map((tab) => (
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
                    <th>미체결</th>
                    <th>상태</th>
                    <th>체결가</th>
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
                      <td>{formatVolume(order.remaining_quantity)}</td>
                      <td>{ORDER_STATUS_LABELS[order.status] || order.status}</td>
                      <td>{order.executed_price ? formatPrice(order.executed_price) : "-"}</td>
                      <td className={getSignedClass(order.fds_score)}>{order.fds_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {lowerTab === "candles" ? (
              <table className="hts-table table-clickable">
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>시가</th>
                    <th>고가</th>
                    <th>저가</th>
                    <th>종가</th>
                    <th>거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {candles.length ? (
                    candles
                      .slice()
                      .reverse()
                      .map((candle) => {
                        const actualIndex = candles.findIndex((item) => item.timestamp === candle.timestamp);
                        return (
                          <tr
                            key={candle.timestamp}
                            className={actualIndex === selectedCandleIndex ? "selected" : ""}
                            onClick={() => setSelectedCandleIndex(actualIndex)}
                          >
                            <td>{formatCandleTimestamp(candle.timestamp, chartInterval)}</td>
                            <td>{formatPrice(candle.open)}</td>
                            <td className="is-up">{formatPrice(candle.high)}</td>
                            <td className="is-down">{formatPrice(candle.low)}</td>
                            <td className={getSignedClass(Number(candle.close) - Number(candle.open))}>
                              {formatPrice(candle.close)}
                            </td>
                            <td>{formatVolume(candle.volume)}</td>
                          </tr>
                        );
                      })
                  ) : (
                    <tr>
                      <td colSpan="6">차트 데이터가 없습니다.</td>
                    </tr>
                  )}
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
                    <th>요약</th>
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
                        <td>{row.summary || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">표시할 FDS 이벤트가 없습니다.</td>
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
                    <th>수익률</th>
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
                        <td
                          className={getSignedClass(
                            holding.quantity && holding.average_price
                              ? (Number(holding.unrealized_pnl) / (Number(holding.average_price) * Number(holding.quantity))) * 100
                              : 0,
                          )}
                        >
                          {formatPercent(
                            holding.quantity && holding.average_price
                              ? (Number(holding.unrealized_pnl) / (Number(holding.average_price) * Number(holding.quantity))) * 100
                              : 0,
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">보유 종목이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : null}

            {lowerTab === "audit" && isAdmin ? (
              <table className="hts-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>이벤트</th>
                    <th>대상</th>
                    <th>요청추적</th>
                    <th>요청정보</th>
                    <th>요약</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length ? (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatTime(log.created_at)}</td>
                        <td>{log.event_type}</td>
                        <td>{`${log.target_type} ${log.target_id || "-"}`}</td>
                        <td>{getAuditTraceId(log)}</td>
                        <td>{`${log.ip_address} / ${REGION_LABELS[log.region] || log.region} / ${log.device_id}`}</td>
                        <td className="audit-summary-cell">{getAuditSummary(log)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">감사 로그가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : null}

            {lowerTab === "lab" && isAdmin ? (
              <div className="lab-grid">
                {labScenarios.length ? (
                  labScenarios.map((scenario) => (
                    <article key={scenario.code} className="lab-card">
                      <div className="lab-card-header">
                        <div>
                          <strong>{scenario.title}</strong>
                          <p>{scenario.description}</p>
                        </div>
                        <ValuePill value="안전 실습" variant="neutral" />
                      </div>
                      <div className="lab-card-meta">
                        <span>탐지 포인트: {scenario.detection_focus}</span>
                        <span>예상 결과: {scenario.expected_outcome}</span>
                      </div>
                      <button
                        type="button"
                        className="lab-execute-button"
                        disabled={scenarioLoadingCode === scenario.code}
                        onClick={() => handleExecuteLabScenario(scenario.code)}
                      >
                        {scenarioLoadingCode === scenario.code ? "실행 중..." : "시나리오 실행"}
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="empty-box">실행 가능한 실습 시나리오가 없습니다.</div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
