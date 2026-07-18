"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SeguimientoCompany } from "@/lib/supabase";
import { SIN_BDR, ETAPAS, etapaRank, CompanyRow, ReassignBar, type EtapaKey } from "../shared";

// Detalle de UNA persona (BDR): stats propias + todas sus empresas, filtrables por
// etapa (pills), por campaña y por nombre. José 2026-07-17. + Reasignación en bulk
// del Assigned BDR a otra persona (Stefany 2026-07-17).
export function BdrDetailClient({ bdrName, companies, bdrOptions }: {
  bdrName: string;
  companies: SeguimientoCompany[];
  bdrOptions: { id: string; name: string }[];
}) {
  const [etapa, setEtapa] = useState<EtapaKey | "todas">("todas");
  const [campana, setCampana] = useState<string>("todas");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Destinos: todos los BDRs menos esta misma persona.
  const destinos = useMemo(
    () => bdrOptions.filter((b) => b.name !== bdrName),
    [bdrOptions, bdrName]
  );

  function toggleSel(companyId: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  const etapaCounts = useMemo(() => {
    const counts: Record<EtapaKey, number> = { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, dropoff: 0, recycle: 0 };
    for (const c of companies) counts[c.etapa_funnel]++;
    return counts;
  }, [companies]);

  const campanas = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.campana_evento));
    return [...set].sort();
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = companies.filter((c) => {
      if (etapa !== "todas" && c.etapa_funnel !== etapa) return false;
      if (campana !== "todas" && c.campana_evento !== campana) return false;
      if (q && !(c.company_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    // Orden: etapa del funnel, y dentro de cada etapa la asignación más vieja primero.
    return list.sort(
      (a, b) => etapaRank(a.etapa_funnel) - etapaRank(b.etapa_funnel) || (a.bdr_assigned_at ?? "").localeCompare(b.bdr_assigned_at ?? "")
    );
  }, [companies, etapa, campana, query]);

  const sinBdr = bdrName === SIN_BDR;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <Link href="/seguimiento" style={{ fontSize: 12, color: "var(--fg-status-brand)", textDecoration: "none" }}>
            &larr; Volver a Seguimiento
          </Link>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 2px", color: sinBdr ? "var(--fg-status-warning)" : undefined }}>
            {bdrName}
          </h2>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {companies.length} empresas asignadas · {campanas.length} campaña{campanas.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Stats de la persona (pills clickeables = filtro por etapa) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12, margin: "18px 0 24px" }}>
        <EtapaCard
          label="Asignadas"
          value={companies.length}
          color="var(--fg-primary)"
          active={etapa === "todas"}
          onClick={() => setEtapa("todas")}
        />
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
          style={{
            padding: "6px 12px",
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--border-tertiary)",
            background: "var(--bg-secondary)",
            color: "var(--fg-primary)",
            outline: "none",
            minWidth: 200,
          }}
        />
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
            maxWidth: 340,
          }}
        >
          <option value="todas">Todas sus campañas ({campanas.length})</option>
          {campanas.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Empresas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="section-title" style={{ marginBottom: 8 }}>
          Empresas ({filtered.length}
          {etapa !== "todas" ? ` · ${ETAPAS.find((e) => e.key === etapa)?.labelCorto}` : ""})
        </div>
        {filtered.length > 0 && (
          <button
            onClick={() => setSel(new Set(filtered.map((c) => c.attio_company_id)))}
            style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--fg-status-info)", marginBottom: 8 }}
          >
            Seleccionar las {filtered.length} filtradas
          </button>
        )}
      </div>
      <ReassignBar selected={sel} bdrOptions={destinos} onClear={() => setSel(new Set())} />
      <div className="card">
        {filtered.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13, padding: 20, textAlign: "center" }}>
            No hay empresas con los filtros seleccionados.
          </div>
        ) : (
          filtered.map((c, i) => (
            <CompanyRow
              key={`${c.attio_company_id}-${c.campana_evento}-${i}`}
              c={c}
              showEtapa={etapa === "todas"}
              selected={sel.has(c.attio_company_id)}
              onToggleSelect={() => toggleSel(c.attio_company_id)}
            />
          ))
        )}
      </div>
      <div className="text-muted" style={{ fontSize: 10, marginTop: 8 }}>
        Seleccioná empresas con el checkbox para reasignarlas a otro BDR — el cambio se escribe en
        Attio (campo Assigned BDR) y se refleja acá al instante.
      </div>
      {sinBdr && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
          Estas empresas no tienen BDR asignado en Attio (campo Assigned BDR vacío) — el pool sin dueño.
        </div>
      )}
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
