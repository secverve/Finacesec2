export default function HtsChart({ series }) {
  if (!series.length) {
    return <div className="empty-box">차트 데이터가 없습니다.</div>;
  }

  const width = 520;
  const height = 210;
  const paddingX = 24;
  const paddingY = 16;
  const maxHigh = Math.max(...series.map((item) => item.high));
  const minLow = Math.min(...series.map((item) => item.low));
  const range = Math.max(maxHigh - minLow, 1);
  const step = (width - paddingX * 2) / series.length;

  const scaleY = (value) => paddingY + ((maxHigh - value) / range) * (height - paddingY * 2);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="hts-chart-svg" role="img" aria-label="시세 차트">
        {[0, 1, 2, 3].map((line) => {
          const y = paddingY + ((height - paddingY * 2) / 3) * line;
          return <line key={line} x1="0" y1={y} x2={width} y2={y} className="chart-grid-line" />;
        })}
        {series.map((item, index) => {
          const x = paddingX + step * index + step / 2;
          const bodyWidth = Math.max(step * 0.46, 6);
          const openY = scaleY(item.open);
          const closeY = scaleY(item.close);
          const highY = scaleY(item.high);
          const lowY = scaleY(item.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
          const up = item.close >= item.open;

          return (
            <g key={`${item.label}-${index}`}>
              <line x1={x} y1={highY} x2={x} y2={lowY} className={`chart-wick ${up ? "up" : "down"}`} />
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                className={`chart-body ${up ? "up" : "down"}`}
              />
            </g>
          );
        })}
      </svg>
      <div className="chart-footer">
        {series.filter((_, index) => index % 5 === 0).map((item) => (
          <span key={item.label}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}
