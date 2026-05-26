"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EventSummary } from "@/lib/supabase";
import { formatDate, formatCurrency } from "@/lib/format";
import { Modal } from "./Modal";
import { TerritoryEditor } from "./TerritoryEditor";
import { MetricInfo } from "./MetricInfo";
import { saveAdSpend, saveEventCost } from "@/app/event/[id]/actions";

export type ModalMode = "principal" | "pauta";

function CostStat({ label, value, metricKey }: { label: string; value: string; metricKey?: string }) {
  return (
    <div className="card" style={{ padding: 12, textAlign: "center" }}>
      <div
        className="text-muted"
        style={{
          fontSize: 10,
          marginBottom: 2,
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          justifyContent: "center",
        }}
      >
        {label}
        {metricKey && <MetricInfo metricKey={metricKey} size={11} />}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function EventModal({
  event,
  mode,
  partner,
  isOpen,
  onClose,
  onUpdate,
}: {
  event: EventSummary | null;
  mode: ModalMode;
  partner?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (e: EventSummary) => void;
}) {
  const isPauta = mode === "pauta";
  const initialCost = event ? (isPauta ? Number(event.ad_spend) : Number(event.event_cost)) : 0;
  const [costInput, setCostInput] = useState(String(initialCost > 0 ? initialCost : ""));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!event) return null;

  const ev = event;
  const cost = isPauta ? Number(ev.ad_spend) : Number(ev.event_cost);
  // 2026-05-27 (Jose): Registros principal = aceptados. Pauta queda como total inscritos.
  const registros = isPauta ? ev.registros_performance : ev.total_aprobados_icp;
  const descalificados = isPauta ? 0 : Math.max(ev.total_registros - ev.total_aprobados_icp, 0);
  const asistentes = isPauta
    ? ev.asistentes_performance
    : ev.total_asistentes || ev.total_joined_virtual || 0;

  const qmAgend = isPauta ? ev.qm_agendada_pauta : ev.qm_agendada;
  const qmAsist = isPauta ? ev.qm_asistida_pauta : ev.qm_asistida;
  const demo = isPauta ? ev.demo_pauta : ev.demo;
  const won = isPauta ? ev.won_pauta : ev.won;
  const mrrWon = isPauta ? Number(ev.mrr_won_pauta) : Number(ev.mrr_won);

  const costPerReg = registros > 0 && cost > 0 ? cost / registros : 0;
  const costPerQmAg = qmAgend > 0 && cost > 0 ? cost / qmAgend : 0;
  const costPerQmAs = qmAsist > 0 && cost > 0 ? cost / qmAsist : 0;
  const costPerDemo = demo > 0 && cost > 0 ? cost / demo : 0;
  const costPerWon = won > 0 && cost > 0 ? cost / won : 0;
  const roi = cost > 0 && mrrWon > 0 ? (mrrWon / cost) * 100 : 0;

  const tasa = registros > 0 ? Math.round((asistentes / registros) * 100) : 0;

  function handleSave() {
    const num = parseFloat(costInput);
    if (isNaN(num) || num < 0) return;
    startTransition(async () => {
      if (isPauta) {
        await saveAdSpend(ev.luma_event_id, num);
        onUpdate?.({ ...ev, ad_spend: num });
      } else {
        await saveEventCost(ev.luma_event_id, num);
        onUpdate?.({ ...ev, event_cost: num });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={ev.evento_nombre}>
      {/* Header info */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          fontSize: 12,
          padding: "12px 16px",
          background: "var(--bg-secondary)",
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <span className="text-muted">Tipo: </span>
          <span style={{ fontWeight: 600 }}>{ev.evento_tipo}</span>
        </div>
        <div>
          <span className="text-muted">Fecha: </span>
          <span style={{ fontWeight: 600 }}>{formatDate(ev.evento_fecha)}</span>
        </div>
        {ev.territorio && (
          <div>
            <span className="text-muted">Territorio: </span>
            <span style={{ fontWeight: 600 }}>{ev.territorio}</span>
          </div>
        )}
        {ev.pais && (
          <div>
            <span className="text-muted">País: </span>
            <span style={{ fontWeight: 600 }}>{ev.pais}</span>
          </div>
        )}
        {partner && (
          <div>
            <span className="text-muted">Partner: </span>
            <span style={{ fontWeight: 600, color: "var(--fg-status-brand)" }}>{partner}</span>
          </div>
        )}
      </div>

      {/* Cost input */}
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-tertiary)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
          {isPauta ? "Inversión en pauta (USD)" : "Costo total del evento (USD)"}
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 16,
              fontWeight: 600,
              border: "1px solid var(--border-tertiary)",
              borderRadius: 8,
              background: "var(--bg-primary)",
              color: "var(--fg-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={handleSave}
            disabled={isPending || !costInput}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
              color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
              cursor: isPending ? "wait" : "pointer",
              opacity: !costInput ? 0.5 : 1,
            }}
          >
            {isPending ? "..." : saved ? "Guardado" : "Guardar"}
          </button>
        </div>
        {roi > 0 && isPauta && (
          <div style={{ marginTop: 10, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span className="text-muted">ROI (MRR / Inversión):</span>
            <span className="text-success" style={{ fontWeight: 700 }}>
              {Math.round(roi)}%
            </span>
            <MetricInfo metricKey="roi" size={12} />
          </div>
        )}
      </div>

      {/* Funnel metrics */}
      <div className="section-title">Funnel</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 20 }}>
        <CostStat
          label="Registros"
          value={String(registros)}
          metricKey={isPauta ? "registros_performance" : "registros"}
        />
        <CostStat
          label={`Asistentes (${tasa}%)`}
          value={String(asistentes)}
          metricKey={isPauta ? "asistentes_performance" : "asistentes"}
        />
        <CostStat
          label="QM Agend."
          value={String(qmAgend)}
          metricKey={isPauta ? "qm_agendada_pauta" : "qm_agendada"}
        />
        <CostStat
          label="QM Asist."
          value={String(qmAsist)}
          metricKey={isPauta ? "qm_asistida_pauta" : "qm_asistida"}
        />
        <CostStat
          label="Demo"
          value={String(demo)}
          metricKey={isPauta ? "demo_pauta" : "demo"}
        />
        <CostStat
          label="Won"
          value={String(won)}
          metricKey={isPauta ? "won_pauta" : "won"}
        />
      </div>

      {/* Cost analysis (solo si hay cost) */}
      {cost > 0 && (
        <>
          <div className="section-title">Análisis de costos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
            <CostStat
              label="/ Registro"
              value={costPerReg > 0 ? formatCurrency(costPerReg, { maximumFractionDigits: 2 }) : "—"}
              metricKey="costo_por_registro"
            />
            <CostStat
              label="/ QM Agend."
              value={costPerQmAg > 0 ? formatCurrency(costPerQmAg, { maximumFractionDigits: 2 }) : "—"}
              metricKey="costo_por_qm_agend"
            />
            <CostStat
              label="/ QM Asist."
              value={costPerQmAs > 0 ? formatCurrency(costPerQmAs, { maximumFractionDigits: 2 }) : "—"}
              metricKey="costo_por_qm_asist"
            />
            <CostStat
              label="/ Demo"
              value={costPerDemo > 0 ? formatCurrency(costPerDemo, { maximumFractionDigits: 2 }) : "—"}
              metricKey="costo_por_demo"
            />
            <CostStat
              label="/ Won"
              value={costPerWon > 0 ? formatCurrency(costPerWon, { maximumFractionDigits: 2 }) : "—"}
              metricKey="costo_por_won"
            />
          </div>
        </>
      )}

      {/* MRR + Territorio editor */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div
            className="text-muted"
            style={{
              fontSize: 11,
              marginBottom: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              justifyContent: "center",
            }}
          >
            MRR Won{isPauta ? " (pauta)" : ""}
            <MetricInfo metricKey={isPauta ? "mrr_won_pauta" : "mrr_won"} size={12} />
          </div>
          <div className="text-success" style={{ fontSize: 24, fontWeight: 700 }}>
            {formatCurrency(mrrWon)}
          </div>
        </div>
        <TerritoryEditor
          eventId={ev.luma_event_id}
          initialPais={ev.pais}
          initialTerritorio={ev.territorio}
        />
      </div>

      {/* Pauta caveat */}
      {isPauta && (
        <div
          className="text-muted"
          style={{ fontSize: 10, textAlign: "center", marginBottom: 16 }}
        >
          Métricas de pauta filtradas por <code>utm_id</code> en deal. Eventos pre-2026-04-26 pueden estar incompletos (sin backfill de deals históricos).
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-tertiary)", paddingTop: 16 }}>
        <Link
          href={`/event/${ev.luma_event_id}`}
          className="link-back"
          style={{ fontSize: 13 }}
        >
          Ver detalle completo →
        </Link>
      </div>
    </Modal>
  );
}
