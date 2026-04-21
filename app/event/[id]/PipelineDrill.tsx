"use client";

import { useState } from "react";
import { CompanyDrill, DealDrill, EventSummary } from "@/lib/supabase";

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
  | "won";

const METRIC_LABELS: Record<Metric, string> = {
  empresas_asistentes: "Asistentes",
  gestion_pendiente: "Pendiente",
  gestion_viva: "En gestión",
  qm_fm: "QM FM",
  qm_influenciada: "QM Influenciada",
  qm_generada: "QM Generada",
  descalificadas: "Descalificadas",
  qm_asistida: "QM Asistida",
  demo: "Demo",
  won: "Won",
};

const DEAL_METRICS = new Set<Metric>(["qm_asistida", "demo", "won"]);

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
    case "qm_fm":
      return companies.filter(
        (c) =>
          c.proceso_fm_status === "QM" ||
          ["QM AGENDADA", "PRE-QM - Oportunidad Marketing", "QM SHOW"].includes(
            c.outbound_stage ?? ""
          )
      );
    case "qm_influenciada":
      return companies.filter((c) => c.qm_type === "influenciada");
    case "qm_generada":
      return companies.filter((c) => c.qm_type === "generada");
    case "descalificadas":
      return companies.filter((c) => c.proceso_fm_status === "Descalificada no ICP");
    default:
      return [];
  }
}

function filterDeals(deals: DealDrill[], m: Metric): DealDrill[] {
  switch (m) {
    case "qm_asistida":
      return deals.filter((d) => d.stage === "Llamada de Calificacion de la oportunidad (QM)");
    case "demo":
      return deals.filter((d) => d.stage.startsWith("Demostracion"));
    case "won":
      return deals.filter((d) => d.stage === "Won");
    default:
      return [];
  }
}

function attioCompanyUrl(id: string | null) {
  return id ? `https://app.attio.com/atom/company/${id}` : null;
}

function attioDealUrl(id: string) {
  return `https://app.attio.com/atom/deals/record/${id}`;
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
      <div className="pipeline-label">{label}</div>
    </div>
  );
}

export function PipelineDrill({
  event,
  companies,
  deals,
}: {
  event: EventSummary;
  companies: CompanyDrill[];
  deals: DealDrill[];
}) {
  const [open, setOpen] = useState<Metric | null>(null);

  const isDealMetric = open ? DEAL_METRICS.has(open) : false;
  const listCompanies = open && !isDealMetric ? filterCompanies(companies, open) : [];
  const listDeals = open && isDealMetric ? filterDeals(deals, open) : [];

  return (
    <>
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
          <PipelineStep value={event.empresas_asistentes} label="Asistentes" metric="empresas_asistentes" onClick={setOpen} />
          <PipelineStep value={event.gestion_pendiente} label="Pendiente" metric="gestion_pendiente" onClick={setOpen} />
          <PipelineStep value={event.gestion_viva} label="En gestión" metric="gestion_viva" onClick={setOpen} />
          <PipelineStep value={event.qm_por_fm} label="QM FM" metric="qm_fm" onClick={setOpen} highlight="warning" />
          <PipelineStep value={event.qm_asistida} label="QM Asistida" metric="qm_asistida" onClick={setOpen} />
          <PipelineStep value={event.demo} label="Demo" metric="demo" onClick={setOpen} />
          <PipelineStep value={event.won} label="Won" metric="won" onClick={setOpen} highlight="success" />
          <div className="pipeline-step">
            <div
              className="pipeline-value"
              style={{ background: "var(--bg-status-success)", color: "var(--fg-status-success)", fontSize: 13 }}
            >
              ${Number(event.mrr_won).toLocaleString()}
            </div>
            <div className="pipeline-label">MRR</div>
          </div>
        </div>
        {(event.qm_influenciada > 0 || event.qm_generada > 0 || event.descalificadas > 0) && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border-tertiary)",
            }}
          >
            <InlineMetric label="QM Influenciada" value={event.qm_influenciada} metric="qm_influenciada" onClick={setOpen} />
            <InlineMetric label="QM Generada" value={event.qm_generada} metric="qm_generada" onClick={setOpen} />
            <InlineMetric label="Descalificadas" value={event.descalificadas} metric="descalificadas" onClick={setOpen} />
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
    <button
      onClick={() => !isZero && onClick(metric)}
      disabled={isZero}
      style={{
        all: "unset",
        fontSize: 12,
        cursor: isZero ? "default" : "pointer",
        opacity: isZero ? 0.5 : 1,
      }}
    >
      <span className="text-muted">{label}: </span>
      <span style={{ fontWeight: 600, textDecoration: isZero ? "none" : "underline dotted" }}>{value}</span>
    </button>
  );
}

function DrillModal({
  metric,
  onClose,
  companies,
  deals,
  isDealMetric,
}: {
  metric: Metric;
  onClose: () => void;
  companies: CompanyDrill[];
  deals: DealDrill[];
  isDealMetric: boolean;
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
            <CompanyList companies={companies} />
          )}
        </div>
      </div>
    </div>
  );
}

function CompanyList({ companies }: { companies: CompanyDrill[] }) {
  const sorted = [...companies].sort((a, b) =>
    (a.company_name ?? "").localeCompare(b.company_name ?? "")
  );
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
