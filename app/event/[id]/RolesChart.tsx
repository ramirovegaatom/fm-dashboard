"use client";

import { useMemo, useState } from "react";
import { RoleBreakdown } from "@/lib/supabase";

type Group = "Marketing" | "Ventas" | "Servicio" | "Otros";

const GROUP_ORDER: Group[] = ["Marketing", "Ventas", "Servicio", "Otros"];

const GROUP_COLORS: Record<Group, string> = {
  Marketing: "var(--fg-status-info)",
  Ventas: "var(--fg-status-warning)",
  Servicio: "var(--fg-status-success)",
  Otros: "var(--fg-quaternary)",
};

const SENIORITY_ORDER = ["CxO", "VP", "Director", "Manager", "Senior", "Entry-level", "Sin clasificar"];

function classifyCargo(cargo: string): Group {
  const c = cargo.toLowerCase();
  if (/(marketing|cmo|brand|growth|content|social\s*media|comunicaci|publicidad|medios|pauta)/.test(c)) return "Marketing";
  if (/(sales|ventas|cro|comercial|bdr|sdr|account\s*executive|\bae\b|business\s*development|\bbd\b|revenue|vendedor)/.test(c)) return "Ventas";
  if (/(customer|success|servicio|soporte|support|\bcs\b|\bcx\b|experience|atenci|cliente)/.test(c)) return "Servicio";
  return "Otros";
}

function normalizeSeniority(s: string | null): string {
  return s ?? "Sin clasificar";
}

export function RolesChart({ roles }: { roles: RoleBreakdown[] }) {
  const [selected, setSelected] = useState<Group | null>(null);

  const groups = useMemo(() => {
    const acc: Record<Group, { total: number; seniority: Record<string, number>; cargos: Record<string, number> }> = {
      Marketing: { total: 0, seniority: {}, cargos: {} },
      Ventas: { total: 0, seniority: {}, cargos: {} },
      Servicio: { total: 0, seniority: {}, cargos: {} },
      Otros: { total: 0, seniority: {}, cargos: {} },
    };
    for (const r of roles) {
      const g = classifyCargo(r.cargo);
      acc[g].total += r.total;
      const sr = normalizeSeniority(r.seniority);
      acc[g].seniority[sr] = (acc[g].seniority[sr] ?? 0) + r.total;
      acc[g].cargos[r.cargo] = (acc[g].cargos[r.cargo] ?? 0) + r.total;
    }
    return acc;
  }, [roles]);

  const grandTotal = GROUP_ORDER.reduce((s, g) => s + groups[g].total, 0);

  if (grandTotal === 0) {
    return <div className="card text-muted" style={{ fontSize: 12 }}>Sin datos de roles para este evento.</div>;
  }

  const gradient = (() => {
    let acc = 0;
    const stops: string[] = [];
    for (const g of GROUP_ORDER) {
      const pct = groups[g].total / grandTotal;
      if (pct === 0) continue;
      const next = acc + pct * 360;
      stops.push(`${GROUP_COLORS[g]} ${acc}deg ${next}deg`);
      acc = next;
    }
    return `conic-gradient(${stops.join(", ")})`;
  })();

  const selectedGroup = selected ? groups[selected] : null;

  return (
    <div className="card">
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "center" }}>
        <div style={{ position: "relative", width: 200, height: 200, margin: "0 auto" }}>
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: gradient,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 110,
              height: 110,
              borderRadius: "50%",
              background: "var(--bg-primary)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700 }}>{grandTotal}</div>
            <div className="stat-label">Registros</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GROUP_ORDER.map((g) => {
            const pct = grandTotal === 0 ? 0 : Math.round((groups[g].total / grandTotal) * 100);
            const isSelected = selected === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setSelected(isSelected ? null : g)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? "var(--fg-primary)" : "var(--border-tertiary)"}`,
                  background: isSelected ? "var(--bg-secondary)" : "var(--bg-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 3, background: GROUP_COLORS[g], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{g}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{groups[g].total}</span>
                <span style={{ fontSize: 12, fontWeight: 600, width: 42, textAlign: "right" }}>{pct}%</span>
              </button>
            );
          })}
          <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
            Click en un grupo para ver breakdown por seniority
          </div>
        </div>
      </div>

      {selected && selectedGroup && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-tertiary)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div className="section-title" style={{ fontSize: 11 }}>Seniority · {selected}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SENIORITY_ORDER.filter((s) => (selectedGroup.seniority[s] ?? 0) > 0).map((s) => {
                  const n = selectedGroup.seniority[s];
                  const pct = Math.round((n / selectedGroup.total) * 100);
                  return (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ width: 90 }}>{s}</span>
                      <div className="bar" style={{ flex: 1 }}>
                        <div className="bar-fill" style={{ width: `${pct}%`, background: GROUP_COLORS[selected] }} />
                      </div>
                      <span className="text-muted" style={{ width: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {n} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="section-title" style={{ fontSize: 11 }}>Cargos · {selected}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {Object.entries(selectedGroup.cargos)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([cargo, n]) => (
                    <div key={cargo} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{cargo}</span>
                      <span className="text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
