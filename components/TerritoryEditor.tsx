"use client";

import { useState, useTransition } from "react";
import { COUNTRIES } from "@/lib/countries";
import { TERRITORIOS, defaultTerritorio, type Territorio } from "@/lib/territories";
import { saveTerritory } from "@/app/event/[id]/actions";

export function TerritoryEditor({
  eventId,
  initialPais,
  initialTerritorio,
}: {
  eventId: string;
  initialPais: string | null;
  initialTerritorio: Territorio | null;
}) {
  const [pais, setPais] = useState(initialPais ?? "");
  const [territorio, setTerritorio] = useState<Territorio | "">(initialTerritorio ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handlePaisChange(newPais: string) {
    setPais(newPais);
    if (!territorio) {
      const auto = defaultTerritorio(newPais);
      if (auto) setTerritorio(auto);
    }
  }

  function handleSave() {
    const t = territorio || defaultTerritorio(pais);
    if (!pais || !t) return;
    startTransition(async () => {
      await saveTerritory(eventId, pais, t);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
        País y territorio
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          list={`countries-${eventId}`}
          value={pais}
          onChange={(e) => handlePaisChange(e.target.value)}
          placeholder="País"
          style={{
            flex: "1 1 160px",
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid var(--border-tertiary)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            color: "var(--fg-primary)",
          }}
        />
        <datalist id={`countries-${eventId}`}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <select
          value={territorio}
          onChange={(e) => setTerritorio(e.target.value as Territorio | "")}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid var(--border-tertiary)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            color: "var(--fg-primary)",
          }}
        >
          <option value="">Sin territorio</option>
          {TERRITORIOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={isPending || !pais || !territorio}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "none",
            background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
            color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
            cursor: isPending ? "wait" : "pointer",
            opacity: !pais || !territorio ? 0.5 : 1,
          }}
        >
          {isPending ? "..." : saved ? "Guardado" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
