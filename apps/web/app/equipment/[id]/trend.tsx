type Point = { date: string; value: number; breach: boolean };

/**
 * 单序列时间线 + 临界值带 + 超标点。
 * 超标点用颜色、尺寸、白色描边环三重编码，不让颜色独自承担；
 * 只标首尾、第一个超标点和最严重的那个，连续超标时全标会挤成一团。
 * 下面附一张可展开的数据表，供读屏和打印。
 */
export function Trend({
  points,
  limit,
  unit,
}: {
  points: Point[];
  limit: { min?: number; max?: number } | null;
  unit: string | null;
}) {
  const width = 720;
  const height = 200;
  const pad = { top: 16, right: 16, bottom: 28, left: 40 };

  const values = points.map((point) => point.value);
  const candidates = [...values, limit?.min, limit?.max].filter((value): value is number => value !== undefined);
  const rawMin = Math.min(...candidates);
  const rawMax = Math.max(...candidates);
  const span = rawMax - rawMin || 1;
  const min = rawMin - span * 0.15;
  const max = rawMax + span * 0.15;

  const x = (index: number) =>
    pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");

  const firstBreach = points.findIndex((point) => point.breach);
  const worst = points.reduce(
    (best, point, index) => (point.breach && (best === -1 || point.value > (points[best]?.value ?? -Infinity)) ? index : best),
    -1,
  );
  const labelled = new Set([0, points.length - 1, firstBreach, worst].filter((index) => index >= 0));

  return (
    <>
      <div className="scroll">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="温度趋势">
          {limit && (limit.min !== undefined || limit.max !== undefined) ? (
            <rect
              x={pad.left}
              y={y(limit.max ?? max)}
              width={width - pad.left - pad.right}
              height={Math.abs(y(limit.min ?? min) - y(limit.max ?? max))}
              fill="currentColor"
              opacity={0.06}
            />
          ) : null}
          {limit?.max !== undefined ? (
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(limit.max)}
              y2={y(limit.max)}
              stroke="currentColor"
              strokeDasharray="4 4"
              opacity={0.35}
            />
          ) : null}
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.75} />
          {points.map((point, index) =>
            point.breach ? (
              <g key={point.date}>
                <circle cx={x(index)} cy={y(point.value)} r={6} fill="var(--card)" />
                <circle cx={x(index)} cy={y(point.value)} r={4.5} fill="var(--danger)" />
              </g>
            ) : (
              <circle key={point.date} cx={x(index)} cy={y(point.value)} r={2.5} fill="currentColor" opacity={0.6} />
            ),
          )}
          {[...labelled].map((index) => {
            const point = points[index];
            if (!point) return null;
            return (
              <text
                key={`label-${point.date}`}
                x={x(index)}
                y={y(point.value) - 10}
                fontSize={11}
                textAnchor="middle"
                fill="currentColor"
              >
                {point.value}
                {unit ?? ""}
              </text>
            );
          })}
          <text x={pad.left} y={height - 8} fontSize={11} fill="currentColor" opacity={0.6}>
            {points[0]?.date}
          </text>
          <text x={width - pad.right} y={height - 8} fontSize={11} textAnchor="end" fill="currentColor" opacity={0.6}>
            {points[points.length - 1]?.date}
          </text>
        </svg>
      </div>
      <details>
        <summary className="sub">看数据表</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>读数</th>
                <th>是否超标</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <td>{point.date}</td>
                  <td>
                    {point.value}
                    {unit ?? ""}
                  </td>
                  <td>{point.breach ? "超标" : "正常"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
