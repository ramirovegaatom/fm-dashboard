"use client";

import { useMemo, useState } from "react";
import { SeguimientoCompany } from "@/lib/supabase";
import { attioCompanyUrl } from "@/lib/attio";

// Spec del equipo (2026-07-11): funnel general por Outbound Stage + scorecard por BDR.
// Mapeo de etapas = spec literal; los stages no mapeados (Descalificada, PRE-QM, RECYCLE,
// Cliente) van a "Otros" hasta que José defina dónde caen. Filtro: campaña de evento.
type EtapaKey = SeguimientoCompany["etapa_funnel"];

const ETAPAS: { key: EtapaKey; label: string; detalle: string; color: string }[] = [
  { key: "sin_prospectar", label: "Sin prospectar", detalle: "sin actividad (vacío, Ready, Not Started)", color: "var(--fg-quaternary)" },
  { key: "siendo_prospectada", label: "Siendo prospectadas", detalle: "Con contacto, Procesando", color: "var(--fg-status-info)" },
  { key: "procesada", label: "Procesadas", detalle: "Lost + Procesada (ya salieron de prospección)", color: "var(--fg-secondary)" },
  { key: "respuesta_positiva", label: "Respuesta positiva", detalle: "QM Agendada, QM Show, QM No Show", color: "var(--fg-status-success)" },
  { key: "otros", label: "Otros (pendiente de definición)", detalle: "Descalificada, PRE-QM, RECYCLE, Cliente — José define dónde caen", color: "var(--fg-status-warning)" },
];

export function SeguimientoClient({ companies }: { companies: SeguimientoCompany[] }) {
  const [campana, setCampana] = useState<string>("todas");

  const campanas = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.campana_evento));
    return [...set].sort();
  }, [companies]);

  const filtered = useMemo(
    () => (campana === "todas" ? companies : companies.filter((c) => c.campana_evento === campana)),
    [companies, campana]
  );

  const funnel = useMemo(() => {
    const counts: Record<EtapaKey, number> = { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, otros: 0 };
    for (const c of filtered) counts[c.etapa_funnel]++;
    return counts;
  }, [filtered]);

  const asignadas = filtered.length;

  // Scorecard por BDR: total asignadas + sin actividad (con su fecha de asignación en drill).
  const bdrs = useMemo(() => {
    const map = new Map<string, { name: string; asignadas: number; sinActividad: SeguimientoCompany[] }>();
    for (const c of filtered) {
      const key = c.assigned_bdr_name ?? "— Sin BDR asignado —";
      const entry = map.get(key) ?? { name: key, asignadas: 0, sinActividad: [] };
      entry.asignadas++;
      if (c.etapa_funnel === "sin_prospectar") entry.sinActividad.push(c);
      map.set(key, entry);
    }
    for (const e of map.values()) {
      e.sinActividad.sort((a, b) => (a.bdr_assigned_at ?? "").localeCompare(b.bdr_assigned_at ?? ""));
    }
    // Sin BDR al final; el resto por asignadas desc.
    return [...map.values()].sort((a, b) => {
      const aNull = a.name.startsWith("—") ? 1 : 0;
      const bNull = b.name.startsWith("—") ? 1 : 0;
      return aNull - bNull || b.asignadas - a.asignadas;
    });
  }, [filtered]);

  return (
    <div>
      <div
        className="card"
        style={{ marginBottom: 20, background: "var(--bg-secondary)", fontSize: 12, color: "var(--fg-secondary)" }}
      >
        Avance de las <strong>empresas generadas por marketing</strong> (eventos y webinars) a través del
        embudo comercial, y desempeño de los <strong>BDRs</strong> en su procesamiento. Basado en el{" "}
        <strong>Outbound Stage</strong> de cada empresa tagueada con la campaña en Attio. El BDR y su fecha
        de asignación salen del campo <strong>Assigned BDR</strong> de Attio.
      </div>

      {/* Filtro por campaña (spec) */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <select
          value={campana}
          onChange={(e) => setCampana(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid var(--border-tertiary)",
            background: campana === "todas" ? "var(--bg-primary)" : "var(--fg-primary)",
            color: campana === "todas" ? "var(--fg-secondary)" : "var(--bg-primary)",
            maxWidth: 380,
          }}
        >
          <option value="todas">Todas las campañas ({campanas.length})</option>
          {campanas.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {asignadas} empresas asignadas{campana !== "todas" ? " en esta campaña" : " en total"}
        </span>
      </div>

      {/* Sección 1 — Funnel general */}
      <div className="section-title">Funnel general</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <FunnelRow label="Asignadas" detalle="empresas totales según la campaña" value={asignadas} total={asignadas} color="var(--fg-primary)" bold />
        {ETAPAS.map((e) => (
          <FunnelRow key={e.key} label={e.label} detalle={e.detalle} value={funnel[e.key]} total={asignadas} color={e.color} />
        ))}
        <div className="text-muted" style={{ fontSize: 10, marginTop: 10 }}>
          Lost cuenta como resultado negativo dentro de “Procesadas” (no como respuesta positiva). La fila
          “Otros” agrupa stages que el documento no mapea — pendiente de definición con José.
        </div>
      </div>

      {/* Sección 2 — Scorecard por BDR */}
      <div className="section-title">Scorecard por BDR ({bdrs.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bdrs.map((b) => (
          <BdrCard key={b.name} bdr={b} />
        ))}
        {bdrs.length === 0 && (
          <div className="card text-muted" style={{ textAlign: "center", padding: 40, fontSize: 13 }}>
            No hay empresas con los filtros seleccionados.
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelRow({ label, detalle, value, total, color, bold }: {
  label: string; detalle: string; value: number; total: number; color: string; bold?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--border-tertiary)" }}>
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: bold ? 700 : 600 }}>{label}</div>
        <div className="text-muted" style={{ fontSize: 10 }}>{detalle}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <div style={{ width: 110, textAlign: "right", flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, ...(bold ? {} : { color }) }}>{value}</span>
        <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{pct}%</span>
      </div>
    </div>
  );
}

function BdrCard({ bdr }: { bdr: { name: string; asignadas: number; sinActividad: SeguimientoCompany[] } }) {
  const [open, setOpen] = useState(false);
  const sinBdr = bdr.name.startsWith("—");
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: sinBdr ? "var(--fg-status-warning)" : undefined }}>
          {bdr.name}
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{bdr.asignadas}</div>
            <div className="stat-label">Asignadas</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: bdr.sinActividad.length > 0 ? "var(--fg-status-error)" : "var(--fg-status-success)" }}>
              {bdr.sinActividad.length}
            </div>
            <div className="stat-label">Sin actividad</div>
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            disabled={bdr.sinActividad.length === 0}
            style={{
              all: "unset",
              cursor: bdr.sinActividad.length === 0 ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: bdr.sinActividad.length === 0 ? "var(--fg-quaternary)" : "var(--fg-status-info)",
              minWidth: 90,
              textAlign: "right",
            }}
          >
            {bdr.sinActividad.length === 0 ? "Al día ✓" : open ? "Ocultar ▲" : "Ver empresas ▼"}
          </button>
        </div>
      </div>

      {open && bdr.sinActividad.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-tertiary)" }}>
          {bdr.sinActividad.map((c, i) => (
            <div
              key={`${c.attio_company_id}-${i}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border-tertiary)" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.company_name ?? "— sin nombre —"}
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>{c.campana_evento}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)", fontSize: 10 }}>
                  {c.outbound_stage ?? "sin stage"}
                </span>
                <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {c.bdr_assigned_at
                    ? `asignada el ${new Date(c.bdr_assigned_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}`
                    : "sin fecha de asignación"}
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
          ))}
        </div>
      )}
    </div>
  );
}
