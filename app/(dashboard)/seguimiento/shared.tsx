"use client";

import { SeguimientoCompany } from "@/lib/supabase";
import { attioCompanyUrl } from "@/lib/attio";

// Piezas compartidas entre la vista general de Seguimiento y el detalle por BDR.
export type EtapaKey = SeguimientoCompany["etapa_funnel"];

export const SIN_BDR = "— Sin BDR asignado —";

// Wording José 2026-07-17: Sin procesar / Procesando / Procesada (antes: Sin prospectar /
// Siendo prospectadas / Procesadas). Las keys SQL no cambian.
export const ETAPAS: { key: EtapaKey; label: string; labelCorto: string; detalle: string; color: string }[] = [
  { key: "sin_prospectar", label: "Sin procesar", labelCorto: "Sin procesar", detalle: "PRE-QM + sin actividad (vacío, Ready, Not Started)", color: "var(--fg-status-error)" },
  { key: "siendo_prospectada", label: "Procesando", labelCorto: "Procesando", detalle: "Con contacto, Procesando, o con actividades iniciadas", color: "var(--fg-status-info)" },
  { key: "procesada", label: "Procesada", labelCorto: "Procesada", detalle: "Lost + procesada por actividad (3 llamadas + 2 WhatsApp o 3 WhatsApp + 2 llamadas por contacto)", color: "var(--fg-secondary)" },
  { key: "respuesta_positiva", label: "Respuesta positiva", labelCorto: "Resp. positiva", detalle: "QM Agendada, QM Show, QM No Show", color: "var(--fg-status-success)" },
  { key: "dropoff", label: "DropOff", labelCorto: "DropOff", detalle: "Descalificadas (no ICP) + Recycle", color: "var(--fg-status-warning)" },
];

export const etapaRank = (e: EtapaKey) => ETAPAS.findIndex((x) => x.key === e);

// Fila de empresa: etapa (opcional), BDR (opcional), outbound stage, actividades,
// fecha de asignación, Attio.
export function CompanyRow({ c, showEtapa, showBdr }: { c: SeguimientoCompany; showEtapa: boolean; showBdr?: boolean }) {
  const etapa = ETAPAS.find((e) => e.key === c.etapa_funnel);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border-tertiary)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.company_name ?? "— sin nombre —"}
        </div>
        <div className="text-muted" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {showBdr ? `${c.assigned_bdr_name ?? "Sin BDR asignado"} · ` : ""}{c.campana_evento}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {showEtapa && etapa && (
          <span className="badge" style={{ background: "var(--bg-secondary)", color: etapa.color, fontSize: 10, fontWeight: 700 }}>
            {etapa.labelCorto}
          </span>
        )}
        <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)", fontSize: 10 }}>
          {c.outbound_stage ?? "sin stage"}
        </span>
        <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }} title="Llamadas + WhatsApps registrados">
          {c.actividades_prospeccion} act.{c.estructura_completa ? " ✓" : ""}
        </span>
        <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
          {c.bdr_assigned_at
            ? `asig. ${new Date(c.bdr_assigned_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}`
            : "sin fecha"}
        </span>
        {c.attio_company_id && (
          <a
            href={attioCompanyUrl(c.attio_company_id) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--fg-status-info)", textDecoration: "none" }}
          >
            Attio ↗
          </a>
        )}
      </div>
    </div>
  );
}
