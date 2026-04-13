"use client";

import { useState } from "react";
import { saveAdSpend } from "./actions";

export function AdSpendInput({ eventId, currentValue }: { eventId: string; currentValue: number }) {
  const [value, setValue] = useState(currentValue > 0 ? String(currentValue) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      await saveAdSpend(eventId, num);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  }

  return (
    <div className="card">
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>Inversi&oacute;n pauta (USD)</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 16,
            fontWeight: 600,
            border: "1px solid var(--border-tertiary)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            color: "var(--fg-primary)",
            outline: "none",
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !value}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "none",
            background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
            color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
            cursor: saving ? "wait" : "pointer",
            opacity: !value ? 0.5 : 1,
          }}
        >
          {saving ? "..." : saved ? "Guardado" : "Guardar"}
        </button>
      </div>
      {currentValue > 0 && !value && (
        <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
          Valor actual: ${currentValue.toLocaleString()}
        </div>
      )}
    </div>
  );
}
