"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { SeguimientoCompany } from "@/lib/supabase";
import { SIN_BDR, ETAPAS, ETAPAS_PROCESADAS, etapaRank, CompanyRow, ReassignBar, MultiSelectFilter, type EtapaKey } from "../shared";

// "procesadas" = acumulado de las 4 etapas terminales (fila agregada del funnel general).
type EtapaSel = EtapaKey | "todas" | "procesadas";

// Detalle de una etapa del funnel general: todas las empresas en ese estadío con su BDR,
// campaña y data completa. Pills para saltar de etapa + buscador + filtros. José 2026-07-17.
export function EtapaDetailClient({
  etapaInicial,
  campanasIniciales,
  companies,
}: {
  etapaInicial: string;
  campanasIniciales: string[];
  companies: SeguimientoCompany[];
}) {
  const [etapa, setEtapa] = useState<EtapaSel>(etapaInicial as EtapaSel);
  // Multi-select de campañas: vacío = todas (José + Cande 2026-08-26). Llega preseleccionado
  // desde el funnel general vía ?campana= (repetible).
  const [campanasSel, setCampanasSel] = useState<Set<string>>(new Set(campanasIniciales));
  const inCampana = useCallback(
    (c: SeguimientoCompany) => campanasSel.size === 0 || campanasSel.has(c.campana_evento),
    [campanasSel]
  );
  const [bdr, setBdr] = useState<string>("todos");
  const [query, setQuery] = useState("");
  // Selección para reasignar BDR en bulk (por attio_company_id). Stefany/José 2026-07-17.
  const [sel, setSel] = useState<Set<string>>(new Set());

  const bdrOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      if (c.assigned_bdr_id && c.assigned_bdr_name) map.set(c.assigned_bdr_id, c.assigned_bdr_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [companies]);

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
    for (const c of companies) {
      if (!inCampana(c)) continue;
      counts[c.etapa_funnel]++;
    }
    return counts;
  }, [companies, inCampana]);

  const totalCampana = useMemo(
    () => companies.filter(inCampana).length,
    [companies, inCampana]
  );

  const campanaOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of companies) counts.set(c.campana_evento, (counts.get(c.campana_evento) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
  }, [companies]);

  const bdrs = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.assigned_bdr_name ?? SIN_BDR));
    return [...set].sort((a, b) => (a === SIN_BDR ? 1 : 0) - (b === SIN_BDR ? 1 : 0) || a.localeCompare(b));
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = companies.filter((c) => {
      if (etapa === "procesadas") {
        if (!ETAPAS_PROCESADAS.includes(c.etapa_funnel)) return false;
      } else if (etapa !== "todas" && c.etapa_funnel !== etapa) return false;
      if (!inCampana(c)) return false;
      if (bdr !== "todos" && (c.assigned_bdr_name ?? SIN_BDR) !== bdr) return false;
      if (q && !(c.company_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort(
      (a, b) => etapaRank(a.etapa_funnel) - etapaRank(b.etapa_funnel) || (a.bdr_assigned_at ?? "").localeCompare(b.bdr_assigned_at ?? "")
    );
  }, [companies, etapa, inCampana, bdr, query]);

  const etapaActiva = etapa !== "todas" && etapa !== "procesadas" ? ETAPAS.find((e) => e.key === etapa) : null;
  const headerLabel = etapa === "procesadas" ? "Procesadas" : etapaActiva ? etapaActiva.label : "Todas las empresas";
  const headerDetalle = etapa === "procesadas"
    ? "acumulado: terminaron su procesamiento (respuesta positiva, sin respuesta, DropOff o Recycle)"
    : etapaActiva ? etapaActiva.detalle : "todas las etapas del funnel";
  const procesadasCount = ETAPAS_PROCESADAS.reduce((acc, k) => acc + etapaCounts[k], 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <Link href="/seguimiento" style={{ fontSize: 12, color: "var(--fg-status-brand)", textDecoration: "none" }}>
          &larr; Volver a Estado actual
        </Link>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 2px", color: etapaActiva?.color }}>
          {headerLabel}
        </h2>
        <div className="text-muted" style={{ fontSize: 12 }}>
          {headerDetalle}
          {campanasSel.size > 0 ? ` · campaña${campanasSel.size === 1 ? "" : "s"}: ${[...campanasSel].sort().join(", ")}` : ""}
        </div>
      </div>

      {/* Pills de etapa (cards clickeables, mismo patrón que el detalle por BDR) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 12, margin: "18px 0 24px" }}>
        <EtapaCard label="Asignadas" value={totalCampana} color="var(--fg-primary)" active={etapa === "todas"} onClick={() => setEtapa("todas")} />
        {ETAPAS.filter((e) => !ETAPAS_PROCESADAS.includes(e.key)).map((e) => (
          <EtapaCard
            key={e.key}
            label={e.labelCorto}
            value={etapaCounts[e.key]}
            color={e.color}
            active={etapa === e.key}
            onClick={() => setEtapa(etapa === e.key ? "todas" : e.key)}
          />
        ))}
        <EtapaCard
          label="Procesadas"
          value={procesadasCount}
          color="var(--fg-primary)"
          active={etapa === "procesadas"}
          onClick={() => setEtapa(etapa === "procesadas" ? "todas" : "procesadas")}
        />
        {ETAPAS.filter((e) => ETAPAS_PROCESADAS.includes(e.key)).map((e) => (
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
        <MultiSelectFilter
          options={campanaOptions}
          selected={campanasSel}
          onChange={setCampanasSel}
          allLabel="Todas las campañas"
          pluralLabel="campañas"
          searchPlaceholder="Buscar evento…"
          clearLabel="Limpiar selección (ver todas)"
        />
        <select value={bdr} onChange={(e) => setBdr(e.target.value)} style={selectStyle(bdr !== "todos")}>
          <option value="todos">Todos los BDRs ({bdrs.length})</option>
          {bdrs.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Empresas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Empresas ({filtered.length})</div>
        {filtered.length > 0 && (
          <button
            onClick={() => setSel(new Set(filtered.map((c) => c.attio_company_id)))}
            style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--fg-status-info)", marginBottom: 8 }}
          >
            Seleccionar las {filtered.length} filtradas
          </button>
        )}
      </div>
      <ReassignBar selected={sel} bdrOptions={bdrOptions} onClear={() => setSel(new Set())} />
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
              showBdr
              selected={sel.has(c.attio_company_id)}
              onToggleSelect={() => toggleSel(c.attio_company_id)}
            />
          ))
        )}
      </div>
      <div className="text-muted" style={{ fontSize: 10, marginTop: 8 }}>
        Seleccioná empresas con el checkbox para reasignarles el BDR — el cambio se escribe en Attio
        (campo Assigned BDR) y se refleja acá al instante.
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
