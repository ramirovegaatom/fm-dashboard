"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { TERRITORIOS } from "@/lib/territories";
import { saveThirdPartyEventCost, saveThirdPartyAdSpend, saveThirdPartyEvent } from "./actions";

// 2026-07-10 (Jose): inputs manuales del detalle de eventos third-party (costo/pauta/país/territorio).
export function ThirdPartyDetailEditors({
  slug,
  eventCostBruto,
  eventIncome,
  adSpend,
  pais,
  territorio,
  hasGastoInvoices,
}: {
  slug: string;
  eventCostBruto: number;
  eventIncome: number;
  adSpend: number;
  pais: string | null;
  territorio: string | null;
  hasGastoInvoices: boolean;
}) {
  const neto = eventCostBruto - eventIncome;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
      {hasGastoInvoices ? (
        <div className="card">
          <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>Costo total del evento (neto)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: neto < 0 ? "var(--fg-status-success)" : undefined }}>
            {formatCurrency(neto)}
          </div>
          <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
            {formatCurrency(eventCostBruto)} gastos{eventIncome > 0 ? ` − ${formatCurrency(eventIncome)} ingresos` : ""} — ver abajo
          </div>
        </div>
      ) : (
        <NumberCard
          label="Costo total del evento (USD)"
          initial={eventCostBruto}
          onSave={(v) => saveThirdPartyEventCost(slug, v)}
          sub={eventIncome > 0 ? `neto ${formatCurrency(eventCostBruto - eventIncome)} (− ${formatCurrency(eventIncome)} ingresos)` : undefined}
        />
      )}
      <NumberCard label="Inversión en pauta (USD)" initial={adSpend} onSave={(v) => saveThirdPartyAdSpend(slug, v)} />
      <TerritoryCard slug={slug} pais={pais} territorio={territorio} />
    </div>
  );
}

function NumberCard({ label, initial, onSave, sub }: { label: string; initial: number; onSave: (v: number) => Promise<unknown>; sub?: string }) {
  const [val, setVal] = useState(String(initial > 0 ? initial : ""));
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  function handleSave() {
    const num = parseFloat(val);
    if (Number.isNaN(num) || num < 0) return;
    startTransition(async () => {
      await onSave(num);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }
  return (
    <div className="card">
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>$</span>
        <input
          type="number" min="0" step="0.01" value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0.00"
          style={{ ...inputStyle, flex: 1, fontSize: 18, fontWeight: 700 }}
        />
        <button onClick={handleSave} disabled={isPending} style={saveBtn(saved)}>
          {isPending ? "…" : saved ? "✓" : "Guardar"}
        </button>
      </div>
      {sub && <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TerritoryCard({ slug, pais, territorio }: { slug: string; pais: string | null; territorio: string | null }) {
  const [p, setP] = useState(pais ?? "");
  const [t, setT] = useState(territorio ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  function handleSave() {
    startTransition(async () => {
      await saveThirdPartyEvent(slug, { pais: p || null, territorio: t || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }
  return (
    <div className="card">
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>País / Territorio</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input value={p} onChange={(e) => setP(e.target.value)} placeholder="País" style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
        <select value={t} onChange={(e) => setT(e.target.value)} style={{ ...inputStyle, minWidth: 90 }}>
          <option value="">—</option>
          {TERRITORIOS.map((tr) => <option key={tr} value={tr}>{tr}</option>)}
        </select>
        <button onClick={handleSave} disabled={isPending} style={saveBtn(saved)}>
          {isPending ? "…" : saved ? "✓" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  border: "1px solid var(--border-tertiary)",
  borderRadius: 8,
  background: "var(--bg-secondary)",
  color: "var(--fg-primary)",
  outline: "none",
};
function saveBtn(saved: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
    color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
    cursor: "pointer",
  };
}
