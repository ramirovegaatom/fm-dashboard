"use client";

import { EventSummary } from "@/lib/supabase";
import { formatDate, formatCurrency } from "@/lib/format";

export type CardMode = "principal" | "pauta";

export function EventCard({
  event,
  mode,
  partner,
  onClick,
}: {
  event: EventSummary;
  mode: CardMode;
  partner?: string;
  onClick: (e: EventSummary) => void;
}) {
  const isPauta = mode === "pauta";

  const registros = isPauta ? event.registros_performance : event.total_registros;
  const asistentes = isPauta ? event.asistentes_performance : (event.total_asistentes || event.total_joined_virtual || 0);
  const cost = isPauta ? Number(event.ad_spend) : Number(event.event_cost);
  const costLabel = isPauta ? "Inversión" : "Costo";
  const tasa = isPauta ? event.pct_asistencia_performance : event.tasa_conversion_pct;
  const qmAgend = isPauta ? event.qm_agendada_pauta : event.qm_agendada;
  const won = isPauta ? event.won_pauta : event.won;
  const mrrWon = isPauta ? Number(event.mrr_won_pauta) : Number(event.mrr_won);

  return (
    <button
      onClick={() => onClick(event)}
      className="card card-hover"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        textAlign: "left",
        cursor: "pointer",
        background: "var(--bg-primary)",
        width: "100%",
        border: "1px solid var(--border-tertiary)",
        padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span className={`badge ${event.evento_tipo === "Presencial" ? "badge-presencial" : "badge-virtual"}`}>
              {event.evento_tipo}
            </span>
            {event.territorio && (
              <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)" }}>
                {event.territorio}
              </span>
            )}
            {partner && (
              <span className="badge" style={{ background: "var(--bg-status-brand)", color: "var(--fg-status-brand)" }}>
                {partner}
              </span>
            )}
            <span className="text-muted" style={{ fontSize: 12 }}>
              {formatDate(event.evento_fecha)}
            </span>
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.evento_nombre}
          </h3>
          {event.evento_ubicacion && (
            <p className="text-muted" style={{ fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event.evento_ubicacion}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, flexShrink: 0, textAlign: "right" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{registros}</div>
            <div className="stat-label">Registros</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{asistentes || "—"}</div>
            <div className="stat-label">Asistentes</div>
          </div>
          <div>
            <div className="text-warning" style={{ fontSize: 18, fontWeight: 700 }}>{qmAgend}</div>
            <div className="stat-label">QM Agend.</div>
          </div>
          <div>
            <div className="text-info" style={{ fontSize: 18, fontWeight: 700 }}>{won}</div>
            <div className="stat-label">Won</div>
          </div>
          <div>
            <div className="text-success" style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(mrrWon)}</div>
            <div className="stat-label">MRR</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(cost)}</div>
            <div className="stat-label">{costLabel}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="bar">
          <div
            className="bar-fill"
            style={{
              width: `${tasa ?? 0}%`,
              background:
                Number(tasa) > 30
                  ? "var(--fg-status-success)"
                  : Number(tasa) > 15
                  ? "var(--fg-status-warning)"
                  : "var(--fg-status-error)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span className="text-muted" style={{ fontSize: 10 }}>
            Tasa asistencia: {tasa ?? 0}%
          </span>
          <span className="text-muted" style={{ fontSize: 10 }}>
            {event.pct_matched}% match
          </span>
        </div>
      </div>
    </button>
  );
}
