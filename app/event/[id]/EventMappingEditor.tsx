"use client";

import { useState, useTransition } from "react";
import { addEventMapping, removeEventMapping } from "./actions";

// 2026-05-27 (Jose): asignar nomenclaturas de campana_evento (Attio) a un evento.
// Cada deal en Attio tagueado con uno de estos slugs se atribuye a este evento tras el sync.
export function EventMappingEditor({
  eventId,
  mappings,
}: {
  eventId: string;
  mappings: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function handleAdd() {
    const slug = input.trim();
    if (!slug) return;
    setBusy("add");
    startTransition(async () => {
      await addEventMapping(eventId, slug);
      setInput("");
      setBusy(null);
    });
  }

  function handleRemove(slug: string) {
    setBusy(slug);
    startTransition(async () => {
      await removeEventMapping(eventId, slug);
      setBusy(null);
    });
  }

  return (
    <div className="card">
      <div className="stat-label" style={{ marginBottom: 8 }}>
        Nomenclaturas Attio (campaña/evento)
      </div>

      {mappings.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {mappings.map((slug) => (
            <span
              key={slug}
              className="badge"
              style={{ background: "var(--bg-status-brand)", color: "var(--fg-status-brand)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {slug}
              <button
                onClick={() => handleRemove(slug)}
                disabled={isPending && busy === slug}
                title="Quitar nomenclatura"
                style={{ all: "unset", cursor: "pointer", fontWeight: 700, opacity: isPending && busy === slug ? 0.4 : 0.7 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Sin nomenclatura asignada. Los deals tagueados en Attio no se atribuirán hasta asignarla.
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Ej: Evento_Lima_13/05/26"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid var(--border-tertiary)",
            background: "var(--bg-primary)",
            color: "var(--fg-primary)",
          }}
        />
        <button
          onClick={handleAdd}
          disabled={(isPending && busy === "add") || !input.trim()}
          style={{
            all: "unset",
            cursor: input.trim() ? "pointer" : "default",
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            background: input.trim() ? "var(--fg-primary)" : "var(--bg-secondary)",
            color: input.trim() ? "var(--bg-primary)" : "var(--fg-quaternary)",
          }}
        >
          {isPending && busy === "add" ? "Guardando…" : "Asignar"}
        </button>
      </div>
      <div className="text-muted" style={{ fontSize: 10, marginTop: 6 }}>
        Debe coincidir exacto con la opción de campaña/evento en Attio. Tras asignarla, dale a Sincronizar.
      </div>
    </div>
  );
}
