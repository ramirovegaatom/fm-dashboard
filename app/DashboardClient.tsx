"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EventSummary, PartnerByEvent } from "@/lib/supabase";
import { SyncButton } from "./SyncButton";

type Filter = "todos" | "Presencial" | "Virtual";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function StatCard({ value, label, color, sub }: { value: string | number; label: string; color?: string; sub?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FunnelArrow() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", color: "var(--border-tertiary)" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </div>
  );
}

export function DashboardClient({ events, partners }: { events: EventSummary[]; partners: PartnerByEvent[] }) {
  const [filter, setFilter] = useState<Filter>("todos");
  const [partnerFilter, setPartnerFilter] = useState<string>("todos");

  const partnerOptions = useMemo(() => {
    const map = new Map<string, { partner: string; registros: number; eventos: Set<string> }>();
    for (const p of partners) {
      const entry = map.get(p.partner) ?? { partner: p.partner, registros: 0, eventos: new Set<string>() };
      entry.registros += p.registros;
      entry.eventos.add(p.luma_event_id);
      map.set(p.partner, entry);
    }
    return Array.from(map.values())
      .map((e) => ({ partner: e.partner, eventos: e.eventos.size }))
      .sort((a, b) => b.eventos - a.eventos);
  }, [partners]);

  const eventsWithSelectedPartner = useMemo(() => {
    if (partnerFilter === "todos") return null;
    return new Set(partners.filter((p) => p.partner === partnerFilter).map((p) => p.luma_event_id));
  }, [partners, partnerFilter]);

  const byType = filter === "todos" ? events : events.filter((e) => e.evento_tipo === filter);
  const all = eventsWithSelectedPartner ? byType.filter((e) => eventsWithSelectedPartner.has(e.luma_event_id)) : byType;

  const presenciales = events.filter((e) => e.evento_tipo === "Presencial");
  const virtuales = events.filter((e) => e.evento_tipo === "Virtual");

  const totals = all.reduce(
    (acc, e) => ({
      registros: acc.registros + e.total_registros,
      asistentes: acc.asistentes + e.total_asistentes,
      icp: acc.icp + e.total_aprobados_icp,
      icpReal: acc.icpReal + (e.total_icp_real ?? 0),
      performance: acc.performance + e.registros_performance,
      qm: acc.qm + e.qm_por_fm,
      demo: acc.demo + e.demo,
      won: acc.won + e.won,
      mrr: acc.mrr + Number(e.mrr_won),
    }),
    { registros: 0, asistentes: 0, icp: 0, icpReal: 0, performance: 0, qm: 0, demo: 0, won: 0, mrr: 0 }
  );

  const totalConEmpresa = all.reduce((acc, e) => acc + (e.total_con_empresa ?? 0), 0);
  const pctMatchGlobal = totals.registros > 0 ? Math.round(totalConEmpresa / totals.registros * 100) : 0;

  const pauta = all.reduce(
    (acc, e) => ({
      spend: acc.spend + Number(e.ad_spend ?? 0),
      registros: acc.registros + (e.registros_performance ?? 0),
      asistentes: acc.asistentes + (e.asistentes_performance ?? 0),
      eventosConSpend: acc.eventosConSpend + (Number(e.ad_spend ?? 0) > 0 ? 1 : 0),
    }),
    { spend: 0, registros: 0, asistentes: 0, eventosConSpend: 0 }
  );
  const cplPauta = pauta.registros > 0 ? pauta.spend / pauta.registros : 0;
  const tasaAsistenciaPauta = pauta.registros > 0 ? Math.round((pauta.asistentes / pauta.registros) * 100) : 0;

  const filters: { label: string; value: Filter; count: number }[] = [
    { label: "Todos", value: "todos", count: events.length },
    { label: "Presenciales", value: "Presencial", count: presenciales.length },
    { label: "Webinars", value: "Virtual", count: virtuales.length },
  ];

  return (
    <main className="dashboard-container">
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Field Marketing Dashboard</h1>
          <SyncButton />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid var(--border-tertiary)",
                  background: filter === f.value ? "var(--fg-primary)" : "var(--bg-primary)",
                  color: filter === f.value ? "var(--bg-primary)" : "var(--fg-secondary)",
                  cursor: "pointer",
                }}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          {partnerOptions.length > 0 && (
            <select
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border-tertiary)",
                background: partnerFilter === "todos" ? "var(--bg-primary)" : "var(--fg-primary)",
                color: partnerFilter === "todos" ? "var(--fg-secondary)" : "var(--bg-primary)",
                cursor: "pointer",
              }}
            >
              <option value="todos">Todos los partners</option>
              {partnerOptions.map((p) => (
                <option key={p.partner} value={p.partner}>
                  Partner: {p.partner} ({p.eventos})
                </option>
              ))}
            </select>
          )}
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 16,
            background: pctMatchGlobal > 70 ? "var(--bg-status-success)" : pctMatchGlobal > 40 ? "var(--bg-status-warning)" : "var(--bg-status-error)",
            color: pctMatchGlobal > 70 ? "var(--fg-status-success)" : pctMatchGlobal > 40 ? "var(--fg-status-warning)" : "var(--fg-status-error)",
          }}>
            {pctMatchGlobal}% matching ({totalConEmpresa}/{totals.registros})
          </span>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12, marginBottom: 32 }}>
        <StatCard value={totals.registros} label="Registros" />
        <StatCard value={totals.asistentes} label="Asistentes" />
        <StatCard
          value={totals.icpReal}
          label="ICP real"
          color="var(--fg-status-success)"
          sub={`vs ${totals.icp} aprobados Luma`}
        />
        <StatCard value={totals.performance} label="Performance" color="var(--fg-status-info)" />
        <StatCard value={totals.qm} label="QM FM" color="var(--fg-status-warning)" />
        <StatCard value={totals.demo} label="Demo" />
        <StatCard value={totals.won} label="Won" color="var(--fg-status-success)" />
        <StatCard value={`$${totals.mrr.toLocaleString()}`} label="MRR Won" color="var(--fg-status-success)" />
      </div>

      <section style={{ marginBottom: 32 }}>
        <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Pauta
          <span className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>
            {pauta.eventosConSpend}/{all.length} eventos con spend cargado
          </span>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div className="stat-value" style={{ color: "var(--fg-status-info)" }}>
                ${pauta.spend.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </div>
              <div className="stat-label">Inversión</div>
              {pauta.eventosConSpend === 0 && (
                <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>pendiente Diego</div>
              )}
            </div>
            <FunnelArrow />
            <div style={{ textAlign: "center" }}>
              <div className="stat-value">{pauta.registros.toLocaleString()}</div>
              <div className="stat-label">Registros pauta</div>
              {cplPauta > 0 && (
                <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                  CPL ${cplPauta.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
            <FunnelArrow />
            <div style={{ textAlign: "center" }}>
              <div className="stat-value">{pauta.asistentes.toLocaleString()}</div>
              <div className="stat-label">Asistentes pauta</div>
              {pauta.registros > 0 && (
                <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                  {tasaAsistenciaPauta}% asistencia
                </div>
              )}
            </div>
          </div>
          <div className="text-muted" style={{ fontSize: 10, marginTop: 16, textAlign: "center" }}>
            QMs, Demos y Won de pauta — pendiente integración UTMID en Deal (Bruno, fin de semana)
          </div>
        </div>
      </section>

      <div className="section-title">Eventos ({all.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {all.map((e) => (
          <Link
            key={e.luma_event_id}
            href={`/event/${e.luma_event_id}`}
            className="card card-hover"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${e.evento_tipo === "Presencial" ? "badge-presencial" : "badge-virtual"}`}>
                    {e.evento_tipo}
                  </span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {formatDate(e.evento_fecha)}
                  </span>
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.evento_nombre}
                </h3>
                {e.evento_ubicacion && (
                  <p className="text-muted" style={{ fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.evento_ubicacion}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: 16, flexShrink: 0, textAlign: "right" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{e.total_registros}</div>
                  <div className="stat-label">Registros</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{e.total_asistentes || e.total_joined_virtual || "\u2014"}</div>
                  <div className="stat-label">Asistentes</div>
                </div>
                <div>
                  <div className="text-success" style={{ fontSize: 18, fontWeight: 700 }}>{e.icp_real_pct ?? 0}%</div>
                  <div className="stat-label">ICP real</div>
                  <div className="text-muted" style={{ fontSize: 9, marginTop: 1 }}>{e.icp_pct}% Luma</div>
                </div>
                <div>
                  <div className="text-info" style={{ fontSize: 18, fontWeight: 700 }}>{e.registros_performance}</div>
                  <div className="stat-label">Pauta</div>
                </div>
                {(e.qm_por_fm > 0 || e.demo > 0 || e.won > 0) && (
                  <div>
                    <div className="text-warning" style={{ fontSize: 18, fontWeight: 700 }}>{e.qm_por_fm}</div>
                    <div className="stat-label">QM FM</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{
                    width: `${e.tasa_conversion_pct ?? 0}%`,
                    background: Number(e.tasa_conversion_pct) > 30
                      ? "var(--fg-status-success)"
                      : Number(e.tasa_conversion_pct) > 15
                      ? "var(--fg-status-warning)"
                      : "var(--fg-status-error)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span className="text-muted" style={{ fontSize: 10 }}>
                  Tasa asistencia: {e.tasa_conversion_pct ?? 0}%
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 12,
                  background: Number(e.pct_matched) > 70 ? "var(--bg-status-success)" : Number(e.pct_matched) > 40 ? "var(--bg-status-warning)" : "var(--bg-status-error)",
                  color: Number(e.pct_matched) > 70 ? "var(--fg-status-success)" : Number(e.pct_matched) > 40 ? "var(--fg-status-warning)" : "var(--fg-status-error)",
                }}>
                  {e.pct_matched}% match
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
