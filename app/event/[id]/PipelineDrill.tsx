"use client";

import { useState, useTransition } from "react";
import { CompanyDrill, DealDrill, EventSummary } from "@/lib/supabase";
import { MetricInfo } from "@/components/MetricInfo";
import { attioCompanyUrl, attioDealUrl } from "@/lib/attio";
import { excludeCompany } from "./actions";

const METRIC_KEY_FOR: Record<string, string> = {
  empresas_asistentes: "empresas_asistentes",
  gestion_pendiente: "gestion_pendiente",
  gestion_viva: "gestion_viva",
  qm_fm: "qm_por_fm",
  qm_influenciada: "qm_influenciada",
  qm_generada: "qm_generada",
  descalificadas: "descalificadas",
  qm_asistida: "qm_asistida",
  demo: "demo",
  revision_interna: "revision_interna",
  negociacion: "negociacion",
  won: "won",
  lost: "lost",
  qm_show: "qm_show",
  qm_no_show: "qm_no_show",
};

type Metric =
  | "empresas_asistentes"
  | "gestion_pendiente"
  | "gestion_viva"
  | "qm_fm"
  | "qm_influenciada"
  | "qm_generada"
  | "descalificadas"
  | "qm_asistida"
  | "demo"
  | "revision_interna"
  | "negociacion"
  | "won"
  | "lost"
  | "qm_show"
  | "qm_no_show";

const METRIC_LABELS: Record<Metric, string> = {
  empresas_asistentes: "Asistentes",
  gestion_pendiente: "Pendiente",
  gestion_viva: "En gestión",
  qm_fm: "QM FM",
  qm_influenciada: "QM Influenciada",
  qm_generada: "QM Directa",
  descalificadas: "Descalificadas",
  qm_asistida: "QM Asistida",
  demo: "Demo",
  revision_interna: "Revisión interna",
  negociacion: "Negociación",
  won: "Won",
  lost: "Lost",
  qm_show: "QM Show",
  qm_no_show: "QM No Show",
};

// 2026-07-17 (José): qm_asistida dejó de ser métrica de deals — ahora son EMPRESAS
// con tag campaña + outbound_stage QM SHOW (ver QM_COMPANY_METRICS).
const DEAL_METRICS = new Set<Metric>([
  "demo",
  "revision_interna",
  "negociacion",
  "won",
  "lost",
]);

function filterCompanies(companies: CompanyDrill[], m: Metric): CompanyDrill[] {
  switch (m) {
    case "empresas_asistentes":
      return companies.filter((c) => c.asistio);
    case "gestion_pendiente":
      return companies.filter((c) => c.proceso_fm_status === "Sin inicar");
    case "gestion_viva":
      return companies.filter((c) =>
        ["Inicio de gestion", "Con Contacto", "Procesada evento (7 dias)"].includes(
          c.proceso_fm_status ?? ""
        )
      );
    case "descalificadas":
      return companies.filter((c) => c.proceso_fm_status === "Descalificada no ICP");
    default:
      // Las metricas de QM NO se filtran aca: se anclan en el tag de Attio (filterQmCompanies).
      return [];
  }
}

// Jose 2026-07-08: QM ancladas al tag Campaña/Evento del objeto Company en Attio
// (vista fm_event_qm_companies_drill, ya filtrada a QM AGENDADA/SHOW/NO SHOW), NO a los
// registrantes de Luma. Coincide con lo que Jose filtra en Attio.
function filterQmCompanies(companies: CompanyDrill[], m: Metric): CompanyDrill[] {
  switch (m) {
    case "qm_fm":
      return companies; // la vista ya trae solo QM AGENDADA/SHOW/NO SHOW
    case "qm_show":
    case "qm_asistida": // José 2026-07-17: QM Asistida = empresas con tag + QM SHOW
      return companies.filter((c) => c.outbound_stage === "QM SHOW");
    case "qm_no_show":
      return companies.filter((c) => c.outbound_stage === "QM NO SHOW");
    case "qm_generada":
      return companies.filter((c) => c.qm_clasificacion === "directa");
    case "qm_influenciada":
      return companies.filter((c) => c.qm_clasificacion === "influenciada");
    default:
      return [];
  }
}

const QM_COMPANY_METRICS = new Set<Metric>([
  "qm_fm",
  "qm_show",
  "qm_no_show",
  "qm_generada",
  "qm_influenciada",
  "qm_asistida",
]);

function filterDeals(deals: DealDrill[], m: Metric): DealDrill[] {
  // 2026-05-06: switch a flags de traza (toco_*) — un deal que pasó por QM
  // pero ya está en Demo/Won/Lost también cuenta como QM Asistida.
  // 2026-07-17 (José): Demo/Revisión/Negociación cuentan solo deals atribuidos por el
  // tag Campaña/Evento (por_tag), sin la heurística asistió+fecha+origen. Won/Lost siguen
  // con la unión de ambas atribuciones.
  switch (m) {
    case "demo":
      return deals.filter((d) => d.toco_demo && d.por_tag);
    case "revision_interna":
      return deals.filter((d) => d.toco_revision && d.por_tag);
    case "negociacion":
      return deals.filter((d) => d.toco_negociacion && d.por_tag);
    case "won":
      return deals.filter((d) => d.toco_won);
    case "lost":
      return deals.filter((d) => d.toco_lost);
    default:
      return [];
  }
}

function PipelineStep({
  value,
  label,
  metric,
  onClick,
  highlight,
  size,
}: {
  value: string | number;
  label: string;
  metric: Metric;
  onClick: (m: Metric) => void;
  highlight?: "warning" | "success";
  size?: number;
}) {
  const bgStyle =
    highlight === "warning"
      ? { background: "var(--bg-status-warning)", color: "var(--fg-status-warning)" }
      : highlight === "success"
      ? { background: "var(--bg-status-success)", color: "var(--fg-status-success)" }
      : undefined;
  const isZero = Number(value) === 0;
  return (
    <div className="pipeline-step">
      <button
        onClick={() => !isZero && onClick(metric)}
        style={{
          all: "unset",
          cursor: isZero ? "default" : "pointer",
          opacity: isZero ? 0.5 : 1,
        }}
        title={isZero ? "" : `Ver ${label}`}
      >
        <div className="pipeline-value" style={{ ...bgStyle, ...(size ? { fontSize: size } : {}) }}>
          {value}
        </div>
      </button>
      <div
        className="pipeline-label"
        style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: "center" }}
      >
        {label}
        <MetricInfo metricKey={METRIC_KEY_FOR[metric]} size={11} />
      </div>
    </div>
  );
}

export function PipelineDrill({
  event,
  companies,
  qmCompanies,
  deals,
}: {
  event: EventSummary;
  companies: CompanyDrill[];
  qmCompanies: CompanyDrill[];
  deals: DealDrill[];
}) {
  const [open, setOpen] = useState<Metric | null>(null);

  const isDealMetric = open ? DEAL_METRICS.has(open) : false;
  const isQmMetric = open ? QM_COMPANY_METRICS.has(open) : false;
  const listCompanies =
    open && !isDealMetric
      ? isQmMetric
        ? filterQmCompanies(qmCompanies, open)
        : filterCompanies(companies, open)
      : [];
  const listDeals = open && isDealMetric ? filterDeals(deals, open) : [];

  return (
    <>
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", flexWrap: "wrap", gap: 8 }}>
          <PipelineStep value={event.empresas_asistentes} label="Asistentes" metric="empresas_asistentes" onClick={setOpen} />
          <PipelineStep value={event.gestion_pendiente} label="Pendiente" metric="gestion_pendiente" onClick={setOpen} />
          <PipelineStep value={event.gestion_viva} label="En gestión" metric="gestion_viva" onClick={setOpen} />
          <PipelineStep value={event.qm_por_fm} label="QM FM" metric="qm_fm" onClick={setOpen} highlight="warning" />
          <PipelineStep value={event.qm_asistida} label="QM Asist." metric="qm_asistida" onClick={setOpen} />
          <PipelineStep value={event.demo} label="Demo" metric="demo" onClick={setOpen} />
          <PipelineStep value={event.revision_interna} label="Revisión" metric="revision_interna" onClick={setOpen} />
          <PipelineStep value={event.negociacion} label="Negoc." metric="negociacion" onClick={setOpen} />
          <PipelineStep value={event.won} label="Won" metric="won" onClick={setOpen} highlight="success" />
          <div className="pipeline-step">
            <div
              className="pipeline-value"
              style={{ background: "var(--bg-status-success)", color: "var(--fg-status-success)", fontSize: 13 }}
            >
              ${Number(event.mrr_won).toLocaleString()}
            </div>
            <div
              className="pipeline-label"
              style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: "center" }}
            >
              MRR
              <MetricInfo metricKey="mrr_won" size={11} />
            </div>
          </div>
        </div>
        {(event.qm_influenciada > 0 || event.qm_generada > 0 || event.descalificadas > 0 || event.lost > 0 || event.qm_show > 0 || event.qm_no_show > 0) && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border-tertiary)",
              flexWrap: "wrap",
            }}
          >
            <InlineMetric label="QM Show" value={event.qm_show} metric="qm_show" onClick={setOpen} />
            <InlineMetric label="QM No Show" value={event.qm_no_show} metric="qm_no_show" onClick={setOpen} />
            <InlineMetric label="QM Influenciada" value={event.qm_influenciada} metric="qm_influenciada" onClick={setOpen} />
            <InlineMetric label="QM Directa" value={event.qm_generada} metric="qm_generada" onClick={setOpen} />
            <InlineMetric label="Descalificadas" value={event.descalificadas} metric="descalificadas" onClick={setOpen} />
            <InlineMetric label="Lost" value={event.lost} metric="lost" onClick={setOpen} />
          </div>
        )}
      </div>

      {open && (
        <DrillModal
          metric={open}
          onClose={() => setOpen(null)}
          companies={listCompanies}
          deals={listDeals}
          isDealMetric={isDealMetric}
          eventId={event.luma_event_id}
        />
      )}
    </>
  );
}

function InlineMetric({
  label,
  value,
  metric,
  onClick,
}: {
  label: string;
  value: number;
  metric: Metric;
  onClick: (m: Metric) => void;
}) {
  const isZero = value === 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12 }}>
      <button
        onClick={() => !isZero && onClick(metric)}
        disabled={isZero}
        style={{
          all: "unset",
          cursor: isZero ? "default" : "pointer",
          opacity: isZero ? 0.5 : 1,
        }}
      >
        <span className="text-muted">{label}: </span>
        <span style={{ fontWeight: 600, textDecoration: isZero ? "none" : "underline dotted" }}>{value}</span>
      </button>
      <MetricInfo metricKey={METRIC_KEY_FOR[metric]} size={11} />
    </span>
  );
}

function DrillModal({
  metric,
  onClose,
  companies,
  deals,
  isDealMetric,
  eventId,
}: {
  metric: Metric;
  onClose: () => void;
  companies: CompanyDrill[];
  deals: DealDrill[];
  isDealMetric: boolean;
  eventId: string;
}) {
  const count = isDealMetric ? deals.length : companies.length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{METRIC_LABELS[metric]}</div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
              {count} {isDealMetric ? "deals" : "empresas"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 13,
              color: "var(--fg-quaternary)",
            }}
          >
            ✕ Cerrar
          </button>
        </div>

        <div style={{ overflow: "auto", padding: "8px 20px 20px" }}>
          {count === 0 ? (
            <div className="text-muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
              Sin registros.
            </div>
          ) : isDealMetric ? (
            <DealList deals={deals} />
          ) : (
            <CompanyList companies={companies} eventId={eventId} />
          )}
        </div>
      </div>
    </div>
  );
}

function CompanyList({ companies, eventId }: { companies: CompanyDrill[]; eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const [excluding, setExcluding] = useState<string | null>(null);
  const sorted = [...companies].sort((a, b) =>
    (a.company_name ?? "").localeCompare(b.company_name ?? "")
  );

  function handleExclude(companyId: string | null) {
    if (!companyId) return;
    setExcluding(companyId);
    startTransition(async () => {
      await excludeCompany(eventId, companyId);
      setExcluding(null);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((c, i) => {
        const url = attioCompanyUrl(c.attio_company_id);
        return (
          <div
            key={`${c.attio_company_id}-${i}`}
            style={{
              padding: "10px 0",
              borderBottom: "1px solid var(--border-tertiary)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.company_name ?? "— sin nombre —"}
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {[c.industria, c.pais, c.proceso_fm_status, c.outbound_stage].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <button
              onClick={() => handleExclude(c.attio_company_id)}
              disabled={isPending && excluding === c.attio_company_id}
              title="Excluir esta empresa de este evento (no afecta Attio)"
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--fg-status-error)",
                whiteSpace: "nowrap",
                opacity: isPending && excluding === c.attio_company_id ? 0.5 : 1,
              }}
            >
              {isPending && excluding === c.attio_company_id ? "Excluyendo…" : "✕ Excluir"}
            </button>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--fg-status-info)", whiteSpace: "nowrap" }}
              >
                Attio ↗
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DealList({ deals }: { deals: DealDrill[] }) {
  const sorted = [...deals].sort((a, b) => (b.value_amount ?? 0) - (a.value_amount ?? 0));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((d, i) => (
        <div
          key={`${d.attio_deal_id}-${i}`}
          style={{
            padding: "10px 0",
            borderBottom: "1px solid var(--border-tertiary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.company_name ?? "— sin nombre —"}
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              {d.deal_name ?? "—"} · {d.stage}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {d.value_amount != null && d.value_amount > 0 && (
              <div style={{ fontSize: 13, fontWeight: 600 }}>${Number(d.value_amount).toLocaleString()}</div>
            )}
            <a
              href={attioDealUrl(d.attio_deal_id)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "var(--fg-status-info)", whiteSpace: "nowrap" }}
            >
              Attio ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
