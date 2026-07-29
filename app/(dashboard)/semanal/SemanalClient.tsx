"use client";

import { useMemo, useState } from "react";
import { DailyProgress, WeeklyHito, CampanaFecha } from "@/lib/supabase";
import { StatCard } from "@/components/StatCard";
import { DateFilter, DateRange } from "@/components/DateFilter";
import { formatCurrency } from "@/lib/format";
import { attioCompanyUrl } from "@/lib/attio";

// 2026-07-28: progreso semana a semana (pedido reunión Camilo/José 2026-07-23).
// Rework UX mismo día (feedback Ramiro): filtro de fechas custom (DateFilter compartido,
// grano diario), sin semanas en 0 fuera del rango con data, inicio del evento marcado en
// los charts + shortcut "Desde el evento", y el detalle de empresas por hito como sección
// siempre visible (antes escondido en un modal por semana).
// Fechas = actividad real del contacto o fecha de etapa del deal — nunca la fecha del evento.

type WeekAgg = {
  semana: string; // lunes (YYYY-MM-DD)
  llamadas: number;
  whatsapps: number;
  empresas_trabajadas: number;
  empresas_procesadas: number;
  qm_agendadas: number;
  qm_completadas: number;
  demos: number;
  wons: number;
  mrr_won: number;
  losts: number;
};

const METRICAS_CHART: { key: keyof WeekAgg; label: string; color: string; money?: boolean }[] = [
  { key: "llamadas", label: "Llamadas", color: "var(--chart-linkedin)" },
  { key: "whatsapps", label: "WhatsApps", color: "var(--chart-email)" },
  { key: "empresas_procesadas", label: "Empresas procesadas (estructura 3+2)", color: "var(--fg-status-brand)" },
  { key: "qm_agendadas", label: "QM agendadas (deals)", color: "var(--fg-status-info)" },
  { key: "demos", label: "Demos", color: "var(--chart-partner)" },
  { key: "mrr_won", label: "MRR cerrado", color: "var(--fg-status-success)", money: true },
];

// Orden = recorrido del funnel. dropoff/recycle no aparecen: Attio sobreescribe el stage
// sin fecha histórica (se cubrirán con fm_weekly_snapshots hacia adelante).
const HITOS_META: { key: WeeklyHito["hito"]; label: string }[] = [
  { key: "inicio_prospeccion", label: "Inicio prospección" },
  { key: "procesada", label: "Procesada (3+2)" },
  { key: "qm_agendada", label: "QM agendada" },
  { key: "qm_completada", label: "QM completada" },
  { key: "demo", label: "Demo" },
  { key: "won", label: "Won" },
];

const MAX_FILAS_HITOS = 300;

function mondayOf(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// DateRange (Date locales del DateFilter) → strings YYYY-MM-DD comparables con la data.
function toLocalISO(d?: Date): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtSemana(semana: string) {
  return new Date(semana + "T12:00:00Z").toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function fmtFecha(fecha: string) {
  return new Date(fecha + "T12:00:00Z").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function SemanalClient({
  dias,
  hitos,
  fechasEvento,
}: {
  dias: DailyProgress[];
  hitos: WeeklyHito[];
  fechasEvento: CampanaFecha[];
}) {
  const [campana, setCampana] = useState<string>("todas");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [hito, setHito] = useState<WeeklyHito["hito"]>("procesada");
  const [bdrSel, setBdrSel] = useState<string | null>(null);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const semanaActual = useMemo(() => mondayOf(hoy), [hoy]);

  const campanas = useMemo(() => {
    const set = new Set(dias.map((r) => r.campana_evento));
    hitos.forEach((h) => set.add(h.campana_evento));
    return ["todas", ...[...set].sort()];
  }, [dias, hitos]);

  // Fecha del evento de la campaña elegida (si está mapeada).
  const eventoFecha = useMemo(() => {
    if (campana === "todas") return null;
    return fechasEvento.find((f) => f.campana_evento === campana)?.evento_fecha?.slice(0, 10) ?? null;
  }, [campana, fechasEvento]);

  const fromStr = toLocalISO(dateRange.from);
  const toStr = toLocalISO(dateRange.to);

  const diasFiltrados = useMemo(
    () =>
      dias.filter(
        (r) =>
          (campana === "todas" || r.campana_evento === campana) &&
          (!fromStr || r.fecha >= fromStr) &&
          (!toStr || r.fecha <= toStr) &&
          r.fecha <= hoy // deals con fecha futura (data quality Attio) quedan fuera
      ),
    [dias, campana, fromStr, toStr, hoy]
  );

  // Agregado semanal para charts y tabla. Sin rango explícito: solo desde la primera
  // hasta la última semana CON data de la selección (no más semanas en 0 de relleno).
  // Con rango explícito: todas las semanas de esa ventana (el usuario la pidió).
  const semanas = useMemo(() => {
    const byWeek = new Map<string, WeekAgg>();
    for (const r of diasFiltrados) {
      const key = mondayOf(r.fecha);
      const acc =
        byWeek.get(key) ??
        ({
          semana: key,
          llamadas: 0,
          whatsapps: 0,
          empresas_trabajadas: 0,
          empresas_procesadas: 0,
          qm_agendadas: 0,
          qm_completadas: 0,
          demos: 0,
          wons: 0,
          mrr_won: 0,
          losts: 0,
        } as WeekAgg);
      acc.llamadas += r.llamadas;
      acc.whatsapps += r.whatsapps;
      acc.empresas_trabajadas += r.empresas_trabajadas; // aprox: empresas-día, no dedup semanal
      acc.empresas_procesadas += r.empresas_procesadas;
      acc.qm_agendadas += r.qm_agendadas;
      acc.qm_completadas += r.qm_completadas;
      acc.demos += r.demos;
      acc.wons += r.wons;
      acc.mrr_won = Number(acc.mrr_won) + Number(r.mrr_won);
      acc.losts += r.losts;
      byWeek.set(key, acc);
    }

    const keys = [...byWeek.keys()].sort();
    let start: string | null = null;
    let end: string | null = null;
    if (fromStr || toStr) {
      start = fromStr ? mondayOf(fromStr) : keys[0] ?? null;
      const endCandidate = toStr && toStr < hoy ? toStr : hoy;
      end = mondayOf(endCandidate);
    } else {
      start = keys[0] ?? null;
      end = keys[keys.length - 1] ?? null;
    }
    if (!start || !end || start > end) return [];

    const out: WeekAgg[] = [];
    const cursor = new Date(start + "T00:00:00Z");
    const endDate = new Date(end + "T00:00:00Z");
    while (cursor <= endDate) {
      const key = cursor.toISOString().slice(0, 10);
      out.push(
        byWeek.get(key) ?? {
          semana: key,
          llamadas: 0,
          whatsapps: 0,
          empresas_trabajadas: 0,
          empresas_procesadas: 0,
          qm_agendadas: 0,
          qm_completadas: 0,
          demos: 0,
          wons: 0,
          mrr_won: 0,
          losts: 0,
        }
      );
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return out;
  }, [diasFiltrados, fromStr, toStr, hoy]);

  // Semana del evento dentro del rango mostrado → línea de referencia en los charts.
  const markerIdx = useMemo(() => {
    if (!eventoFecha) return -1;
    const semanaEvento = mondayOf(eventoFecha);
    return semanas.findIndex((s) => s.semana === semanaEvento);
  }, [eventoFecha, semanas]);

  const totals = useMemo(
    () =>
      diasFiltrados.reduce(
        (acc, s) => ({
          llamadas: acc.llamadas + s.llamadas,
          whatsapps: acc.whatsapps + s.whatsapps,
          procesadas: acc.procesadas + s.empresas_procesadas,
          qm: acc.qm + s.qm_agendadas,
          wons: acc.wons + s.wons,
          mrr: acc.mrr + Number(s.mrr_won),
        }),
        { llamadas: 0, whatsapps: 0, procesadas: 0, qm: 0, wons: 0, mrr: 0 }
      ),
    [diasFiltrados]
  );

  // ── Empresas por hito (sección siempre visible) ──
  const hitosFiltrados = useMemo(
    () =>
      hitos.filter(
        (h) =>
          (campana === "todas" || h.campana_evento === campana) &&
          (!fromStr || h.fecha >= fromStr) &&
          (!toStr || h.fecha <= toStr) &&
          h.fecha <= hoy
      ),
    [hitos, campana, fromStr, toStr, hoy]
  );

  const hitoCounts = useMemo(() => {
    const m = new Map<string, number>();
    hitosFiltrados.forEach((h) => m.set(h.hito, (m.get(h.hito) ?? 0) + 1));
    return m;
  }, [hitosFiltrados]);

  const filasHito = useMemo(
    () => hitosFiltrados.filter((h) => h.hito === hito).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [hitosFiltrados, hito]
  );

  const porBdr = useMemo(() => {
    const m = new Map<string, number>();
    filasHito.forEach((f) => {
      const k = f.assigned_bdr_name ?? "— sin BDR —";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filasHito]);

  const filasVisibles = useMemo(
    () => (bdrSel ? filasHito.filter((f) => (f.assigned_bdr_name ?? "— sin BDR —") === bdrSel) : filasHito),
    [filasHito, bdrSel]
  );

  const hayDeals = filasVisibles.some((f) => f.deal_name);

  function filtrarSemana(semana: string) {
    const from = new Date(semana + "T00:00:00");
    const to = new Date(semana + "T00:00:00");
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59);
    setDateRange({ from, to });
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <select
          value={campana}
          onChange={(e) => {
            setCampana(e.target.value);
            setBdrSel(null);
          }}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid var(--border-tertiary)",
            background: campana === "todas" ? "var(--bg-primary)" : "var(--fg-primary)",
            color: campana === "todas" ? "var(--fg-secondary)" : "var(--bg-primary)",
            maxWidth: 320,
          }}
        >
          {campanas.map((c) => (
            <option key={c} value={c}>
              {c === "todas" ? "Todas las campañas" : c}
            </option>
          ))}
        </select>
        <DateFilter value={dateRange} onChange={setDateRange} />
        {eventoFecha && (
          <>
            <span className="badge" style={{ background: "var(--bg-status-brand)", color: "var(--fg-status-brand)", fontSize: 11 }}>
              Evento: {fmtFecha(eventoFecha)}
            </span>
            <button
              onClick={() => setDateRange({ from: new Date(eventoFecha + "T00:00:00") })}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border-tertiary)",
                background: "var(--bg-primary)",
                color: "var(--fg-secondary)",
                cursor: "pointer",
              }}
            >
              Desde el evento →
            </button>
          </>
        )}
      </div>
      <div className="text-muted" style={{ fontSize: 12, marginBottom: 24 }}>
        Fechas = actividad real del contacto o fecha de etapa del deal, nunca la fecha del evento · semana = lunes a domingo
      </div>

      {/* Stats del rango */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 32 }}>
        <StatCard value={totals.llamadas.toLocaleString("es-AR")} label="Llamadas" metricKey="semanal_actividades" />
        <StatCard value={totals.whatsapps.toLocaleString("es-AR")} label="WhatsApps" metricKey="semanal_actividades" />
        <StatCard value={totals.procesadas} label="Empresas procesadas" metricKey="semanal_procesadas" />
        <StatCard value={totals.qm} label="QM agendadas" metricKey="semanal_qm" />
        <StatCard value={totals.wons} label="Wons" metricKey="semanal_won" />
        <StatCard value={formatCurrency(totals.mrr)} label="MRR cerrado" color="var(--fg-status-success)" metricKey="semanal_won" />
      </div>

      {/* Small multiples: una métrica por gráfico (escalas distintas, nunca doble eje) */}
      {semanas.length === 0 ? (
        <div className="text-muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
          Sin data para la selección.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginBottom: 32 }}>
          {METRICAS_CHART.map((m) => (
            <WeekBars
              key={m.key}
              title={m.label}
              color={m.color}
              points={semanas.map((s) => ({ semana: s.semana, valor: Number(s[m.key]) }))}
              fmt={m.money ? (n) => formatCurrency(n) : (n) => n.toLocaleString("es-AR")}
              markerIdx={markerIdx}
            />
          ))}
        </div>
      )}

      {/* Empresas por hito — siempre visible (feedback Ramiro 2026-07-28) */}
      <div className="section-title">Empresas por hito · quién las trabajó</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {HITOS_META.map((h) => {
            const n = hitoCounts.get(h.key) ?? 0;
            const active = hito === h.key;
            return (
              <button
                key={h.key}
                onClick={() => {
                  setHito(h.key);
                  setBdrSel(null);
                }}
                disabled={n === 0}
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid var(--border-tertiary)",
                  cursor: n === 0 ? "default" : "pointer",
                  opacity: n === 0 ? 0.4 : 1,
                  background: active ? "var(--fg-primary)" : "var(--bg-primary)",
                  color: active ? "var(--bg-primary)" : "var(--fg-secondary)",
                }}
              >
                {h.label} ({n})
              </button>
            );
          })}
        </div>

        {/* Quién (BDR asignado) — click filtra la lista */}
        {porBdr.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {porBdr.map(([bdr, n]) => {
              const active = bdrSel === bdr;
              return (
                <button
                  key={bdr}
                  onClick={() => setBdrSel(active ? null : bdr)}
                  style={{
                    padding: "3px 8px",
                    fontSize: 11,
                    borderRadius: 999,
                    border: "1px solid var(--border-tertiary)",
                    cursor: "pointer",
                    background: active ? "var(--fg-primary)" : "var(--bg-secondary)",
                    color: active ? "var(--bg-primary)" : "var(--fg-secondary)",
                  }}
                >
                  {bdr}: <strong>{n}</strong>
                </button>
              );
            })}
          </div>
        )}

        {filasVisibles.length === 0 ? (
          <div className="text-muted" style={{ padding: 16, textAlign: "center", fontSize: 13 }}>
            Sin empresas con este hito en la selección.
          </div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                  <th style={thStyle}>Empresa</th>
                  {campana === "todas" && <th style={thStyle}>Campaña</th>}
                  <th style={thStyle}>BDR asignado</th>
                  <th style={thStyle}>Llamó (JustCall)</th>
                  {hayDeals && <th style={thStyle}>Deal</th>}
                  <th style={thRight}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.slice(0, MAX_FILAS_HITOS).map((f, i) => {
                  const url = attioCompanyUrl(f.attio_company_id);
                  return (
                    <tr key={`${f.attio_company_id}-${f.deal_name}-${f.fecha}-${i}`} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-primary)", textDecoration: "none" }}>
                            {f.company_name ?? "— sin nombre —"}
                          </a>
                        ) : (
                          f.company_name ?? "— sin nombre —"
                        )}
                      </td>
                      {campana === "todas" && (
                        <td style={tdStyle}>
                          <span className="badge" style={{ background: "var(--bg-status-brand)", color: "var(--fg-status-brand)", fontSize: 10 }}>
                            {f.campana_evento}
                          </span>
                        </td>
                      )}
                      <td style={{ ...tdStyle, color: f.assigned_bdr_name ? "var(--fg-secondary)" : "var(--fg-quaternary)" }}>
                        {f.assigned_bdr_name ?? "— sin BDR —"}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--fg-quaternary)", fontSize: 12 }}>{f.agentes ?? "—"}</td>
                      {hayDeals && <td style={{ ...tdStyle, color: "var(--fg-secondary)", fontSize: 12 }}>{f.deal_name ?? "—"}</td>}
                      <td style={{ ...tdRight, color: "var(--fg-secondary)", whiteSpace: "nowrap" }}>{fmtFecha(f.fecha)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filasVisibles.length > MAX_FILAS_HITOS && (
              <div className="text-muted" style={{ padding: 10, fontSize: 12, textAlign: "center" }}>
                Mostrando {MAX_FILAS_HITOS} de {filasVisibles.length} — acotá el rango de fechas para ver el resto.
              </div>
            )}
          </div>
        )}

        <div className="text-muted" style={{ fontSize: 11, marginTop: 12 }}>
          BDR = asignado actual en Attio · &quot;Llamó&quot; = agente de JustCall (cobertura parcial, solo llamadas recientes) ·
          DropOff/Recycle no tienen fecha histórica — se acumulan en snapshots semanales desde el 2026-07-28.
        </div>
      </div>

      {/* Tabla semanal (click en la semana = filtrar ese rango) */}
      <div className="section-title">Detalle por semana ({semanas.length})</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
              <th style={thStyle}>Semana</th>
              <th style={thRight}>Llamadas</th>
              <th style={thRight}>WhatsApps</th>
              <th style={thRight}>Emp. procesadas</th>
              <th style={thRight}>QM agend.</th>
              <th style={thRight}>QM compl.</th>
              <th style={thRight}>Demos</th>
              <th style={thRight}>Wons</th>
              <th style={thRight}>MRR</th>
              <th style={thRight}>Losts</th>
            </tr>
          </thead>
          <tbody>
            {[...semanas].reverse().map((s) => (
              <tr key={s.semana} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  <button
                    onClick={() => filtrarSemana(s.semana)}
                    title="Filtrar esta semana"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--fg-primary)",
                      cursor: "pointer",
                      textDecoration: "underline dotted",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {fmtSemana(s.semana)}
                  </button>
                </td>
                <td style={tdRight}>{s.llamadas}</td>
                <td style={tdRight}>{s.whatsapps}</td>
                <td style={tdRight}>{s.empresas_procesadas}</td>
                <td style={tdRight}>{s.qm_agendadas}</td>
                <td style={tdRight}>{s.qm_completadas}</td>
                <td style={tdRight}>{s.demos}</td>
                <td style={{ ...tdRight, fontWeight: 600 }}>{s.wons}</td>
                <td style={{ ...tdRight, color: "var(--fg-status-success)", fontWeight: 600 }}>
                  {Number(s.mrr_won) > 0 ? formatCurrency(Number(s.mrr_won)) : "—"}
                </td>
                <td style={{ ...tdRight, color: "var(--fg-quaternary)" }}>{s.losts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Barras semanales de UNA métrica (single series: el título la nombra, sin leyenda).
// Tooltip por barra al hover; línea punteada = semana del evento.
function WeekBars({
  title,
  color,
  points,
  fmt,
  markerIdx,
}: {
  title: string;
  color: string;
  points: { semana: string; valor: number }[];
  fmt: (n: number) => string;
  markerIdx: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.valor), 1);
  const H = 110;
  const step = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)" }}>{title}</div>
        <div className="text-muted" style={{ fontSize: 10 }}>máx {fmt(max)}</div>
      </div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: H,
            borderBottom: "1px solid var(--border-tertiary)",
          }}
        >
          {points.map((p, i) => (
            <div
              key={p.semana}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default", minWidth: 3 }}
            >
              <div
                style={{
                  width: "100%",
                  height: p.valor === 0 ? 0 : Math.max(3, (p.valor / max) * H),
                  background: color,
                  borderRadius: "4px 4px 0 0",
                  opacity: hover === null || hover === i ? 1 : 0.4,
                  transition: "opacity 0.1s",
                }}
              />
            </div>
          ))}
        </div>
        {/* Semana del evento */}
        {markerIdx >= 0 && points[markerIdx] && (
          <div
            title={`Evento (semana del ${fmtSemana(points[markerIdx].semana)})`}
            style={{
              position: "absolute",
              top: -2,
              bottom: 0,
              left: `${((markerIdx + 0.5) / points.length) * 100}%`,
              borderLeft: "2px dashed var(--fg-quaternary)",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -4,
                left: 4,
                fontSize: 9,
                fontWeight: 600,
                color: "var(--fg-quaternary)",
                whiteSpace: "nowrap",
              }}
            >
              evento
            </span>
          </div>
        )}
        {hover !== null && (
          <div
            style={{
              position: "absolute",
              bottom: H + 6,
              left: `${((hover + 0.5) / points.length) * 100}%`,
              transform: "translateX(-50%)",
              background: "var(--fg-primary)",
              color: "var(--bg-primary)",
              padding: "4px 8px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {fmtSemana(points[hover].semana)} · {fmt(points[hover].valor)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", marginTop: 4 }}>
        {points.map((p, i) => (
          <div key={p.semana} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            {i % step === 0 && (
              <span className="text-muted" style={{ fontSize: 9, whiteSpace: "nowrap" }}>
                {fmtSemana(p.semana)}
              </span>
            )}
          </div>
        ))}
      </div>
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

const thRight: React.CSSProperties = { ...thStyle, textAlign: "right" };

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "middle",
};

const tdRight: React.CSSProperties = { ...tdStyle, textAlign: "right" };
