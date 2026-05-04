export function StatCard({
  value,
  label,
  color,
  sub,
}: {
  value: string | number;
  label: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
      {sub && (
        <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function FunnelArrow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "var(--border-tertiary)",
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </div>
  );
}
