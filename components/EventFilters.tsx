"use client";

import { TERRITORIOS, type Territorio } from "@/lib/territories";

export type TipoFilter = "todos" | "Presencial" | "Virtual" | "Third Party";
export type TerritorioFilter = "todos" | Territorio;

const PILL_BASE: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  cursor: "pointer",
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    ...PILL_BASE,
    background: active ? "var(--fg-primary)" : "var(--bg-primary)",
    color: active ? "var(--bg-primary)" : "var(--fg-secondary)",
  };
}

export function TipoEventoPills({
  value,
  onChange,
  counts,
}: {
  value: TipoFilter;
  onChange: (v: TipoFilter) => void;
  counts: Record<TipoFilter, number>;
}) {
  const opts: { label: string; value: TipoFilter }[] = [
    { label: "Todos", value: "todos" },
    { label: "Presenciales", value: "Presencial" },
    { label: "Webinars", value: "Virtual" },
    { label: "Third Party", value: "Third Party" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {opts.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} style={pillStyle(value === o.value)}>
          {o.label} ({counts[o.value] ?? 0})
        </button>
      ))}
    </div>
  );
}

export function TerritorioPills({
  value,
  onChange,
  counts,
}: {
  value: TerritorioFilter;
  onChange: (v: TerritorioFilter) => void;
  counts: Record<TerritorioFilter, number>;
}) {
  const opts: { label: string; value: TerritorioFilter }[] = [
    { label: "Todos territorios", value: "todos" },
    ...TERRITORIOS.map((t) => ({ label: t, value: t as TerritorioFilter })),
  ];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {opts.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} style={pillStyle(value === o.value)}>
          {o.label} ({counts[o.value] ?? 0})
        </button>
      ))}
    </div>
  );
}
