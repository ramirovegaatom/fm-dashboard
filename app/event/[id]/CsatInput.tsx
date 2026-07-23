"use client";

import { useState } from "react";
import { saveCsat } from "./actions";

// CSAT del evento (Camilo/José 2026-07-23): estrellas 1-5 clickeables + valor con decimales
// (la encuesta de Luma devuelve promedios tipo 4.5; la meta del equipo es ≥4.5). Carga
// manual por ahora — fase 2: jalarlo de la API de Luma.
export function CsatInput({ eventId, currentValue }: { eventId: string; currentValue: number | null }) {
  const [value, setValue] = useState<string>(currentValue != null ? String(currentValue) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const num = parseFloat(value);
  const valid = !Number.isNaN(num) && num >= 1 && num <= 5;

  async function persist(v: number | null) {
    setSaving(true);
    try {
      await saveCsat(eventId, v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  }

  function clickStar(n: number) {
    setValue(String(n));
    void persist(n);
  }

  return (
    <div className="card">
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
        CSAT del evento (encuesta Luma, 1–5)
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Stars value={valid ? num : 0} onPick={clickStar} disabled={saving} />
        <input
          type="number"
          min="1"
          max="5"
          step="0.1"
          placeholder="—"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{
            width: 64,
            padding: "6px 8px",
            fontSize: 15,
            fontWeight: 700,
            border: "1px solid var(--border-tertiary)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            color: valid && num < 3 ? "var(--fg-status-error)" : valid && num >= 4.5 ? "var(--fg-status-success)" : "var(--fg-primary)",
            outline: "none",
            textAlign: "center",
          }}
        />
        <button
          onClick={() => void persist(valid ? num : null)}
          disabled={saving || (!valid && value !== "")}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "none",
            background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
            color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
            cursor: saving ? "wait" : "pointer",
            opacity: !valid && value !== "" ? 0.5 : 1,
          }}
        >
          {saving ? "..." : saved ? "Guardado" : "Guardar"}
        </button>
      </div>
      <div className="text-muted" style={{ fontSize: 10, marginTop: 6 }}>
        Meta: ≥ 4.5. Vacío + Guardar = borrar. Third-party sin encuesta: dejar vacío.
      </div>
    </div>
  );
}

// Fila de 5 estrellas: pinta según value (soporta medias visualmente por redondeo a 0.5)
// y setea enteros al click.
function Stars({ value, onPick, disabled }: { value: number; onPick: (n: number) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        const lit = fill >= 0.25;
        const half = lit && fill < 0.75; // media estrella: llena pero atenuada
        return (
          <button
            key={n}
            onClick={() => onPick(n)}
            disabled={disabled}
            title={`${n} estrella${n === 1 ? "" : "s"}`}
            style={{
              all: "unset",
              cursor: disabled ? "wait" : "pointer",
              fontSize: 22,
              lineHeight: 1,
              opacity: half ? 0.5 : 1,
              color: lit ? "var(--fg-status-warning)" : "var(--fg-quaternary)",
            }}
          >
            {lit ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
