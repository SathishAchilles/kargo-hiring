// The five sub-scores as a pentagon. A picture of the candidate's shape; the bars and
// numbers beside it carry the exact values, so this is a supplement, not the only source.
export function RadarChart({ scores, labels, size = 200 }: { scores: number[]; labels: string[]; size?: number }) {
  const centre = size / 2;
  const radius = size / 2 - 34;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / scores.length;
    const r = (value / 5) * radius;
    return [centre + Math.cos(angle) * r, centre + Math.sin(angle) * r] as const;
  };
  const ring = (level: number) => scores.map((_, index) => point(index, level).join(",")).join(" ");
  const shape = scores.map((score, index) => point(index, score).join(",")).join(" ");
  return (
    <svg
      role="img"
      aria-label={`Sub-scores: ${labels.map((label, index) => `${label} ${scores[index]}`).join(", ")}`}
      viewBox={`0 0 ${size} ${size}`}
      className="size-48 shrink-0 overflow-visible"
    >
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon key={level} points={ring(level)} className={level === 5 ? "fill-none stroke-border" : "fill-none stroke-border/60"} strokeWidth={1} />
      ))}
      {scores.map((_, index) => {
        const [x, y] = point(index, 5);
        return <line key={index} x1={centre} y1={centre} x2={x} y2={y} className="stroke-border/70" strokeWidth={1} />;
      })}
      <polygon points={shape} className="anim-fade-up fill-primary/20 stroke-primary" strokeWidth={2} strokeLinejoin="round" />
      {scores.map((score, index) => {
        const [x, y] = point(index, score);
        return <circle key={index} cx={x} cy={y} r={3} className="fill-primary" />;
      })}
      {labels.map((label, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / scores.length;
        const x = centre + Math.cos(angle) * (radius + 16);
        const y = centre + Math.sin(angle) * (radius + 16) + 4;
        return (
          <text key={label} x={x} y={y} textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
