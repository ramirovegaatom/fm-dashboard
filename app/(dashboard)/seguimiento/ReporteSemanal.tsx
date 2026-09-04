"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CohorteEntrega, WonByCloseDate } from "@/lib/supabase";
import { MetricInfo } from "@/components/MetricInfo";
import { attioCompanyUrl, attioDealUrl } from "@/lib/attio";
import { formatCurrency } from "@/lib/format";

// Reporte semanal de gestión (pedido José + Cande 2026-08-26; v2 José 2026-09-03).
// Vive ARRIBA de la pestaña "Estado actual" (Seguimiento), ANTES de los filtros del pipeline:
// José pidió que el filtro de campañas quede "post resumen semanal, al inicio del pipeline",
// así que este reporte NO usa los filtros de campaña/BDR/fechas de la pestaña — tiene los suyos:
// región (Cono Norte / Cono Sur / Brasil) y período (H1, H2, Q1–Q4, Total).
// Eje (José 2026-09-03): la semana de una empresa es la de la FECHA DEL ÚLTIMO EVENTO/CAMPAÑA
// al que está taggeada — "Entregadas" no considera ningún atributo adicional (antes era la
// fecha de entrada a PRE-QM, que es de la empresa y no del evento). Las métricas son el estado
// ACTUAL de cada cohorte según el Outbound Stage: Attio no guarda historia de stage.
// Estados del reporte (José 2026-09-03): Entregadas, Procesando, Procesadas, QMs agendadas,
// Descalificadas y Negocios ganados. "Por procesar" y "Otros" (Recycle/Lost) NO se muestran —
// siguen dentro de Entregadas. Se agregan las conversiones de la semana (% entre etapas).
// Los Wons van por FECHA DE CIERRE del deal, sin upgrades (Upgrade / Add On excluidos en la vista:
// por el checkbox de Attio o, como el checkbox casi no se usa, por el nombre del deal —
// upgrade / upsell / renovación / add on / ampliación; feedback José 2026-09-04).
// QMs agendadas = QM AGENDADA / QM SHOW / QM NO SHOW. El stage Cliente NO cuenta (José 2026-09-04:
// "si es cliente no debería contar en ese apartado QM") — va a "otros", dentro de Entregadas.

const FILAS_POR_PAGINA = 10;
const SPARK_SEMANAS = 10;

type EtapaKey = CohorteEntrega["etapa_reporte"];
type MetricKey = "entregadas" | "procesando" | "procesada" | "qm" | "descartada" | "wons";
type Region = "todos" | "Norte" | "Sur" | "Brasil";
type Periodo = "total" | "H1" | "H2" | "Q1" | "Q2" | "Q3" | "Q4";

const REGIONES: { key: Region; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "Norte", label: "Cono Norte" },
  { key: "Sur", label: "Cono Sur" },
  { key: "Brasil", label: "Brasil" },
];
const REGION_LABEL: Record<string, string> = { Norte: "Cono Norte", Sur: "Cono Sur", Brasil: "Brasil" };
const PERIODOS: Periodo[] = ["total", "H1", "H2", "Q1", "Q2", "Q3", "Q4"];

type MetricDef = {
  key: MetricKey;
  label: string;
  color: string;
  tag: string;
  lineage: string;
  criterios: [string, string][];
  disclaimer?: string;
};

const METRICAS: MetricDef[] = [
  {
    key: "entregadas",
    label: "Entregadas",
    color: "var(--fg-primary)",
    tag: "Base de la semana",
    lineage: "cohorte_entregadas",
    criterios: [
      ["Campaña/Evento", "Sí (empresa taggeada a un evento)"],
      ["Semana", "La de la fecha del ÚLTIMO evento/campaña de la empresa (lunes a domingo)"],
    ],
    disclaimer: "Ningún otro atributo filtra (José 2026-09-03). Una empresa cuenta una sola vez aunque tenga varios tags: cae en la semana de su evento más reciente. Las que siguen sin procesar o quedaron en Recycle/Lost están dentro de Entregadas pero no tienen tarjeta propia.",
  },
  {
    key: "procesando",
    label: "Procesando",
    color: "var(--fg-status-info)",
    tag: "En gestión",
    lineage: "cohorte_procesando",
    criterios: [["Outbound Stage", "Procesando (también Con contacto)"]],
    disclaimer: "Se marca aparte cuántas figuran Procesando sin ninguna llamada ni WhatsApp registrado.",
  },
  {
    key: "procesada",
    label: "Procesadas",
    color: "var(--fg-secondary)",
    tag: "Circuito terminado",
    lineage: "cohorte_procesadas",
    criterios: [["Outbound Stage", "Procesada"]],
    disclaimer: "Terminaron el circuito sin respuesta positiva. Las que llegaron a QM cuentan en QMs agendadas.",
  },
  {
    key: "qm",
    label: "QMs agendadas",
    color: "var(--fg-status-success)",
    tag: "Respuesta positiva",
    lineage: "cohorte_qm",
    criterios: [["Outbound Stage", "QM AGENDADA, QM SHOW o QM NO SHOW"]],
    disclaimer: "Cuenta la QM aunque la reunión ya haya ocurrido (SHOW / NO SHOW), así no desaparece del reporte. Las empresas en stage Cliente no cuentan como QM (José 2026-09-04): quedan dentro de Entregadas, sin tarjeta propia.",
  },
  {
    key: "descartada",
    label: "Descalificadas",
    color: "var(--fg-status-warning)",
    tag: "No calificadas",
    lineage: "cohorte_descartadas",
    criterios: [["Outbound Stage", "Descalificada"]],
    disclaimer: "Recycle y Lost no cuentan como descalificadas.",
  },
  {
    key: "wons",
    label: "Negocios ganados",
    color: "var(--fg-status-brand)",
    tag: "Cierre en la semana",
    lineage: "cohorte_wons",
    criterios: [
      ["Deal stage", "Won 🎉"],
      ["Campaña/Evento del deal", "No vacío"],
      ["Upgrade / Add On", "No — por el checkbox de Attio o porque el nombre del deal dice upgrade / upsell / renovación / add on / ampliación"],
      ["Semana", "Fecha de cierre del deal (close_date)"],
    ],
    disclaimer: "Se ubican por fecha de cierre del deal, no por la semana del evento de la empresa. Los upgrades y renovaciones de clientes existentes no son wins de evento: se excluyen por el checkbox Upgrade / Add On de Attio y, como casi nadie lo marca, también por el nombre del deal. Los deals de evento sin campaña atribuida (cola de revisión en Deals) no cuentan hasta atribuirse.",
  },
];

type Semana = {
  semana: string; // lunes YYYY-MM-DD
  rows: CohorteEntrega[];
  counts: Record<EtapaKey, number>;
  entregadas: number;
  procSinActividad: number;
  wons: WonByCloseDate[];
  mrr: number;
};

type Conversion = { key: string; label: string; detalle: string; num: (s: Semana) => number; den: (s: Semana) => number };

// "Procesadas" en las conversiones = terminaron el procesamiento (Procesadas + QMs + Descalificadas).
const terminadas = (s: Semana) => s.counts.procesada + s.counts.qm + s.counts.descartada;
const CONVERSIONES: Conversion[] = [
  { key: "c_proc", label: "% Entregadas → Procesadas", detalle: "terminaron el circuito (Procesadas + QMs + Descalificadas) sobre Entregadas", num: terminadas, den: (s) => s.entregadas },
  { key: "c_qm", label: "% Procesadas → QM agendadas", detalle: "QMs agendadas sobre las que terminaron el circuito", num: (s) => s.counts.qm, den: terminadas },
  { key: "c_won", label: "% QM agendadas → Won", detalle: "negocios ganados (por cierre en la semana) sobre QMs agendadas", num: (s) => s.wons.length, den: (s) => s.counts.qm },
];

function mondayOf(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function isoAddDays(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function fmtDia(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" });
}
function fmtRango(semana: string) {
  return `${fmtDia(semana)} – ${fmtDia(isoAddDays(semana, 6))}`;
}
function fmtFecha(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
function pct(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}
function fmtPct(v: number | null) {
  return v === null ? "—" : `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}
// Rango [desde, hasta] (YYYY-MM-DD) del período dentro del año de "hoy".
function rangoPeriodo(p: Periodo, year: number): [string, string] | null {
  const y = String(year);
  switch (p) {
    case "total": return null;
    case "H1": return [`${y}-01-01`, `${y}-06-30`];
    case "H2": return [`${y}-07-01`, `${y}-12-31`];
    case "Q1": return [`${y}-01-01`, `${y}-03-31`];
    case "Q2": return [`${y}-04-01`, `${y}-06-30`];
    case "Q3": return [`${y}-07-01`, `${y}-09-30`];
    case "Q4": return [`${y}-10-01`, `${y}-12-31`];
  }
}

export function ReporteSemanal({
  cohortes,
  wons,
  hoy,
}: {
  cohortes: CohorteEntrega[];
  wons: WonByCloseDate[];
  hoy: string; // YYYY-MM-DD en hora Argentina (viene del server)
}) {
  const semanaActual = useMemo(() => mondayOf(hoy), [hoy]);
  const year = Number(hoy.slice(0, 4));

  const [region, setRegion] = useState<Region>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("total");

  // Filtro de región: territorio del ÚLTIMO evento de la empresa; los deals, del evento del deal.
  const porRegion = useMemo(
    () => (region === "todos" ? cohortes : cohortes.filter((c) => c.territorio === region)),
    [cohortes, region]
  );
  const sinRegion = useMemo(() => (region === "todos" ? 0 : cohortes.filter((c) => !c.territorio).length), [cohortes, region]);
  const sinFecha = useMemo(() => porRegion.filter((c) => !c.semana_entrega).length, [porRegion]);
  const wonsFiltrados = useMemo(
    () => wons.filter((w) => w.close_date && w.close_date.slice(0, 10) <= hoy && (region === "todos" || w.territorio === region)),
    [wons, region, hoy]
  );

  // Todas las semanas desde el primer evento hasta la actual (o el último evento, si es futuro),
  // incluyendo semanas sin entrega — ahí igual pueden caer wons por cierre.
  const semanasAll = useMemo<Semana[]>(() => {
    const byWeek = new Map<string, CohorteEntrega[]>();
    for (const c of porRegion) {
      if (!c.semana_entrega) continue;
      const list = byWeek.get(c.semana_entrega) ?? [];
      list.push(c);
      byWeek.set(c.semana_entrega, list);
    }
    const wonsByWeek = new Map<string, WonByCloseDate[]>();
    for (const w of wonsFiltrados) {
      const k = mondayOf(w.close_date.slice(0, 10));
      const list = wonsByWeek.get(k) ?? [];
      list.push(w);
      wonsByWeek.set(k, list);
    }
    const keys = [...byWeek.keys()].sort();
    if (!keys.length) return [];
    const out: Semana[] = [];
    let cursor = keys[0];
    const fin = keys[keys.length - 1] > semanaActual ? keys[keys.length - 1] : semanaActual;
    while (cursor <= fin) {
      const rows = byWeek.get(cursor) ?? [];
      const counts: Record<EtapaKey, number> = { por_procesar: 0, procesando: 0, procesada: 0, qm: 0, descartada: 0, otros: 0 };
      let procSinActividad = 0;
      for (const r of rows) {
        counts[r.etapa_reporte]++;
        if (r.etapa_reporte === "procesando" && r.actividades === 0) procSinActividad++;
      }
      const ws = wonsByWeek.get(cursor) ?? [];
      out.push({
        semana: cursor,
        rows,
        counts,
        entregadas: rows.length,
        procSinActividad,
        wons: ws,
        mrr: ws.reduce((acc, w) => acc + Number(w.value_amount ?? 0), 0),
      });
      cursor = isoAddDays(cursor, 7);
    }
    return out;
  }, [porRegion, wonsFiltrados, semanaActual]);

  // Período (H1/H2/Qn del año en curso): se quedan las semanas que se solapan con el rango.
  const semanas = useMemo(() => {
    const r = rangoPeriodo(periodo, year);
    if (!r) return semanasAll;
    return semanasAll.filter((s) => isoAddDays(s.semana, 6) >= r[0] && s.semana <= r[1]);
  }, [semanasAll, periodo, year]);
  const prevMap = useMemo(() => {
    const m = new Map<string, Semana>();
    for (let i = 1; i < semanasAll.length; i++) m.set(semanasAll[i].semana, semanasAll[i - 1]);
    return m;
  }, [semanasAll]);

  // Default: la última semana CON entrega (la actual suele estar vacía o a medio cargar).
  const defaultIdx = useMemo(() => {
    for (let i = semanas.length - 1; i >= 0; i--) if (semanas[i].entregadas > 0) return i;
    return semanas.length - 1;
  }, [semanas]);
  const [weekIdxSel, setWeekIdx] = useState<number | null>(null);
  const weekIdx = weekIdxSel !== null && weekIdxSel < semanas.length ? weekIdxSel : defaultIdx;
  const [metric, setMetric] = useState<MetricKey>("entregadas");
  const [pagina, setPagina] = useState(0);
  // Series visibles en "Evolución semanal" (José 2026-09-03: elegir cuáles métricas se ven).
  const [visibles, setVisibles] = useState<Set<MetricKey>>(() => new Set(METRICAS.map((m) => m.key)));
  const pillsRef = useRef<HTMLDivElement>(null);

  // Pills: arrancan scrolleadas al final (las semanas recientes).
  useEffect(() => {
    const el = pillsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [semanas.length]);

  const w = semanas[weekIdx];
  const prev = w ? prevMap.get(w.semana) ?? null : null;

  function valor(s: Semana, k: MetricKey): number {
    if (k === "entregadas") return s.entregadas;
    if (k === "wons") return s.wons.length;
    return s.counts[k];
  }
  function delta(k: MetricKey): number | null {
    if (!w || !prev) return null;
    return valor(w, k) - valor(prev, k);
  }

  const metricDef = METRICAS.find((m) => m.key === metric)!;

  // Empresas (o deals) de la métrica seleccionada en la semana seleccionada.
  const detalle = useMemo(() => {
    if (!w) return [] as CohorteEntrega[];
    const list = metric === "entregadas" || metric === "wons" ? w.rows : w.rows.filter((r) => r.etapa_reporte === metric);
    return [...list].sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? ""));
  }, [w, metric]);
  const detallePagina = detalle.slice(pagina * FILAS_POR_PAGINA, (pagina + 1) * FILAS_POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(detalle.length / FILAS_POR_PAGINA));

  function pickWeek(i: number) { setWeekIdx(i); setPagina(0); }
  function pickMetric(k: MetricKey) { setMetric(k); setPagina(0); }
  function pickRegion(r: Region) { setRegion(r); setWeekIdx(null); setPagina(0); }
  function pickPeriodo(p: Periodo) { setPeriodo(p); setWeekIdx(null); setPagina(0); }
  function toggleSerie(k: MetricKey) {
    setVisibles((cur) => {
      const next = new Set(cur);
      if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
      return next;
    });
  }

  const filtros = (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
      <PillGroup
        items={REGIONES.map((r) => ({ key: r.key, label: r.label }))}
        active={region}
        onPick={(k) => pickRegion(k as Region)}
        title="Región del último evento de la empresa (y del evento del deal para los negocios ganados)"
      />
      <PillGroup
        items={PERIODOS.map((p) => ({ key: p, label: p === "total" ? "Total" : `${p} ${year}` }))}
        active={periodo}
        onPick={(k) => pickPeriodo(k as Periodo)}
        title="Período: semanas cuyo evento cae en el rango (año en curso)"
        compact
      />
    </div>
  );

  if (!semanas.length || !w) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 6 }}>Reporte semanal de gestión</div>
        {filtros}
        <div className="text-muted" style={{ fontSize: 12 }}>
          Sin empresas taggeadas a eventos con fecha para esta selección
          {region !== "todos" ? ` en ${REGION_LABEL[region]}` : ""}{periodo !== "total" ? ` · ${periodo} ${year}` : ""}.
        </div>
      </div>
    );
  }

  const enCurso = w.semana === semanaActual;
  const series = METRICAS.filter((m) => visibles.has(m.key));

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>Reporte semanal de gestión</div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            Cómo está HOY cada entrega semanal (semana = fecha del <strong>último evento/campaña</strong> de la empresa). Los negocios ganados van por fecha de cierre, sin upgrades.
          </div>
        </div>
        <div className="text-muted" style={{ fontSize: 11, textAlign: "right" }}>
          Hoy: {fmtFecha(hoy)} · Datos: Attio
        </div>
      </div>

      {/* Filtros propios: región + período */}
      {filtros}

      {/* Semanas */}
      <div ref={pillsRef} style={{ display: "flex", gap: 6, overflowX: "auto", padding: "6px 8px 6px 0", marginBottom: 8 }}>
        {semanas.map((s, i) => {
          const active = i === weekIdx;
          return (
            <button
              key={s.semana}
              onClick={() => pickWeek(i)}
              title={s.entregadas > 0 ? `${s.entregadas} empresas entregadas` : "Sin entrega esta semana"}
              style={{
                flexShrink: 0,
                padding: "5px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--fg-primary)" : "var(--border-tertiary)"}`,
                background: active ? "var(--fg-primary)" : "var(--bg-primary)",
                color: active ? "var(--bg-primary)" : s.entregadas > 0 ? "var(--fg-secondary)" : "var(--fg-quaternary)",
              }}
            >
              {fmtRango(s.semana)}
              {s.entregadas > 0 && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, opacity: 0.75 }}>{s.entregadas}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Chip de entrega + avisos de cobertura */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {w.entregadas > 0 ? (
          <span className="badge" style={{ background: "var(--bg-status-info)", color: "var(--fg-status-info)", fontSize: 11 }}>
            📦 Entrega: <strong style={{ margin: "0 4px" }}>{w.entregadas} empresas</strong> — {fmtRango(w.semana)}
            {enCurso ? " · semana en curso" : ""}
            {region !== "todos" ? ` · ${REGION_LABEL[region]}` : ""}
          </span>
        ) : (
          <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-quaternary)", fontSize: 11 }}>
            Sin entrega esta semana — el procesamiento de las anteriores continúa
          </span>
        )}
        {sinFecha > 0 && (
          <span
            className="badge"
            style={{ background: "var(--bg-status-warning)", color: "var(--fg-status-warning)", fontSize: 11 }}
            title="Empresas taggeadas a campañas sin fecha de evento mapeada ni fecha en el nombre de la campaña. No tienen semana y no cuentan en el reporte."
          >
            ⚠ {sinFecha} empresa{sinFecha === 1 ? "" : "s"} sin fecha de evento — no entran
          </span>
        )}
        {sinRegion > 0 && (
          <span
            className="badge"
            style={{ background: "var(--bg-secondary)", color: "var(--fg-quaternary)", fontSize: 11 }}
            title="Empresas cuyo evento no tiene país ni territorio cargado (webinars sin país, etc.). Solo se ven con “Todos”. Se corrige cargando el país del evento en Calendario / Third party."
          >
            {sinRegion} empresa{sinRegion === 1 ? "" : "s"} sin región — solo en “Todos”
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 10 }}>
        {METRICAS.map((m) => {
          const val = valor(w, m.key);
          const d = delta(m.key);
          const selected = m.key === metric;
          const dim = m.key !== "wons" && w.entregadas === 0;
          const sparkFrom = Math.max(0, semanas.length - SPARK_SEMANAS);
          const serie = semanas.slice(sparkFrom).map((s) => valor(s, m.key));
          const sub =
            m.key === "procesando" && w.procSinActividad > 0 ? `${w.procSinActividad} sin actividad registrada`
            : m.key === "wons" && w.mrr > 0 ? formatCurrency(w.mrr)
            : m.key !== "entregadas" && m.key !== "wons" && w.entregadas > 0 && val > 0 ? `${fmtPct(pct(val, w.entregadas))} de entregadas`
            : null;
          return (
            <button
              key={m.key}
              onClick={() => pickMetric(m.key)}
              className="card"
              style={{
                textAlign: "left",
                cursor: "pointer",
                padding: "12px 14px",
                border: `1.5px solid ${selected ? m.color : "var(--border-tertiary)"}`,
                background: selected ? "var(--bg-secondary)" : "var(--bg-primary)",
                opacity: dim ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, display: "inline-block", flexShrink: 0 }} />
                <span className="text-muted" style={{ fontSize: 10, lineHeight: 1.3 }}>{m.label}</span>
                <MetricInfo metricKey={m.lineage} size={11} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--fg-primary)" }}>
                    {val || "—"}
                  </div>
                  {d !== null && (
                    <div style={{ fontSize: 10, marginTop: 3, color: d > 0 ? "var(--fg-status-success)" : d < 0 ? "var(--fg-status-error)" : "var(--fg-quaternary)" }}>
                      {d > 0 ? `↑ ${d}` : d < 0 ? `↓ ${Math.abs(d)}` : "= igual"} <span className="text-muted">vs sem. anterior</span>
                    </div>
                  )}
                  {sub && <div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>{sub}</div>}
                </div>
                <Sparkline values={serie} color={m.color} highlightIdx={weekIdx - sparkFrom} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Conversión de la semana (José 2026-09-03) */}
      <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Conversión · {fmtRango(w.semana)}{enCurso ? " (semana en curso)" : ""}</span>
          <span className="text-muted" style={{ fontSize: 10 }}>
            estado actual de la entrega de la semana; “Procesadas” acá = terminaron el circuito (Procesadas + QMs + Descalificadas)
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
          {CONVERSIONES.map((c) => {
            const v = pct(c.num(w), c.den(w));
            const pv = prev ? pct(c.num(prev), c.den(prev)) : null;
            const dpp = v !== null && pv !== null ? Math.round((v - pv) * 10) / 10 : null;
            return (
              <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 2 }} title={c.detalle}>
                <span className="text-muted" style={{ fontSize: 10, fontStyle: "italic" }}>{c.label}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: v === null ? "var(--fg-quaternary)" : "var(--fg-primary)" }}>
                  {fmtPct(v)}
                  <span className="text-muted" style={{ fontSize: 10, fontWeight: 500, marginLeft: 6 }}>{c.num(w)} / {c.den(w)}</span>
                </span>
                {dpp !== null && (
                  <span style={{ fontSize: 10, color: dpp > 0 ? "var(--fg-status-success)" : dpp < 0 ? "var(--fg-status-error)" : "var(--fg-quaternary)" }}>
                    {dpp > 0 ? `↑ ${dpp}` : dpp < 0 ? `↓ ${Math.abs(dpp)}` : "="} pp <span className="text-muted">vs sem. anterior</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Criterios de la métrica seleccionada */}
      <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${metricDef.color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Criterios — {metricDef.label}</span>
          <span className="badge" style={{ marginLeft: "auto", background: "var(--bg-secondary)", color: "var(--fg-secondary)", fontSize: 11 }}>
            {metric === "wons" ? `${w.wons.length} deal${w.wons.length === 1 ? "" : "s"}` : `${valor(w, metric)} empresa${valor(w, metric) === 1 ? "" : "s"}`}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 16px", fontSize: 12 }}>
          {metricDef.criterios.map(([k, v]) => (
            <Criterio key={k} k={k} v={v} />
          ))}
        </div>
        {metricDef.disclaimer && (
          <div className="text-muted" style={{ fontSize: 11, borderTop: "1px solid var(--border-tertiary)", paddingTop: 8, marginTop: 10, lineHeight: 1.5 }}>
            {metricDef.disclaimer}
          </div>
        )}

        {/* Detalle: empresas o deals */}
        <div style={{ borderTop: "1px solid var(--border-tertiary)", paddingTop: 10, marginTop: 10 }}>
          {metric === "wons" ? (
            w.wons.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 12 }}>Sin negocios ganados con campaña en la semana del {fmtRango(w.semana)}.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Deal", "Empresa", "Campaña", "Región", "Cierre", "MRR"].map((h) => (
                      <th key={h} className="text-muted" style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.wons.map((d) => (
                    <tr key={d.attio_deal_id} style={{ borderTop: "1px solid var(--border-tertiary)" }}>
                      <td style={tdStyle}>
                        <a href={attioDealUrl(d.attio_deal_id)} target="_blank" rel="noreferrer" style={{ color: "var(--fg-status-brand)", textDecoration: "none", fontWeight: 600 }}>
                          {d.deal_name ?? d.attio_deal_id} ↗
                        </a>
                      </td>
                      <td style={tdStyle}>{d.company_name ?? "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{d.campana_evento ?? "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{d.territorio ? REGION_LABEL[d.territorio] ?? d.territorio : "—"}</td>
                      <td style={tdStyle}>{fmtFecha(d.close_date.slice(0, 10))}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "var(--fg-status-success)" }}>{formatCurrency(Number(d.value_amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : detalle.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12 }}>Sin empresas en esta métrica para la semana del {fmtRango(w.semana)}.</div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Empresa", "Campaña (último evento)", "Evento", "Región", "Stage", "BDR", "Act."].map((h) => (
                      <th key={h} className="text-muted" style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detallePagina.map((c) => {
                    const url = attioCompanyUrl(c.attio_company_id);
                    const otras = c.campanas.filter((k) => k !== c.campana_ultima);
                    return (
                      <tr key={c.attio_company_id} style={{ borderTop: "1px solid var(--border-tertiary)" }}>
                        <td style={tdStyle}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--fg-primary)", textDecoration: "none", fontWeight: 600 }}>
                              {c.company_name ?? c.attio_company_id} ↗
                            </a>
                          ) : (c.company_name ?? c.attio_company_id)}
                        </td>
                        <td
                          style={{ ...tdStyle, color: "var(--fg-secondary)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={otras.length ? `También taggeada a: ${otras.join(", ")}` : c.campana_ultima ?? ""}
                        >
                          {c.campana_ultima ?? "—"}
                          {otras.length > 0 && <span className="text-muted" style={{ fontSize: 10, marginLeft: 4 }}>+{otras.length}</span>}
                        </td>
                        <td style={tdStyle} title={c.fecha_origen === "nombre" ? "Fecha tomada del nombre de la campaña (el evento no tiene fecha mapeada)" : undefined}>
                          {c.evento_fecha ? fmtDia(c.evento_fecha) : "—"}
                          {c.fecha_origen === "nombre" && <span className="text-muted" style={{ fontSize: 10, marginLeft: 3 }}>≈</span>}
                        </td>
                        <td style={{ ...tdStyle, color: c.territorio ? "var(--fg-secondary)" : "var(--fg-quaternary)" }} title={c.territorio_origen && c.territorio_origen !== "evento" ? `Región inferida por ${c.territorio_origen === "pais" ? "el país del evento" : "el nombre de la campaña"}` : undefined}>
                          {c.territorio ? REGION_LABEL[c.territorio] ?? c.territorio : "—"}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: METRICAS.find((m) => m.key === c.etapa_reporte)?.color ?? "var(--fg-quaternary)", fontWeight: 600 }}>{c.outbound_stage ?? "—"}</span>
                        </td>
                        <td style={{ ...tdStyle, color: c.assigned_bdr_name ? "inherit" : "var(--fg-status-warning)" }}>{c.assigned_bdr_name ?? "Sin BDR"}</td>
                        <td style={{ ...tdStyle, color: c.actividades === 0 ? "var(--fg-status-error)" : "inherit" }}>{c.actividades}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPaginas > 1 && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11 }}>
                  <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} style={pagBtnStyle(pagina === 0)}>←</button>
                  <span className="text-muted">{pagina + 1} / {totalPaginas} · {detalle.length} empresas</span>
                  <button onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1} style={pagBtnStyle(pagina >= totalPaginas - 1)}>→</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Evolución semanal: pills para elegir qué series se ven (José 2026-09-03) */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Evolución semanal</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} title="Click para mostrar u ocultar cada métrica">
            {METRICAS.map((m) => {
              const on = visibles.has(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleSerie(m.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 999, fontSize: 10, cursor: "pointer",
                    border: `1px solid ${on ? m.color : "var(--border-tertiary)"}`,
                    background: on ? m.color : "var(--bg-primary)",
                    color: on ? "var(--bg-primary)" : "var(--fg-quaternary)",
                    fontWeight: m.key === metric ? 700 : 500,
                    opacity: on ? 1 : 0.8,
                  }}
                >
                  {!on && <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, display: "inline-block" }} />}
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <EvolucionChart semanas={semanas} weekIdx={weekIdx} metric={metric} series={series} valor={valor} onPick={pickWeek} />
      </div>

      {/* Resumen de la semana */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-tertiary)" }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Resumen de la semana · {fmtRango(w.semana)}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                {["Métrica", "Empresas", "% de entregadas", "vs semana anterior", "Estado"].map((h) => (
                  <th key={h} className="text-muted" style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICAS.map((m) => {
                const val = valor(w, m.key);
                const d = delta(m.key);
                const p = m.key === "entregadas" || m.key === "wons" ? null : pct(val, w.entregadas);
                return (
                  <tr
                    key={m.key}
                    onClick={() => pickMetric(m.key)}
                    style={{ cursor: "pointer", borderTop: "1px solid var(--border-tertiary)", background: m.key === metric ? "var(--bg-secondary)" : "transparent" }}
                  >
                    <td style={tdStyle}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, display: "inline-block" }} />
                        {m.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {val || "—"}
                      {m.key === "wons" && w.mrr > 0 && <span className="text-muted" style={{ fontWeight: 500, marginLeft: 6 }}>{formatCurrency(w.mrr)}</span>}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{p !== null && val ? fmtPct(p) : "—"}</td>
                    <td style={tdStyle}>
                      {d === null ? <span className="text-muted">—</span>
                        : d > 0 ? <span style={{ color: "var(--fg-status-success)" }}>↑ {d}</span>
                        : d < 0 ? <span style={{ color: "var(--fg-status-error)" }}>↓ {Math.abs(d)}</span>
                        : <span className="text-muted">= igual</span>}
                    </td>
                    <td style={tdStyle}>
                      <span className="badge" style={{ background: "var(--bg-secondary)", color: m.color, fontSize: 10 }}>{m.tag}</span>
                    </td>
                  </tr>
                );
              })}
              {CONVERSIONES.map((c) => {
                const v = pct(c.num(w), c.den(w));
                const pv = prev ? pct(c.num(prev), c.den(prev)) : null;
                const dpp = v !== null && pv !== null ? Math.round((v - pv) * 10) / 10 : null;
                return (
                  <tr key={c.key} style={{ borderTop: "1px solid var(--border-tertiary)", fontStyle: "italic", color: "var(--fg-secondary)" }} title={c.detalle}>
                    <td style={{ ...tdStyle, paddingLeft: 24 }}>{c.label}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtPct(v)}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>{c.num(w)} / {c.den(w)}</td>
                    <td style={tdStyle}>
                      {dpp === null ? <span className="text-muted">—</span>
                        : dpp > 0 ? <span style={{ color: "var(--fg-status-success)" }}>↑ {dpp} pp</span>
                        : dpp < 0 ? <span style={{ color: "var(--fg-status-error)" }}>↓ {Math.abs(dpp)} pp</span>
                        : <span className="text-muted">= igual</span>}
                    </td>
                    <td style={tdStyle}>
                      <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)", fontSize: 10 }}>Conversión</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-muted" style={{ fontSize: 10, padding: "8px 14px", lineHeight: 1.5 }}>
          Cada empresa cuenta UNA vez y cae en la semana de la fecha de su <strong>último evento/campaña</strong> (si el evento no tiene
          fecha mapeada se toma la fecha del nombre de la campaña, marcada con ≈). Su estado es el Outbound Stage actual en Attio; las que
          siguen sin procesar o quedaron en Recycle/Lost están dentro de Entregadas pero no tienen fila propia, por eso las etapas no suman
          Entregadas. Los filtros de campaña, BDR y fechas del pipeline de abajo <strong>no</strong> afectan este reporte — solo región y período.
          Las empresas en stage Cliente no cuentan como QM. Los negocios ganados van por fecha de cierre y excluyen upgrades y renovaciones (checkbox Upgrade / Add On de Attio o nombre del deal). Click en una métrica para ver sus empresas.
        </div>
      </div>
    </div>
  );
}

function PillGroup({ items, active, onPick, title, compact }: {
  items: { key: string; label: string }[]; active: string; onPick: (k: string) => void; title?: string; compact?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }} title={title}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            onClick={() => onPick(it.key)}
            style={{
              padding: compact ? "4px 10px" : "5px 12px",
              borderRadius: 999,
              fontSize: compact ? 11 : 12,
              fontWeight: on ? 700 : 500,
              cursor: "pointer",
              border: `1px solid ${on ? "var(--fg-primary)" : "var(--border-tertiary)"}`,
              background: on ? "var(--fg-primary)" : "var(--bg-primary)",
              color: on ? "var(--bg-primary)" : "var(--fg-secondary)",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function Criterio({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-muted">{k}</span>
      <span style={{ fontWeight: 600 }}>{v}</span>
    </>
  );
}

// Mini serie de las últimas semanas (SVG puro): el punto grande es la semana seleccionada.
function Sparkline({ values, color, highlightIdx }: { values: number[]; color: string; highlightIdx: number }) {
  const W = 56, H = 24, pad = 3;
  if (values.length < 2) return <svg width={W} height={H} />;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), H - pad - ((v - min) / range) * (H - pad * 2)] as const);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" opacity={0.35} />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === highlightIdx ? 3.5 : 2} fill={i === highlightIdx ? color : "var(--bg-primary)"} stroke={color} strokeWidth={i === highlightIdx ? 1.5 : 1} />
      ))}
    </svg>
  );
}

// Líneas por métrica sobre las mismas semanas (misma unidad: empresas / deals). Solo se dibujan
// las series visibles (pills); la métrica seleccionada va resaltada; click en una semana la selecciona.
function EvolucionChart({
  semanas,
  weekIdx,
  metric,
  series,
  valor,
  onPick,
}: {
  semanas: Semana[];
  weekIdx: number;
  metric: MetricKey;
  series: MetricDef[];
  valor: (s: Semana, k: MetricKey) => number;
  onPick: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 190, padL = 34, padR = 12, padT = 10, padB = 26;
  const cw = W - padL - padR, ch = H - padT - padB;
  const maxV = Math.max(1, ...semanas.flatMap((s) => series.map((m) => valor(s, m.key)))) * 1.1;
  const x = (i: number) => padL + (semanas.length > 1 ? (i / (semanas.length - 1)) * cw : cw / 2);
  const y = (v: number) => padT + ch - (v / maxV) * ch;
  const step = Math.max(1, Math.ceil(semanas.length / 8));
  const focus = hover ?? weekIdx;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Evolución semanal por métrica">
        {[0, 1, 2, 3, 4].map((g) => {
          const v = (maxV / 4) * g;
          return (
            <g key={g}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border-tertiary)" strokeWidth={0.5} />
              <text x={padL - 4} y={y(v) + 3} fontSize={9} textAnchor="end" fill="var(--fg-quaternary)">{Math.round(v)}</text>
            </g>
          );
        })}
        {semanas.map((s, i) => (
          <g key={s.semana}>
            {i === weekIdx && <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + ch} stroke="var(--fg-quaternary)" strokeWidth={1} strokeDasharray="3 3" />}
            {i % step === 0 || i === weekIdx ? (
              <text x={x(i)} y={H - 8} fontSize={9} textAnchor="middle" fontWeight={i === weekIdx ? 700 : 400} fill={i === weekIdx ? "var(--fg-primary)" : "var(--fg-quaternary)"}>
                {fmtDia(s.semana)}
              </text>
            ) : null}
          </g>
        ))}
        {series.map((m) => {
          const sel = m.key === metric;
          const d = semanas.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(valor(s, m.key)).toFixed(1)}`).join(" ");
          return (
            <g key={m.key} opacity={sel || series.length === 1 ? 1 : 0.5}>
              <path d={d} fill="none" stroke={m.color} strokeWidth={sel ? 2.5 : 1.25} strokeDasharray={m.key === "wons" ? "4 3" : undefined} strokeLinejoin="round" />
              {semanas.map((s, i) => (
                <circle key={s.semana} cx={x(i)} cy={y(valor(s, m.key))} r={i === focus ? (sel ? 5 : 3.5) : sel ? 3 : 2} fill={i === focus ? m.color : "var(--bg-primary)"} stroke={m.color} strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
        {/* Zonas clickeables por semana */}
        {semanas.map((s, i) => {
          const half = semanas.length > 1 ? cw / (semanas.length - 1) / 2 : cw / 2;
          return (
            <rect
              key={s.semana}
              x={x(i) - half} y={padT} width={half * 2} height={ch}
              fill="transparent" style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick(i)}
            />
          );
        })}
      </svg>
      {hover !== null && semanas[hover] && (
        <div
          style={{
            position: "absolute", top: 0, left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)",
            background: "var(--fg-primary)", color: "var(--bg-primary)", padding: "6px 10px", borderRadius: 6,
            fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10, lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700 }}>{fmtRango(semanas[hover].semana)}</div>
          {series.map((m) => (
            <div key={m.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: m.key === metric ? 1 : 0.8 }}>
              <span>{m.label}</span>
              <span style={{ fontWeight: 700 }}>{valor(semanas[hover], m.key)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "7px 10px", verticalAlign: "middle" };
const pagBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "2px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-primary)",
  color: disabled ? "var(--fg-quaternary)" : "var(--fg-primary)",
  cursor: disabled ? "default" : "pointer",
});
