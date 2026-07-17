"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SeguimientoCompany } from "@/lib/supabase";
import { SIN_BDR, ETAPAS, etapaRank, CompanyRow, type EtapaKey } from "../shared";

type EtapaSel = EtapaKey | "todas";

// Detalle de una etapa del funnel general: todas las empresas en ese estadío con su BDR,
// campaña y data completa. Pills para saltar de etapa + buscador + filtros. José 2026-07-17.
export function EtapaDetailClient({
  etapaInicial,
  campanaInicial,
  companies,
}: {
  etapaInicial: string;
  campanaInicial: string;
  companies: SeguimientoCompany[];
}) {
  const [etapa, setEtapa] = useState<EtapaSel>(etapaInicial as EtapaSel);
  const [campana, setCampana] = useState<string>(campanaInicial);
  const [bdr, setBdr] = useState<string>("todos");
  const [query, setQuery] = useState("");

  const etapaCounts = useMemo(() => {
    const counts: Record<EtapaKey, number> = { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, dropoff: 0 };
    for (const c of companies) {
      if (campana !== "todas" && c.campana_evento !== campana) continue;
      counts[c.etapa_funnel]++;
    }
    return counts;
  }, [companies, campana]);

  const totalCampana = useMemo(
    () => (campana === "todas" ? companies.length : companies.filter((c) => c.campana_evento === campana).length),
    [companies, campana]
  );

  const campanas = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.campana_evento));
    return [...set].sort();
  }, [companies]);

  const bdrs = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.assigned_bdr_name ?? SIN_BDR));
    return [...set].sort((a, b) => (a === SIN_BDR ? 1 : 0) - (b === SIN_BDR ? 1 : 0) || a.localeCompare(b));
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = companies.filter((c) => {
      if (etapa !== "todas" && c.etapa_funnel !== etapa) return false;
      if (campana !== "todas" && c.campana_evento !== campana) return false;
      if (bdr !== "todos" && (c.assigned_bdr_name ?? SIN_BDR) !== bdr) return false;
      if (q && !(c.company_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort(
      (a, b) => etapaRank(a.etapa_funnel) - etapaRank(b.etapa_funnel) || (a.bdr_assigned_at ?? "").localeCompare(b.bdr_assigned_at ?? "")
    );
  }, [companies, etapa, campana, bdr, query]);

  const etapaActiva = etapa !== "todas" ? ETAPAS.find((e) => e.key === etapa) : null;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <Link href="/seguimiento" style={{ fontSize: 12, color: "var(--fg-status-brand)", textDecoration: "none" }}>
          &larr; Volver a Seguimiento
        </Link>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 2px", color: etapaActiva?.color }}>
          {etapaActiva ? etapaActiva.label : "Todas las empresas"}
        </h2>
        <div className="text-muted" style={{ fontSize: 12 }}>
          {etapaActiva ? etapaActiva.detalle : "todas las etapas del funnel"}
          {campana !== "todas" ? ` · campaña: ${campana}` : ""}
        </div>
      </div>

      {/* Pills de etapa (cards clickeables, mismo patrón que el detalle por BDR) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, margin: "18px 0 24px" }}>
        <EtapaCard label="Asignadas" value={totalCampana} color="var(--fg-primary)" active={etapa === "todas"} onClick={() => setEtapa("todas")} />
        {ETAPAS.map((e) => (
          <EtapaCard
            key={e.key}
            label={e.labelCorto}
            value={etapaCounts[e.key]}
            color={e.color}
            active={etapa === e.key}
            onClick={() => setEtapa(etapa === e.key ? "todas" : e.key)}
          />
        ))}
      </div>

      {/* Filtros secundarios */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar empresa…"
          style={{ ...inputStyle, minWidth: 200 }}
        />
        <select value={campana} onChange={(e) => setCampana(e.target.value)} style={selectStyle(campana !== "todas")}>
          <option value="todas">Todas las campañas ({campanas.length})</option>
          {campanas.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={bdr} onChange={(e) => setBdr(e.target.value)} style={selectStyle(bdr !== "todos")}>
          <option value="todos">Todos los BDRs ({bdrs.length})</option>
          {bdrs.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Empresas */}
      <div className="section-title">Empresas ({filtered.length})</div>
      <div className="card">
        {filtered.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13, padding: 20, textAlign: "center" }}>
            No hay empresas con los filtros seleccionados.
          </div>
        ) : (
          filtered.map((c, i) => (
            <CompanyRow key={`${c.attio_company_id}-${c.campana_evento}-${i}`} c={c} showEtapa={etapa === "todas"} showBdr />
          ))
        )}
      </div>
    </div>
  );
}

function EtapaCard({ label, value, color, active, onClick }: {
  label: string; value: number; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card"
      title={`Filtrar: ${label}`}
      style={{
        textAlign: "center",
        cursor: "pointer",
        border: active ? "1px solid var(--fg-primary)" : "1px solid var(--border-tertiary)",
        background: active ? "var(--bg-secondary)" : "var(--bg-primary)",
        opacity: value === 0 && !active ? 0.45 : 1,
      }}
    >
      <div className="stat-value" style={{ fontSize: 22, color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-secondary)",
  color: "var(--fg-primary)",
  outline: "none",
};

const selectStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: active ? "var(--fg-primary)" : "var(--bg-primary)",
  color: active ? "var(--bg-primary)" : "var(--fg-secondary)",
  maxWidth: 320,
});
