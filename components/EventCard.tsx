"use client";

import { EventSummary } from "@/lib/supabase";
import { formatDate, formatCurrency } from "@/lib/format";
import { MetricInfo } from "./MetricInfo";

export type CardMode = "principal" | "pauta";

const STAT_LABEL_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  justifyContent: "flex-end",
};

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

  // 2026-05-27 (Jose feedback): "Registros" en modo principal = aceptados (no totales).
  // Pauta mantiene total_inscritos_pauta (Jose lo pidió explícito).
  const registros = isPauta ? event.registros_performance : event.total_aprobados_icp;
  const asistentes = isPauta ? event.asistentes_performance : (event.total_asistentes || event.total_joined_virtual || 0);
  const cost = isPauta ? Number(event.ad_spend) : Number(event.event_cost);
  const costLabel = isPauta ? "Inversión" : "Costo";
  // 2026-07-06 (Jose): tasa principal sobre aceptados (registros = total_aprobados_icp),
  // no sobre registros totales. Mismo criterio que EventModal / detalle del evento.
  // Third Party no tiene data de asistencia (no hay inscriptos Luma): no mostramos tasa.
  const sinAsistencia = !isPauta && event.evento_tipo === "Third Party";
  const tasa = isPauta
    ? event.pct_asistencia_performance
    : sinAsistencia
    ? null
    : registros > 0
    ? Math.round((asistentes / registros) * 100)
    : 0;
  // 2026-07-08 (Jose): principal muestra QM FM (empresas, tag Attio) para coincidir con el
  // detalle del evento. Pauta mantiene su funnel de deal (qm_agendada_pauta).
  const qm = isPauta ? event.qm_agendada_pauta : event.qm_por_fm;
  const qmLabel = isPauta ? "QM Agend." : "QM FM";
  const won = isPauta ? event.won_pauta : event.won;
  const mrrWon = isPauta ? Number(event.mrr_won_pauta) : Number(event.mrr_won);

  const keyRegistros = isPauta ? "registros_performance" : "total_aprobados_icp";
  const keyAsistentes = isPauta ? "asistentes_performance" : "asistentes";
  const keyQm = isPauta ? "qm_agendada_pauta" : "qm_por_fm";
  const keyWon = isPauta ? "won_pauta" : "won";
  const keyMrr = isPauta ? "mrr_won_pauta" : "mrr_won";
  const keyCost = isPauta ? "ad_spend" : "event_cost";

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
            <span
              className={`badge ${event.evento_tipo === "Presencial" ? "badge-presencial" : event.evento_tipo === "Virtual" ? "badge-virtual" : ""}`}
              style={event.evento_tipo === "Third Party" ? { background: "var(--bg-secondary)", color: "var(--fg-secondary)" } : undefined}
            >
              {event.evento_tipo}
            </span>
            {event.hidden && (
              <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-quaternary)" }}>
                Archivado
              </span>
            )}
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
            <div className="stat-label" style={STAT_LABEL_STYLE}>
              Registros
              <MetricInfo metricKey={keyRegistros} size={11} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{asistentes || "—"}</div>
            <div className="stat-label" style={STAT_LABEL_STYLE}>
              Asistentes
              <MetricInfo metricKey={keyAsistentes} size={11} />
            </div>
          </div>
          <div>
            <div className="text-warning" style={{ fontSize: 18, fontWeight: 700 }}>{qm}</div>
            <div className="stat-label" style={STAT_LABEL_STYLE}>
              {qmLabel}
              <MetricInfo metricKey={keyQm} size={11} />
            </div>
          </div>
          <div>
            <div className="text-info" style={{ fontSize: 18, fontWeight: 700 }}>{won}</div>
            <div className="stat-label" style={STAT_LABEL_STYLE}>
              Won
              <MetricInfo metricKey={keyWon} size={11} />
            </div>
          </div>
          <div>
            <div className="text-success" style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(mrrWon)}</div>
            <div className="stat-label" style={STAT_LABEL_STYLE}>
              MRR
              <MetricInfo metricKey={keyMrr} size={11} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(cost)}</div>
            <div className="stat-label" style={STAT_LABEL_STYLE}>
              {costLabel}
              <MetricInfo metricKey={keyCost} size={11} />
            </div>
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
            Tasa asistencia: {tasa == null ? "s/d" : `${tasa}%`}
          </span>
          <span className="text-muted" style={{ fontSize: 10 }}>
            {event.pct_matched}% match
          </span>
        </div>
      </div>
    </button>
  );
}
