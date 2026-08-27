"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CohorteEntrega, WonByCloseDate } from "@/lib/supabase";
import { MetricInfo } from "@/components/MetricInfo";
import { attioCompanyUrl, attioDealUrl } from "@/lib/attio";
import { formatCurrency } from "@/lib/format";
import { SIN_BDR } from "./shared";

// Reporte semanal de gestión (pedido José + Cande 2026-08-26, diseño a partir de su mock).
// Vive ARRIBA de la pestaña "Estado actual" (Seguimiento) — pedido explícito; primero se
// había puesto en Semanal. Respeta los filtros de campaña (multi) y BDR de la pestaña; el de
// fechas (fecha del EVENTO) no aplica: el eje de este reporte es la semana de ENTREGA.
// Eje = COHORTE DE ENTREGA: la semana de una empresa es la de su fecha_entrada_pre_qm (Attio:
// última entrada al stage PRE-QM). Las métricas son el estado ACTUAL de cada cohorte según el
// Outbound Stage — Attio no guarda historia de stage, así que "qué pasó durante la semana X"
// no existe hacia atrás; esto responde "cómo está hoy lo que entregamos la semana X".
// Regla de alerta (José/Cande): una empresa que lleva más de 7 días desde su entrada sin salir
// de PRE-QM está vencida → semáforo rojo. Los Wons van aparte, por FECHA DE CIERRE del deal
// (no por cohorte) — es el "apartado de negocios ganados" que pidieron en el resumen.
// Decisiones Ramiro 2026-08-26: QM incluye SHOW / NO SHOW / Cliente; universo = taggeadas con
// fecha de entrada (Lead Source y Empresa procesable se muestran como criterio, no filtran).

const PLAZO_DIAS = 7;
const FILAS_POR_PAGINA = 10;
const SPARK_SEMANAS = 10;

type EtapaKey = CohorteEntrega["etapa_reporte"];
type MetricKey = "entregadas" | EtapaKey | "wons";

type MetricDef = {
  key: MetricKey;
  label: string;
  color: string;
  tag: string;
  lineage: string;
  criterios: [string, string][];
  disclaimer?: string;
  card: boolean; // aparece como KPI card (otros solo va en la tabla)
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
      ["Fecha entrada PRE-QM", "Define la semana de entrega (lunes a domingo)"],
      ["Lead Source (referencia)", "Field Marketing Latam / Brasil"],
      ["Empresa procesable (referencia)", "L2 - PreQM"],
    ],
    disclaimer: "Lead Source y Empresa procesable se muestran como referencia de la definición original; el universo es toda empresa taggeada con fecha de entrada (decisión 2026-08-26). Una empresa cuenta una sola vez aunque tenga varios tags.",
    card: true,
  },
  {
    key: "por_procesar",
    label: "Por procesar",
    color: "var(--fg-status-error)",
    tag: "Sin mover",
    lineage: "cohorte_por_procesar",
    criterios: [
      ["Outbound Stage", "PRE-QM - Oportunidad Marketing (también Not Started, Ready o vacío)"],
      ["Regla de alerta", `Más de ${PLAZO_DIAS} días desde la entrada a PRE-QM sin cambiar de stage`],
    ],
    disclaimer: `Semáforo rojo si la empresa lleva más de ${PLAZO_DIAS} días desde su entrada sin cambiar de stage. Requiere acción del BDR asignado.`,
    card: true,
  },
  {
    key: "procesando",
    label: "Procesando",
    color: "var(--fg-status-info)",
    tag: "En gestión",
    lineage: "cohorte_procesando",
    criterios: [["Outbound Stage", "Procesando (también Con contacto)"]],
    disclaimer: "Se marca aparte cuántas figuran Procesando sin ninguna llamada ni WhatsApp registrado.",
    card: true,
  },
  {
    key: "procesada",
    label: "Procesadas",
    color: "var(--fg-secondary)",
    tag: "Circuito terminado",
    lineage: "cohorte_procesadas",
    criterios: [["Outbound Stage", "Procesada"]],
    card: true,
  },
  {
    key: "qm",
    label: "QMs generados",
    color: "var(--fg-status-success)",
    tag: "Respuesta positiva",
    lineage: "cohorte_qm",
    criterios: [["Outbound Stage", "QM AGENDADA, QM SHOW, QM NO SHOW o Cliente"]],
    disclaimer: "Cuenta toda empresa que llegó a QM, esté donde esté hoy — así una QM no desaparece del reporte cuando ocurre la reunión.",
    card: true,
  },
  {
    key: "descartada",
    label: "Descartadas (no ICP)",
    color: "var(--fg-status-warning)",
    tag: "No calificadas",
    lineage: "cohorte_descartadas",
    criterios: [["Outbound Stage", "Descalificada"]],
    disclaimer: "Recycle y Lost no cuentan como descartadas: van a “Otros” para que la suma cierre contra Entregadas.",
    card: true,
  },
  {
    key: "otros",
    label: "Otros (Recycle / Lost)",
    color: "var(--fg-quaternary)",
    tag: "Fuera del funnel",
    lineage: "cohorte_descartadas",
    criterios: [["Outbound Stage", "RECYCLE o Lost"]],
    card: false,
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
      ["Semana", "Fecha de cierre del deal (close_date)"],
    ],
    disclaimer: "Se ubican por fecha de cierre del deal, no por la cohorte de entrega de la empresa. Los deals de evento sin campaña atribuida (cola de revisión en Deals) no cuentan hasta atribuirse.",
    card: true,
  },
];

type Semana = {
  semana: string; // lunes YYYY-MM-DD
  rows: CohorteEntrega[];
  counts: Record<EtapaKey, number>;
  entregadas: number;
  vencidas: number; // por_procesar con más de PLAZO_DIAS días desde la entrada
  maxDias: number; // días de la entrada más vieja vencida
  ppSinActividad: number;
  procSinActividad: number;
  wons: WonByCloseDate[];
  mrr: number;
};

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
function diasEntre(desde: string, hasta: string): number {
  return Math.floor((new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86_400_000);
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
function campanaDelDeal(w: WonByCloseDate, campanas: Set<string>) {
  return (w.campana_evento ?? "").split(",").map((s) => s.trim()).some((k) => campanas.has(k));
}

export function ReporteSemanal({
  cohortes,
  wons,
  campanasSel,
  bdrsSel,
  hoy,
  sinFecha,
}: {
  cohortes: CohorteEntrega[];
  wons: WonByCloseDate[];
  campanasSel: Set<string>; // vacío = todas (multi-select de Estado actual)
  bdrsSel: Set<string>; // vacío = todos (SIN_BDR = sin asignar)
  hoy: string; // YYYY-MM-DD en hora Argentina (viene del server)
  sinFecha: number; // empresas de la selección sin fecha de entrada a PRE-QM (no entran al reporte)
}) {
  const semanaActual = useMemo(() => mondayOf(hoy), [hoy]);

  const filtradas = useMemo(
    () =>
      cohortes.filter(
        (c) =>
          (campanasSel.size === 0 || c.campanas.some((k) => campanasSel.has(k))) &&
          (bdrsSel.size === 0 || bdrsSel.has(c.assigned_bdr_name ?? SIN_BDR))
      ),
    [cohortes, campanasSel, bdrsSel]
  );
  // Los deals no tienen BDR: solo filtran por campaña.
  const wonsFiltrados = useMemo(
    () => wons.filter((w) => w.close_date && w.close_date.slice(0, 10) <= hoy && (campanasSel.size === 0 || campanaDelDeal(w, campanasSel))),
    [wons, campanasSel, hoy]
  );

  // Todas las semanas desde la primera entrega hasta la actual (incluye semanas sin entrega:
  // "el procesamiento continúa" — y ahí igual pueden caer wons por cierre).
  const semanas = useMemo<Semana[]>(() => {
    const byWeek = new Map<string, CohorteEntrega[]>();
    for (const c of filtradas) {
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
    while (cursor <= semanaActual) {
      const rows = byWeek.get(cursor) ?? [];
      const counts: Record<EtapaKey, number> = { por_procesar: 0, procesando: 0, procesada: 0, qm: 0, descartada: 0, otros: 0 };
      let vencidas = 0, maxDias = 0, ppSinActividad = 0, procSinActividad = 0;
      for (const r of rows) {
        counts[r.etapa_reporte]++;
        if (r.etapa_reporte === "por_procesar") {
          const dias = diasEntre(r.fecha_entrada, hoy);
          if (dias > PLAZO_DIAS) { vencidas++; if (dias > maxDias) maxDias = dias; }
          if (r.actividades === 0) ppSinActividad++;
        }
        if (r.etapa_reporte === "procesando" && r.actividades === 0) procSinActividad++;
      }
      const ws = wonsByWeek.get(cursor) ?? [];
      out.push({
        semana: cursor,
        rows,
        counts,
        entregadas: rows.length,
        vencidas,
        maxDias,
        ppSinActividad,
        procSinActividad,
        wons: ws,
        mrr: ws.reduce((acc, w) => acc + Number(w.value_amount ?? 0), 0),
      });
      cursor = isoAddDays(cursor, 7);
    }
    return out;
  }, [filtradas, wonsFiltrados, semanaActual, hoy]);

  // Default: la última semana CON entrega (la actual suele estar vacía o a medio cargar).
  const defaultIdx = useMemo(() => {
    for (let i = semanas.length - 1; i >= 0; i--) if (semanas[i].entregadas > 0) return i;
    return semanas.length - 1;
  }, [semanas]);
  const [weekIdxSel, setWeekIdx] = useState<number | null>(null);
  const weekIdx = weekIdxSel !== null && weekIdxSel < semanas.length ? weekIdxSel : defaultIdx;
  const [metric, setMetric] = useState<MetricKey>("entregadas");
  const [pagina, setPagina] = useState(0);
  const pillsRef = useRef<HTMLDivElement>(null);

  // Pills: arrancan scrolleadas al final (las semanas recientes).
  useEffect(() => {
    const el = pillsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [semanas.length]);

  const w = semanas[weekIdx];
  const prev = weekIdx > 0 ? semanas[weekIdx - 1] : null;

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
    return [...list].sort((a, b) => a.fecha_entrada.localeCompare(b.fecha_entrada) || (a.company_name ?? "").localeCompare(b.company_name ?? ""));
  }, [w, metric]);
  const detallePagina = detalle.slice(pagina * FILAS_POR_PAGINA, (pagina + 1) * FILAS_POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(detalle.length / FILAS_POR_PAGINA));

  function pickWeek(i: number) { setWeekIdx(i); setPagina(0); }
  function pickMetric(k: MetricKey) { setMetric(k); setPagina(0); }

  if (!semanas.length || !w) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 6 }}>Reporte semanal de gestión</div>
        <div className="text-muted" style={{ fontSize: 12 }}>
          Sin empresas con fecha de entrada a PRE-QM para la selección. El atributo <code>fecha_entrada_pre_qm</code> de
          Attio lo llena un trigger al entrar al stage — las empresas anteriores a ese trigger no tienen cohorte.
        </div>
      </div>
    );
  }

  const enCurso = w.semana === semanaActual;
  const overdue = w.vencidas > 0;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>Reporte semanal de gestión</div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            Cómo está HOY cada entrega semanal de empresas (semana = entrada a PRE-QM). Los negocios ganados van por fecha de cierre.
          </div>
        </div>
        <div className="text-muted" style={{ fontSize: 11, textAlign: "right" }}>
          Hoy: {fmtFecha(hoy)} · Datos: Attio
        </div>
      </div>

      {/* Semanas */}
      {/* overflow-x:auto también recorta en vertical: el padding superior/derecho deja lugar al badge "!" (top/right -5). */}
      <div ref={pillsRef} style={{ display: "flex", gap: 6, overflowX: "auto", padding: "6px 8px 6px 0", marginBottom: 8 }}>
        {semanas.map((s, i) => {
          const active = i === weekIdx;
          const alerta = s.vencidas > 0;
          return (
            <button
              key={s.semana}
              onClick={() => pickWeek(i)}
              title={s.entregadas > 0 ? `${s.entregadas} empresas entregadas` : "Sin entrega esta semana"}
              style={{
                position: "relative",
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
              {alerta && (
                <span
                  style={{
                    position: "absolute", top: -5, right: -5,
                    background: "var(--fg-status-error)", color: "var(--bg-primary)",
                    fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 5px", lineHeight: "12px",
                  }}
                >
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alerta */}
      {overdue && (
        <div
          className="card"
          style={{
            display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, fontSize: 12,
            border: "1px solid var(--fg-status-error)", background: "var(--bg-status-error)", color: "var(--fg-primary)",
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>🔴</span>
          <div>
            <strong>{w.vencidas} empresa{w.vencidas === 1 ? "" : "s"}</strong> de la entrega del {fmtRango(w.semana)} llevan más de{" "}
            <strong>{PLAZO_DIAS} días</strong> sin salir de PRE-QM (la más vieja: <strong>{w.maxDias} días</strong>). Requiere acción del BDR asignado —{" "}
            <button
              onClick={() => pickMetric("por_procesar")}
              style={{ all: "unset", cursor: "pointer", fontWeight: 700, color: "var(--fg-status-error)", textDecoration: "underline" }}
            >
              ver cuáles
            </button>
            .
          </div>
        </div>
      )}

      {/* Chip de entrega + gap de cobertura */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {w.entregadas > 0 ? (
          <span className="badge" style={{ background: "var(--bg-status-info)", color: "var(--fg-status-info)", fontSize: 11 }}>
            📦 Entrega: <strong style={{ margin: "0 4px" }}>{w.entregadas} empresas</strong> — {fmtRango(w.semana)}
            {enCurso ? " · semana en curso" : ""}
            {!overdue && !enCurso && w.counts.por_procesar > 0 ? ` · ${w.counts.por_procesar} dentro del plazo de ${PLAZO_DIAS} días` : ""}
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
            title="Empresas de la selección (mismo universo que el funnel de abajo) que nunca pasaron por el stage PRE-QM en Attio, o pasaron antes de que existiera el trigger que registra la fecha. No tienen semana de entrega y no cuentan en ninguna métrica del reporte."
          >
            ⚠ {sinFecha} empresa{sinFecha === 1 ? "" : "s"} de la selección sin fecha de entrada a PRE-QM — no entran al reporte
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
        {METRICAS.filter((m) => m.card).map((m) => {
          const val = valor(w, m.key);
          const d = delta(m.key);
          const alerta = m.key === "por_procesar" && overdue;
          const selected = m.key === metric;
          const dim = m.key !== "wons" && w.entregadas === 0;
          const sparkFrom = Math.max(0, semanas.length - SPARK_SEMANAS);
          const serie = semanas.slice(sparkFrom).map((s) => valor(s, m.key));
          const sub =
            m.key === "por_procesar" && w.ppSinActividad > 0 ? `${w.ppSinActividad} sin ninguna actividad`
            : m.key === "procesando" && w.procSinActividad > 0 ? `${w.procSinActividad} sin actividad registrada`
            : m.key === "wons" && w.mrr > 0 ? formatCurrency(w.mrr)
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
                border: `1.5px solid ${selected ? m.color : alerta ? "var(--fg-status-error)" : "var(--border-tertiary)"}`,
                background: alerta ? "var(--bg-status-error)" : selected ? "var(--bg-secondary)" : "var(--bg-primary)",
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
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: alerta ? "var(--fg-status-error)" : "var(--fg-primary)" }}>
                    {val || "—"}
                  </div>
                  {d !== null && (
                    <div style={{ fontSize: 10, marginTop: 3, color: d > 0 ? "var(--fg-status-success)" : d < 0 ? "var(--fg-status-error)" : "var(--fg-quaternary)" }}>
                      {d > 0 ? `↑ ${d}` : d < 0 ? `↓ ${Math.abs(d)}` : "= igual"} <span className="text-muted">vs sem. anterior</span>
                    </div>
                  )}
                  {alerta && <div style={{ fontSize: 10, color: "var(--fg-status-error)", fontWeight: 700, marginTop: 3 }}>⚠ {w.vencidas} vencidas</div>}
                  {sub && <div className="text-muted" style={{ fontSize: 10, marginTop: 3 }}>{sub}</div>}
                </div>
                <Sparkline values={serie} color={m.color} highlightIdx={weekIdx - sparkFrom} />
              </div>
            </button>
          );
        })}
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
                    {["Deal", "Empresa", "Campaña", "Cierre", "MRR"].map((h) => (
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
                    {["Empresa", "Campaña", "Stage", "BDR", "Entrada", "Act."].map((h) => (
                      <th key={h} className="text-muted" style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detallePagina.map((c) => {
                    const dias = diasEntre(c.fecha_entrada, hoy);
                    const vencida = c.etapa_reporte === "por_procesar" && dias > PLAZO_DIAS;
                    const url = attioCompanyUrl(c.attio_company_id);
                    return (
                      <tr key={c.attio_company_id} style={{ borderTop: "1px solid var(--border-tertiary)" }}>
                        <td style={tdStyle}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--fg-primary)", textDecoration: "none", fontWeight: 600 }}>
                              {c.company_name ?? c.attio_company_id} ↗
                            </a>
                          ) : (c.company_name ?? c.attio_company_id)}
                        </td>
                        <td style={{ ...tdStyle, color: "var(--fg-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.campanas.join(", ")}>
                          {c.campanas.join(", ")}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: METRICAS.find((m) => m.key === c.etapa_reporte)?.color, fontWeight: 600 }}>{c.outbound_stage ?? "—"}</span>
                        </td>
                        <td style={{ ...tdStyle, color: c.assigned_bdr_name ? "inherit" : "var(--fg-status-warning)" }}>{c.assigned_bdr_name ?? "Sin BDR"}</td>
                        <td style={tdStyle}>
                          {fmtDia(c.fecha_entrada)}{" "}
                          <span style={{ fontSize: 11, fontWeight: vencida ? 700 : 500, color: vencida ? "var(--fg-status-error)" : "var(--fg-quaternary)" }}>
                            · {dias} d{vencida ? " ⚠" : ""}
                          </span>
                        </td>
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

      {/* Evolución semanal (todas las métricas comparten unidad: empresas) */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Evolución semanal</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {METRICAS.filter((m) => m.card).map((m) => (
              <button
                key={m.key}
                onClick={() => pickMetric(m.key)}
                style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--fg-secondary)", fontWeight: m.key === metric ? 700 : 500 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: "inline-block" }} />
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <EvolucionChart semanas={semanas} weekIdx={weekIdx} metric={metric} valor={valor} onPick={pickWeek} />
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
                const pct = m.key === "entregadas" || m.key === "wons" ? null : w.entregadas > 0 ? Math.round((val / w.entregadas) * 100) : null;
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
                    <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{pct !== null && val ? `${pct}%` : "—"}</td>
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
            </tbody>
          </table>
        </div>
        <div className="text-muted" style={{ fontSize: 10, padding: "8px 14px", lineHeight: 1.5 }}>
          Cada empresa cuenta en UNA fila según su Outbound Stage actual en Attio; las cinco etapas + Otros suman Entregadas.
          Los filtros de campaña y BDR de arriba aplican (una empresa con varios tags entra en cada uno; los negocios ganados
          solo filtran por campaña); el filtro de fechas no — su eje es la fecha del evento y el de este reporte, la semana de
          entrega. <strong>La fecha de entrada a PRE-QM es de la EMPRESA</strong> (su última entrada al stage), no del evento:
          una empresa taggeada a varios eventos cae en la semana en que entró a PRE-QM, que puede ser la de otro evento — por eso
          con una campaña filtrada pueden verse semanas sueltas con 1 o 2 empresas además de la entrega principal. Las empresas
          que nunca pasaron por PRE-QM no tienen semana y quedan fuera (se avisa arriba). Click en una métrica para ver sus empresas.
        </div>
      </div>
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

// Líneas por métrica sobre las mismas semanas (misma unidad: empresas). La métrica
// seleccionada va resaltada; click en una semana la selecciona.
function EvolucionChart({
  semanas,
  weekIdx,
  metric,
  valor,
  onPick,
}: {
  semanas: Semana[];
  weekIdx: number;
  metric: MetricKey;
  valor: (s: Semana, k: MetricKey) => number;
  onPick: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 190, padL = 34, padR = 12, padT = 10, padB = 26;
  const cw = W - padL - padR, ch = H - padT - padB;
  const series = METRICAS.filter((m) => m.card);
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
            <g key={m.key} opacity={sel ? 1 : 0.45}>
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
