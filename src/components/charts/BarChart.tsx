type Bar = { label: string; value: number; color?: string };

/**
 * A small, dependency-free bar chart: thin rounded bars, a sequential single
 * hue by default (this is a magnitude encoding), sparse axis labels, and a
 * native-title hover tooltip on every bar.
 */
export function BarChart({
  data,
  height = 140,
  color = "#16a355",
  formatValue = (v: number) => `$${Math.round(v).toLocaleString()}`,
  labelEvery = 1,
}: {
  data: Bar[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  labelEvery?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const unit = 28;
  const chartHeight = height - 24;
  const width = Math.max(data.length * unit, 200);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
        {data.map((d, i) => {
          const barHeight = Math.max(2, (d.value / max) * chartHeight);
          const x = i * unit + 4;
          const y = chartHeight - barHeight;
          return (
            <g key={i}>
              <rect x={x} y={y} width={unit - 8} height={barHeight} rx={3} fill={d.color ?? color}>
                <title>{`${d.label}: ${formatValue(d.value)}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text
                  x={x + (unit - 8) / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#9ca3af"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Paired this-period / last-period bars per category, for a week-over-week or similar comparison. */
export function ComparisonBarChart({
  data,
  height = 140,
  colorA = "#16a355",
  colorB = "#d1d5db",
  formatValue = (v: number) => `$${Math.round(v).toLocaleString()}`,
}: {
  data: { label: string; a: number; b: number }[];
  height?: number;
  colorA?: string;
  colorB?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const unit = 56;
  const chartHeight = height - 24;
  const width = Math.max(data.length * unit, 200);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
        {data.map((d, i) => {
          const hA = Math.max(2, (d.a / max) * chartHeight);
          const hB = Math.max(2, (d.b / max) * chartHeight);
          const x = i * unit;
          return (
            <g key={i}>
              <rect x={x + 4} y={chartHeight - hA} width={18} height={hA} rx={3} fill={colorA}>
                <title>{`${d.label} — this period: ${formatValue(d.a)}`}</title>
              </rect>
              <rect x={x + 26} y={chartHeight - hB} width={18} height={hB} rx={3} fill={colorB}>
                <title>{`${d.label} — last period: ${formatValue(d.b)}`}</title>
              </rect>
              <text x={x + unit / 2} y={height - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">
                {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
