export const DEMO_USERS = [
  { label: "트레이더", email: "trader@verve.local", password: "Trader1234!" },
  { label: "관리자", email: "admin@verve.local", password: "Admin1234!" },
  { label: "애널리스트", email: "analyst@verve.local", password: "Analyst1234!" },
];

export const ROLE_LABELS = {
  ADMIN: "관리자",
  USER: "일반",
  ANALYST: "애널리스트",
};

export const ORDER_SIDE_LABELS = {
  BUY: "매수",
  SELL: "매도",
};

export const ORDER_TYPE_LABELS = {
  MARKET: "시장가",
  LIMIT: "지정가",
};

export const ORDER_STATUS_LABELS = {
  PENDING: "대기",
  ACCEPTED: "접수",
  HELD: "보류",
  BLOCKED: "차단",
  EXECUTED: "체결",
  CANCELLED: "취소",
  REJECTED: "거부",
};

export const RISK_DECISION_LABELS = {
  ALLOW: "허용",
  HELD: "보류",
  BLOCKED: "차단",
  AUTH_REQUIRED: "추가인증",
};

export const RISK_SEVERITY_LABELS = {
  NORMAL: "정상",
  CAUTION: "주의",
  SUSPICIOUS: "의심",
  CRITICAL: "위험",
};

export const RISK_STATUS_LABELS = {
  AUTO_ALLOWED: "자동허용",
  OPEN: "검토대기",
  APPROVED: "승인",
  BLOCKED: "차단",
  AUTH_REQUIRED: "추가인증",
  RESOLVED: "종결",
};

export const ACCOUNT_STATUS_LABELS = {
  ACTIVE: "정상",
  LOCKED: "잠김",
};

export const DEVICE_TRUST_LABELS = {
  TRUSTED: "신뢰",
  WATCH: "관찰",
  STEP_UP_REQUIRED: "추가인증",
  BLOCKED: "차단",
};

export const SESSION_STATUS_LABELS = {
  ACTIVE: "활성",
  REVOKED: "회수",
  EXPIRED: "만료",
};

export const AUTH_STRENGTH_LABELS = {
  PASSWORD_ONLY: "비밀번호",
  PASSWORD_PLUS_DEVICE: "단말결합",
  STEP_UP_REQUIRED: "재인증필요",
  ADMIN_APPROVED: "관리자승인",
};

export const MARKET_LABELS = {
  ALL: "통합",
  KOSPI: "KRX",
  KOSDAQ: "NXT",
  WATCH: "관심",
};

export const REGION_LABELS = {
  KR: "국내",
  US: "미국",
  CN: "중국",
  RU: "러시아",
};

export const STOCK_NAME_MAP = {
  "005930": "삼성전자",
  "000660": "SK하이닉스",
  "035420": "네이버",
  "035720": "카카오",
  "051910": "LG화학",
};

export const CANDLE_INTERVALS = [
  { value: "1m", label: "1분" },
  { value: "3m", label: "3분" },
  { value: "5m", label: "5분" },
  { value: "10m", label: "10분" },
  { value: "1d", label: "일봉" },
];

export const TOP_TABS = ["현재가(1)", "복수 현재가(1)", "시간외 체결(1)", "일자별 주가(1)", "호가잔량 추이", "당일/전일 주가비교"];

export const LOWER_TABS = [
  { key: "orders", label: "체결1" },
  { key: "candles", label: "분봉/일봉" },
  { key: "risk", label: "FDS 경보" },
  { key: "holdings", label: "잔고" },
  { key: "audit", label: "감사로그" },
  { key: "lab", label: "공격 실습" },
];

export function formatPrice(value) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatSignedNumber(value, digits = 2) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(digits)}`;
}

export function formatPercent(value) {
  return `${formatSignedNumber(value, 2)}%`;
}

export function formatChange(value) {
  return formatSignedNumber(value, 0);
}

export function formatVolume(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value || 0));
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatCandleTimestamp(value, interval = "1m") {
  const date = new Date(value);
  if (interval === "1d") {
    return date.toLocaleDateString("ko-KR");
  }
  return date.toLocaleString("ko-KR", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeStockName(stock) {
  return STOCK_NAME_MAP[stock?.symbol] || stock?.name || "-";
}

export function symbolSeed(symbol = "") {
  return symbol.split("").reduce((total, character) => total + character.charCodeAt(0), 0) || 1;
}

export function getTickSize(price) {
  const amount = Number(price || 0);
  if (amount >= 500000) {
    return 1000;
  }
  if (amount >= 100000) {
    return 500;
  }
  if (amount >= 50000) {
    return 100;
  }
  if (amount >= 10000) {
    return 50;
  }
  return 10;
}

export function getSignedClass(value) {
  if (Number(value) > 0) {
    return "is-up";
  }
  if (Number(value) < 0) {
    return "is-down";
  }
  return "is-flat";
}

export function localizeMessage(message) {
  const dictionary = {
    "Invalid credentials": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "Account is locked": "계정이 잠겨 있습니다.",
    "Authentication required": "로그인이 필요합니다.",
    "Invalid token": "세션이 만료되었습니다. 다시 로그인해 주세요.",
    "User not found": "사용자 정보를 찾을 수 없습니다.",
    "Account not found": "계좌 정보를 찾을 수 없습니다.",
    "Stock not found": "종목 정보를 찾을 수 없습니다.",
    "Insufficient cash balance": "예수금이 부족합니다.",
    "Insufficient holdings": "보유 수량이 부족합니다.",
    "Limit orders require a price": "지정가 주문은 가격 입력이 필요합니다.",
    "Only pending, accepted, or held orders can be cancelled": "대기, 접수, 보류 상태의 주문만 취소할 수 있습니다.",
    "Risk event not found": "위험 이벤트를 찾을 수 없습니다.",
    "Admin access required": "관리자 권한이 필요합니다.",
    "Unsupported admin action": "지원하지 않는 관리자 조치입니다.",
    "Lab scenario not found": "실습 시나리오를 찾을 수 없습니다.",
    "Request failed": "요청 처리 중 오류가 발생했습니다.",
  };

  return dictionary[message] || message;
}

export function buildStockSnapshot(stock) {
  if (!stock) {
    return null;
  }

  const currentPrice = Number(stock.current_price || stock.price || 0);
  const seed = symbolSeed(stock.symbol);
  const tick = getTickSize(currentPrice);
  const previousClose = Math.max(
    Number(stock.previous_close || 0) || currentPrice - (((seed % 7) - 3) * tick * 2),
    tick,
  );
  const change = currentPrice - previousClose;
  const changeRate = previousClose ? (change / previousClose) * 100 : 0;
  const open = Math.max(Number(stock.open || 0) || previousClose + (((seed % 5) - 2) * tick), tick);
  const high = Math.max(
    Number(stock.day_high || 0) || Math.max(currentPrice, open) + ((((seed + 1) % 4) + 1) * tick),
    tick,
  );
  const low = Math.max(
    Number(stock.day_low || 0) || Math.min(currentPrice, open) - ((((seed + 2) % 4) + 1) * tick),
    tick,
  );
  const volume = Number(stock.volume || 110000 + seed * 173);
  const tradingValue = currentPrice * volume;

  return {
    currentPrice,
    previousClose,
    change,
    changeRate,
    open,
    high,
    low,
    volume,
    tradingValue,
    tick,
  };
}

export function buildOrderBook(stock, snapshot) {
  if (!stock || !snapshot) {
    return [];
  }

  const rows = [];
  const base = snapshot.currentPrice;
  const tick = snapshot.tick;
  const seed = symbolSeed(stock.symbol);

  for (let offset = 5; offset >= 1; offset -= 1) {
    const price = base + offset * tick;
    const rate = snapshot.previousClose ? ((price - snapshot.previousClose) / snapshot.previousClose) * 100 : 0;
    rows.push({
      side: "ask",
      level: 6 - offset,
      broker: ["미래", "신한", "키움", "한국", "메리츠"][offset - 1],
      price,
      rate,
      quantity: 1500 + ((seed * offset * 37) % 180000),
    });
  }

  for (let offset = 0; offset < 5; offset += 1) {
    const price = Math.max(base - offset * tick, tick);
    const rate = snapshot.previousClose ? ((price - snapshot.previousClose) / snapshot.previousClose) * 100 : 0;
    rows.push({
      side: "bid",
      level: offset + 1,
      broker: ["NH", "KB", "삼성", "대신", "유안타"][offset],
      price,
      rate,
      quantity: 2100 + ((seed * (offset + 2) * 53) % 180000),
    });
  }

  return rows;
}

export function buildInvestorFlows(stock, snapshot) {
  if (!stock || !snapshot) {
    return [];
  }

  const seed = symbolSeed(stock.symbol);
  const names = ["외국인", "기관", "개인", "연기금", "투신", "금융투자"];

  return names.map((name, index) => {
    const sell = 90000 + ((seed * (index + 1) * 71) % 400000);
    const buy = 85000 + ((seed * (index + 2) * 67) % 400000);
    const net = buy - sell;

    return {
      name,
      sell,
      buy,
      ratio: ((buy + sell) / Math.max(snapshot.volume, 1)) * 100,
      net,
    };
  });
}

export function buildTradeTape(stock, orders, snapshot) {
  if (!stock || !snapshot) {
    return [];
  }

  const liveOrders = orders
    .filter((order) => order.symbol === stock.symbol)
    .slice(0, 10)
    .map((order, index) => ({
      id: order.id,
      time: formatTime(order.last_execution_at || order.created_at),
      price: Number(order.executed_price || order.price || snapshot.currentPrice),
      change: Number(order.executed_price || order.price || snapshot.currentPrice) - snapshot.previousClose,
      sellPrice: Number(order.executed_price || order.price || snapshot.currentPrice) + snapshot.tick,
      buyPrice: Number(order.executed_price || order.price || snapshot.currentPrice) - snapshot.tick,
      quantity: order.executed_quantity || order.quantity,
      side: order.side,
      status: ORDER_STATUS_LABELS[order.status] || order.status,
      source: order.status === "EXECUTED" ? "체결" : index % 2 === 0 ? "주문" : "대기",
    }));

  if (liveOrders.length >= 6) {
    return liveOrders;
  }

  const seed = symbolSeed(stock.symbol);
  const synthetic = [];

  for (let index = 0; index < 10 - liveOrders.length; index += 1) {
    const minute = 30 + index;
    const price = snapshot.currentPrice + ((((seed + index) % 5) - 2) * snapshot.tick);
    synthetic.push({
      id: `sample-${stock.symbol}-${index}`,
      time: `15:${String(minute % 60).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`,
      price,
      change: price - snapshot.previousClose,
      sellPrice: price + snapshot.tick,
      buyPrice: Math.max(price - snapshot.tick, snapshot.tick),
      quantity: 100 + ((seed * (index + 1) * 11) % 15000),
      side: index % 2 === 0 ? "BUY" : "SELL",
      status: "예상",
      source: "체결",
    });
  }

  return [...liveOrders, ...synthetic].slice(0, 10);
}

export function buildUserRiskRows(user, orders, riskEvents, selectedStock) {
  if (!selectedStock) {
    return [];
  }

  if (user?.role === "ADMIN") {
    return riskEvents.filter((event) => event.symbol === selectedStock.symbol).slice(0, 6);
  }

  return orders
    .filter((order) => order.symbol === selectedStock.symbol && Number(order.fds_score) > 0)
    .map((order) => ({
      id: order.id,
      symbol: order.symbol,
      total_score: order.fds_score,
      severity: order.risk_severity,
      decision: order.risk_decision,
      status: order.status,
      summary: `${ORDER_SIDE_LABELS[order.side] || order.side} 주문 ${order.quantity}주 감시`,
      created_at: order.created_at,
    }))
    .slice(0, 6);
}
