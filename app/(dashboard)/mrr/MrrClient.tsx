"use client";

import { useMemo, useState } from "react";
import { WonByCloseDate } from "@/lib/supabase";
import { DateFilter, DateRange } from "@/components/DateFilter";
import { TerritorioPills, matchTerritorio, countByTerritorio, type TerritorioFilter } from "@/components/EventFilters";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";
import { attioDealUrl } from "@/lib/attio";

// 2026-05-27 (Jose H): negocios cerrados (Won) por fecha de cierre.
// Jose: "ahora nos miden por MRR, no por QM. Un deal que generó QM en enero pero
// cerró en mayo cuenta para Q2". Filtro por quarter/custom sobre close_date + tipo de deal.
export function MrrClient({ deals }: { deals: WonByCloseDate[] }) {
  // Default: Q en curso del año actual.
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [origen, setOrigen] = useState<string>("todos");
  const [territorio, setTerritorio] = useState<TerritorioFilter>("todos");

  const origenes = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => { if (d.origen_negocio) set.add(d.origen_negocio); });
    return ["todos", ...[...set].sort()];
  }, [deals]);

  // Deals filtrados solo por fecha (base para los conteos de territorio).
  const dateFiltered = useMemo(() => {
    return deals.filter((d) => {
      const cd = new Date(d.close_date + "T12:00:00");
      if (dateRange.from && cd < dateRange.from) return false;
      if (dateRange.to && cd > dateRange.to) return false;
      return true;
    });
  }, [deals, dateRange]);

  const territorioCounts = useMemo(() => countByTerritorio(dateFiltered, (d) => d.territorio), [dateFiltered]);

  const filtered = useMemo(() => {
    return dateFiltered.filter((d) => {
      if (origen !== "todos" && d.origen_negocio !== origen) return false;
      if (!matchTerritorio(d.territorio, territorio)) return false;
      return true;
    });
  }, [dateFiltered, origen, territorio]);

  const totals = useMemo(() => {
    const mrr = filtered.reduce((acc, d) => acc + Number(d.value_amount ?? 0), 0);
    const eventos = new Set(filtered.map((d) => d.campana_evento).filter(Boolean)).size;
    return { mrr, count: filtered.length, eventos };
  }, [filtered]);

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <DateFilter value={dateRange} onChange={setDateRange} />
        <select
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid var(--border-tertiary)",
            background: origen === "todos" ? "var(--bg-primary)" : "var(--fg-primary)",
            color: origen === "todos" ? "var(--fg-secondary)" : "var(--bg-primary)",
          }}
        >
          {origenes.map((o) => (
            <option key={o} value={o}>{o === "todos" ? "Todos los tipos de deal" : o}</option>
          ))}
        </select>
        <TerritorioPills value={territorio} onChange={setTerritorio} counts={territorioCounts} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          Solo Won de <strong>Field Marketing</strong> (con campaña/evento) · filtra por <strong>fecha de cierre</strong>
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
        <StatCard value={formatCurrency(totals.mrr)} label="MRR cerrado (FM)" color="var(--fg-status-success)" />
        <StatCard value={totals.count} label="Negocios ganados" />
        <StatCard value={totals.eventos} label="Eventos distintos" />
      </div>

      {/* Tabla */}
      <div className="section-title">Negocios cerrados ({filtered.length})</div>
      {filtered.length === 0 ? (
        <div className="text-muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
          Sin negocios cerrados en el rango seleccionado.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                <th style={thStyle}>Negocio</th>
                <th style={thStyle}>Campaña / Evento</th>
                <th style={thStyle}>Tipo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Cierre</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={`${d.attio_deal_id}-${i}`} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                  <td style={tdStyle}>
                    <a
                      href={attioDealUrl(d.attio_deal_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--fg-primary)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {d.deal_name ?? d.company_name ?? "— sin nombre —"}
                    </a>
                  </td>
                  <td style={tdStyle}>
                    {d.campana_evento ? (
                      <span className="badge" style={{ background: "var(--bg-status-brand)", color: "var(--fg-status-brand)" }}>
                        {d.campana_evento}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{d.origen_negocio ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: Number(d.value_amount) < 0 ? "var(--fg-status-error)" : undefined }}>
                    {formatCurrency(Number(d.value_amount ?? 0))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "var(--fg-secondary)" }}>
                    {new Date(d.close_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-quaternary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "middle",
};
