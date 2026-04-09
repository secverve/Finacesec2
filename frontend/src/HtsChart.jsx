import { formatCandleTimestamp, formatPrice, formatVolume } from "./htsData";

export default function HtsChart({ series, interval = "1m", selectedIndex = -1, onSelect }) {
  if (!series.length) {
    return <div className="empty-box">차트 데이터가 없습니다.</div>;
  }

  const width = 620;
  const height = 300;
  const paddingLeft = 18;
  const paddingRight = 62;
  const paddingTop = 12;
  const priceHeight = 188;
  const volumeTop = 214;
  const volumeHeight = 52;
  const minLow = Math.min(...series.map((item) => Number(item.low)));
  const maxHigh = Math.max(...series.map((item) => Number(item.high)));
  const range = Math.max(maxHigh - minLow, 1);
  const maxVolume = Math.max(...series.map((item) => Number(item.volume || 0)), 1);
  const step = (width - paddingLeft - paddingRight) / Math.max(series.length, 1);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : series.length - 1;
  const activeCandle = series[activeIndex] || series[series.length - 1];

  const scaleY = (value) => paddingTop + ((maxHigh - Number(value)) / range) * priceHeight;
  const scaleVolumeY = (value) => volumeTop + volumeHeight - (Number(value || 0) / maxVolume) * volumeHeight;
  const yTicks = [0, 1, 2, 3].map((tick) => maxHigh - (range / 3) * tick);
  const labelStep = Math.max(Math.floor(series.length / 5), 1);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="hts-chart-svg" role="img" aria-label="캔들 차트">
        {yTicks.map((price) => {
          const y = scaleY(price);
          return (
            <g key={price}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} className="chart-grid-line" />
              <text x={width - paddingRight + 8} y={y + 4} className="chart-axis-text">
                {formatPrice(price)}
              </text>
            </g>
          );
        })}

        <line x1={paddingLeft} y1={volumeTop} x2={width - paddingRight} y2={volumeTop} className="chart-grid-line" />

        {series.map((item, index) => {
          const x = paddingLeft + step * index + step / 2;
          const bodyWidth = Math.max(step * 0.52, 4);
          const openY = scaleY(item.open);
          const closeY = scaleY(item.close);
          const highY = scaleY(item.high);
          const lowY = scaleY(item.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
          const volumeY = scaleVolumeY(item.volume);
          const up = Number(item.close) >= Number(item.open);
          const selected = index === activeIndex;

          return (
            <g key={`${item.timestamp}-${index}`} className="chart-candle-group" onClick={() => onSelect?.(index)}>
              {selected ? (
                <rect
                  x={x - bodyWidth}
                  y={paddingTop}
                  width={bodyWidth * 2}
                  height={volumeTop + volumeHeight - paddingTop}
                  className="chart-selection"
                />
              ) : null}
              <line x1={x} y1={highY} x2={x} y2={lowY} className={`chart-wick ${up ? "up" : "down"}`} />
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                className={`chart-body ${up ? "up" : "down"}`}
              />
              <rect
                x={x - bodyWidth / 2}
                y={volumeY}
                width={bodyWidth}
                height={volumeTop + volumeHeight - volumeY}
                className={`chart-volume ${up ? "up" : "down"}`}
              />
            </g>
          );
        })}

        <line
          x1={paddingLeft}
          y1={scaleY(activeCandle.close)}
          x2={width - paddingRight}
          y2={scaleY(activeCandle.close)}
          className="chart-price-line"
        />
        <text x={width - paddingRight + 8} y={scaleY(activeCandle.close) - 4} className="chart-price-tag">
          {formatPrice(activeCandle.close)}
        </text>

        {series.map((item, index) => {
          if (index % labelStep !== 0 && index !== series.length - 1) {
            return null;
          }

          const x = paddingLeft + step * index + step / 2;
          return (
            <text key={`label-${item.timestamp}`} x={x} y={height - 10} textAnchor="middle" className="chart-axis-text">
              {formatCandleTimestamp(item.timestamp, interval)}
            </text>
          );
        })}
      </svg>

      <div className="chart-footer">
        <span>가격축: 원</span>
        <span>거래량: {formatVolume(activeCandle.volume)}</span>
        <span>{formatCandleTimestamp(activeCandle.timestamp, interval)}</span>
      </div>
    </div>
  );
}
