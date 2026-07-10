"use client";

import { TERRITORIOS, type Territorio } from "@/lib/territories";

export type TipoFilter = "todos" | "Presencial" | "Virtual" | "Third Party";
// "Latam" = todos los países menos Brasil (incluye territorios sin taguear). Jose 2026-07-10.
export type TerritorioFilter = "todos" | "Latam" | Territorio;

// Un territorio matchea el filtro. Latam = cualquier cosa que no sea Brasil.
export function matchTerritorio(t: string | null, filter: TerritorioFilter): boolean {
  if (filter === "todos") return true;
  if (filter === "Latam") return t !== "Brasil";
  return t === filter;
}

// Conteos por filtro de territorio (sirve para eventos o deals).
export function countByTerritorio<T>(items: T[], getT: (x: T) => string | null): Record<TerritorioFilter, number> {
  const c: Record<TerritorioFilter, number> = { todos: items.length, Latam: 0, Norte: 0, Sur: 0, Brasil: 0 };
  for (const it of items) {
    const t = getT(it);
    if (t !== "Brasil") c.Latam++;
    if (t === "Norte") c.Norte++;
    else if (t === "Sur") c.Sur++;
    else if (t === "Brasil") c.Brasil++;
  }
  return c;
}

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
    { label: "Latam", value: "Latam" },
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
