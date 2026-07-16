"use client";

import { useState, useTransition } from "react";
import { excludePartner } from "./actions";

// 2026-05-27 (Jose A): permite excluir un partner mal-atribuido de un evento.
// Caso: el dashboard muestra "partner Zebra" porque una empresa tiene a Zebra como
// Partner Asociado en Attio, pero ese partner no corresponde a este evento.
export function PartnerEditor({
  eventId,
  partners,
}: {
  eventId: string;
  partners: { partner: string; registros: number }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [excluding, setExcluding] = useState<string | null>(null);

  function handleExclude(partner: string) {
    setExcluding(partner);
    startTransition(async () => {
      await excludePartner(eventId, partner);
      setExcluding(null);
    });
  }

  return (
    <div className="card">
      <div className="stat-label" style={{ marginBottom: 8 }}>Partners atribuidos</div>
      {partners.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 12 }}>Sin partner atribuido.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {partners.map((p) => (
            <div
              key={p.partner}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {p.partner}
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                  ({p.registros})
                </span>
              </span>
              <button
                onClick={() => handleExclude(p.partner)}
                disabled={isPending && excluding === p.partner}
                title="Este partner no corresponde a este evento (no afecta Attio)"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--fg-status-error)",
                  opacity: isPending && excluding === p.partner ? 0.5 : 1,
                }}
              >
                {isPending && excluding === p.partner ? "Quitando…" : "✕ No es partner"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
