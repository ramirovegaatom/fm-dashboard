"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DailyProgress, WeeklyHito, CampanaFecha, BdrCompany } from "@/lib/supabase";
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
  // Circuito v2 (2026-08-06): procesada = circuito completo (2 contactos con 3+2 c/u) o QM
  // agendada — misma definición que la pestaña de estado (los QM calientes de evento cuentan).
  { key: "empresas_procesadas", label: "Empresas procesadas (circuito o QM)", color: "var(--fg-status-brand)" },
  { key: "qm_agendadas", label: "QM agendadas (deals)", color: "var(--fg-status-info)" },
  { key: "demos", label: "Demos", color: "var(--chart-partner)" },
  { key: "mrr_won", label: "MRR cerrado", color: "var(--fg-status-success)", money: true },
];

// Orden = recorrido del funnel. dropoff/recycle no aparecen: Attio sobreescribe el stage
// sin fecha histórica (se cubrirán con fm_weekly_snapshots hacia adelante).
const HITOS_META: { key: WeeklyHito["hito"]; label: string }[] = [
  { key: "inicio_prospeccion", label: "Inicio prospección" },
  { key: "procesada", label: "Procesada (circuito o QM)" },
  { key: "qm_agendada", label: "QM agendada" },
  { key: "qm_completada", label: "QM completada" },
  { key: "demo", label: "Demo" },
  { key: "won", label: "Won" },
];

const FILAS_POR_PAGINA = 10;

// Filas de la tabla semanal transpuesta (métrica por fila, semanas como columnas).
const METRICAS_TABLA: {
  key: keyof WeekAgg;
  label: string;
  color: string;
  bold?: boolean;
  money?: boolean;
}[] = [
  { key: "llamadas", label: "Llamadas", color: "var(--chart-linkedin)" },
  { key: "whatsapps", label: "WhatsApps", color: "var(--chart-email)" },
  { key: "empresas_procesadas", label: "Emp. procesadas", color: "var(--fg-status-brand)", bold: true },
  { key: "qm_agendadas", label: "QM agend.", color: "var(--fg-status-info)" },
  { key: "qm_completadas", label: "QM compl.", color: "var(--fg-status-info)" },
  { key: "demos", label: "Demos", color: "var(--chart-partner)" },
  { key: "wons", label: "Wons", color: "var(--fg-status-success)", bold: true },
  { key: "mrr_won", label: "MRR", color: "var(--fg-status-success)", bold: true, money: true },
  { key: "losts", label: "Losts", color: "var(--fg-quaternary)" },
];

// Celda heatmap: fondo del color de la métrica con intensidad ∝ valor / máximo de la
// columna (la tabla semanal se lee de un vistazo sin perder el número exacto).
function heatStyle(valor: number, max: number, color: string): React.CSSProperties {
  if (valor <= 0 || max <= 0) return {};
  const pct = Math.round(8 + 32 * (valor / max));
  return { background: `color-mix(in srgb, ${color} ${pct}%, transparent)` };
}

function mondayOf(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function isoAddDays(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Avance por evento (pedido Cande vía Ramiro, 2026-08-18): qué se movió en una ventana de tiempo,
// evento por evento, con delta contra la ventana anterior de igual longitud. Responde
// "¿qué pasó del lunes al viernes?" sin tener que recorrer campaña por campaña — el resto
// de la pestaña agrega UNA campaña (o todas sumadas), nunca el desglose comparado.
type AvanceEvento = {
  campana: string;
  actividades: number;
  procesadas: number;
  qm_agendadas: number;
  qm_completadas: number;
  demos: number;
  wons: number;
  mrr_won: number;
};

const AVANCE_COLS: { key: Exclude<keyof AvanceEvento, "campana">; label: string; money?: boolean }[] = [
  { key: "actividades", label: "Actividades" },
  { key: "procesadas", label: "Procesadas" },
  { key: "qm_agendadas", label: "QM agend." },
  { key: "qm_completadas", label: "QM compl." },
  { key: "demos", label: "Demos" },
  { key: "wons", label: "Wons" },
  { key: "mrr_won", label: "MRR", money: true },
];

function agregaAvance(dias: DailyProgress[], from: string, to: string): Map<string, AvanceEvento> {
  const m = new Map<string, AvanceEvento>();
  for (const r of dias) {
    if (r.fecha < from || r.fecha > to) continue;
    const acc = m.get(r.campana_evento) ?? {
      campana: r.campana_evento, actividades: 0, procesadas: 0, qm_agendadas: 0,
      qm_completadas: 0, demos: 0, wons: 0, mrr_won: 0,
    };
    acc.actividades += r.llamadas + r.whatsapps;
    acc.procesadas += r.empresas_procesadas;
    acc.qm_agendadas += r.qm_agendadas;
    acc.qm_completadas += r.qm_completadas;
    acc.demos += r.demos;
    acc.wons += r.wons;
    acc.mrr_won = Number(acc.mrr_won) + Number(r.mrr_won);
    m.set(r.campana_evento, acc);
  }
  return m;
}

// Delta contra la ventana anterior: flecha + diferencia, al lado del valor de la ventana.
function DeltaBadge({ cur, prev, money }: { cur: number; prev: number; money?: boolean }) {
  const diff = cur - prev;
  if (diff === 0) return null;
  const up = diff > 0;
  const fmt = money ? formatCurrency(Math.abs(diff)) : Math.abs(diff).toLocaleString("es-AR");
  return (
    <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 5, color: up ? "var(--fg-status-success)" : "var(--fg-status-error)" }}>
      {up ? "▲" : "▼"} {fmt}
    </span>
  );
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

const ESTADOS_META: { key: BdrCompany["estado_actividad"]; label: string; color: string }[] = [
  { key: "sin_actividad", label: "Sin actividad", color: "var(--fg-status-error)" },
  { key: "en_proceso", label: "En proceso", color: "var(--fg-status-info)" },
  { key: "procesada", label: "Procesada", color: "var(--fg-status-success)" },
];

export function SemanalClient({
  dias,
  hitos,
  fechasEvento,
  bdrCompanies,
}: {
  dias: DailyProgress[];
  hitos: WeeklyHito[];
  fechasEvento: CampanaFecha[];
  bdrCompanies: BdrCompany[];
}) {
  const [campana, setCampana] = useState<string>("todas");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [hito, setHito] = useState<WeeklyHito["hito"]>("procesada");
  const [bdrSel, setBdrSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  // Scorecard por BDR (independiente de la sección de hitos).
  const [bdrScore, setBdrScore] = useState<string | null>(null);
  const [buscaBdr, setBuscaBdr] = useState("");
  const [paginaBdr, setPaginaBdr] = useState(0);
  // Tabla semanal transpuesta: arranca scrolleada al final (las semanas recientes).
  const semTablaRef = useRef<HTMLDivElement>(null);

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

  // ── Avance por evento ──
  // El seguimiento de Cande es DURANTE la semana (2026-08-18): un jueves necesita
  // lunes→hoy sin esperar a que la semana cierre. Default: esta semana en curso,
  // comparada contra LOS MISMOS DÍAS de la semana pasada (lunes→jueves vs
  // lunes→jueves — comparar 4 días contra 7 siempre da "peor" y no dice nada).
  // El chip "Semana pasada" da la vista de cierre; el filtro de fechas de arriba
  // pisa a ambos.
  const [modoVentana, setModoVentana] = useState<"esta" | "pasada">("esta");
  const ventanaAvance = useMemo(() => {
    if (fromStr) {
      const to = toStr && toStr <= hoy ? toStr : hoy;
      return { from: fromStr, to, custom: true };
    }
    if (modoVentana === "esta") return { from: semanaActual, to: hoy, custom: false };
    return { from: isoAddDays(semanaActual, -7), to: isoAddDays(semanaActual, -1), custom: false };
  }, [fromStr, toStr, hoy, semanaActual, modoVentana]);

  const avanceEventos = useMemo(() => {
    const { from, to, custom } = ventanaAvance;
    // Ventana de comparación: para esta/semana pasada, los mismos días corridos 7 atrás
    // (semana vs semana). Para un rango custom, el período anterior de igual longitud.
    let prevFrom: string, prevTo: string;
    if (custom) {
      const dur = Math.round((new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86_400_000) + 1;
      prevTo = isoAddDays(from, -1);
      prevFrom = isoAddDays(from, -dur);
    } else {
      prevFrom = isoAddDays(from, -7);
      prevTo = isoAddDays(to, -7);
    }
    const base = campana === "todas" ? dias : dias.filter((r) => r.campana_evento === campana);
    const cur = agregaAvance(base, from, to);
    const prev = agregaAvance(base, prevFrom, prevTo);
    // Entran los eventos con movimiento en cualquiera de las dos ventanas: un evento que
    // venía moviéndose y esta semana quedó en cero es exactamente lo que hay que ver.
    const campanasSet = new Set([...cur.keys(), ...prev.keys()]);
    const vacio = (c: string): AvanceEvento => ({ campana: c, actividades: 0, procesadas: 0, qm_agendadas: 0, qm_completadas: 0, demos: 0, wons: 0, mrr_won: 0 });
    return [...campanasSet]
      .map((c) => ({ cur: cur.get(c) ?? vacio(c), prev: prev.get(c) ?? vacio(c) }))
      .sort((a, b) =>
        b.cur.qm_agendadas - a.cur.qm_agendadas ||
        b.cur.procesadas - a.cur.procesadas ||
        b.cur.actividades - a.cur.actividades
      );
  }, [dias, campana, ventanaAvance]);

  const totalAvance = useMemo(() => {
    const t = { actividades: 0, procesadas: 0, qm_agendadas: 0, qm_completadas: 0, demos: 0, wons: 0, mrr_won: 0 };
    const p = { ...t };
    for (const { cur, prev } of avanceEventos) {
      for (const c of AVANCE_COLS) { t[c.key] += Number(cur[c.key]); p[c.key] += Number(prev[c.key]); }
    }
    return { cur: t, prev: p };
  }, [avanceEventos]);

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

  const filasHito = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return hitosFiltrados
      .filter(
        (h) =>
          h.hito === hito &&
          (!q || (h.company_name ?? "").toLowerCase().includes(q) || (h.deal_name ?? "").toLowerCase().includes(q))
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [hitosFiltrados, hito, busca]);

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

  const totalPaginas = Math.max(1, Math.ceil(filasVisibles.length / FILAS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const filasPagina = useMemo(
    () => filasVisibles.slice(paginaActual * FILAS_POR_PAGINA, (paginaActual + 1) * FILAS_POR_PAGINA),
    [filasVisibles, paginaActual]
  );

  const hayDeals = filasPagina.some((f) => f.deal_name);

  // Máximos por columna para el heatmap de la tabla semanal.
  const colMax = useMemo(() => {
    const max = { llamadas: 0, whatsapps: 0, empresas_procesadas: 0, qm_agendadas: 0, qm_completadas: 0, demos: 0, wons: 0, mrr_won: 0, losts: 0 };
    semanas.forEach((s) => {
      max.llamadas = Math.max(max.llamadas, s.llamadas);
      max.whatsapps = Math.max(max.whatsapps, s.whatsapps);
      max.empresas_procesadas = Math.max(max.empresas_procesadas, s.empresas_procesadas);
      max.qm_agendadas = Math.max(max.qm_agendadas, s.qm_agendadas);
      max.qm_completadas = Math.max(max.qm_completadas, s.qm_completadas);
      max.demos = Math.max(max.demos, s.demos);
      max.wons = Math.max(max.wons, s.wons);
      max.mrr_won = Math.max(max.mrr_won, Number(s.mrr_won));
      max.losts = Math.max(max.losts, s.losts);
    });
    return max;
  }, [semanas]);

  // ── Seguimiento por BDR ──
  // Con rango de fechas: empresas ASIGNADAS en ese rango (bdr_assigned_at); sin rango:
  // todas las asignadas de la selección. El estado (sin actividad / en proceso / procesada)
  // es siempre el actual, por actividades.
  const asignadas = useMemo(
    () =>
      bdrCompanies.filter(
        (c) =>
          (campana === "todas" || c.campana_evento === campana) &&
          (!fromStr || (c.bdr_assigned_at !== null && c.bdr_assigned_at >= fromStr)) &&
          (!toStr || (c.bdr_assigned_at !== null && c.bdr_assigned_at <= toStr))
      ),
    [bdrCompanies, campana, fromStr, toStr]
  );

  const scoreBdr = useMemo(() => {
    const m = new Map<string, { asignadas: number; sin: number; proc: number; done: number }>();
    asignadas.forEach((c) => {
      const k = c.assigned_bdr_name ?? "— sin BDR —";
      const acc = m.get(k) ?? { asignadas: 0, sin: 0, proc: 0, done: 0 };
      acc.asignadas++;
      if (c.estado_actividad === "sin_actividad") acc.sin++;
      else if (c.estado_actividad === "en_proceso") acc.proc++;
      else acc.done++;
      m.set(k, acc);
    });
    return [...m.entries()].sort((a, b) => b[1].asignadas - a[1].asignadas);
  }, [asignadas]);

  const totalScore = useMemo(
    () =>
      scoreBdr.reduce(
        (acc, [, s]) => ({
          asignadas: acc.asignadas + s.asignadas,
          sin: acc.sin + s.sin,
          proc: acc.proc + s.proc,
          done: acc.done + s.done,
        }),
        { asignadas: 0, sin: 0, proc: 0, done: 0 }
      ),
    [scoreBdr]
  );

  const empresasBdr = useMemo(() => {
    const q = buscaBdr.trim().toLowerCase();
    return asignadas
      .filter(
        (c) =>
          (!bdrScore || (c.assigned_bdr_name ?? "— sin BDR —") === bdrScore) &&
          (!q || (c.company_name ?? "").toLowerCase().includes(q))
      )
      .sort((a, b) => (b.bdr_assigned_at ?? "").localeCompare(a.bdr_assigned_at ?? ""));
  }, [asignadas, bdrScore, buscaBdr]);

  const totalPaginasBdr = Math.max(1, Math.ceil(empresasBdr.length / FILAS_POR_PAGINA));
  const paginaBdrActual = Math.min(paginaBdr, totalPaginasBdr - 1);
  const empresasBdrPagina = useMemo(
    () => empresasBdr.slice(paginaBdrActual * FILAS_POR_PAGINA, (paginaBdrActual + 1) * FILAS_POR_PAGINA),
    [empresasBdr, paginaBdrActual]
  );

  useEffect(() => {
    if (semTablaRef.current) semTablaRef.current.scrollLeft = semTablaRef.current.scrollWidth;
  }, [semanas]);

  function filtrarSemana(semana: string) {
    const from = new Date(semana + "T00:00:00");
    const to = new Date(semana + "T00:00:00");
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59);
    setDateRange({ from, to });
    setPagina(0);
    setPaginaBdr(0);
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
            setPagina(0);
            setPaginaBdr(0);
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
        <DateFilter
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            setPagina(0);
            setPaginaBdr(0);
          }}
        />
        {/* Atajo pedido Cande (2026-08-18): su seguimiento es DURANTE la semana — un jueves
            quiere lunes→hoy en TODA la pestaña (hitos y BDRs incluidos), sin armar el rango. */}
        <button
          onClick={() => {
            setDateRange({ from: new Date(semanaActual + "T00:00:00"), to: new Date() });
            setPagina(0);
            setPaginaBdr(0);
          }}
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
          Esta semana
        </button>
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
      <div
        className="card"
        style={{ marginBottom: 24, background: "var(--bg-secondary)", fontSize: 12, color: "var(--fg-secondary)" }}
      >
        <strong>Qué pasó CADA SEMANA</strong>: actividades, empresas procesadas, QMs y wons ubicados en la
        semana en que ocurrieron. Fechas = <strong>actividad real del contacto</strong> o fecha de etapa del
        deal, nunca la fecha del evento · semana = lunes a domingo. Para ver en qué etapa está HOY cada
        empresa y el scorecard por BDR, usá la pestaña{" "}
        <a href="/seguimiento" style={{ color: "var(--fg-status-info)" }}>Estado actual</a>.
        “Procesada” = circuito completo (2 contactos con 3 llamadas + 2 WhatsApp c/u){" "}
        <strong>o QM agendada</strong> — los contactos calientes de evento cuentan aunque no hayan
        completado el circuito.
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

      {/* Avance por evento: qué se movió en la ventana, evento por evento, vs la anterior */}
      <div className="section-title">Avance por evento</div>
      <div className="card" style={{ marginBottom: 32 }}>
        {!ventanaAvance.custom && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {([["esta", "Esta semana (lunes → hoy)"], ["pasada", "Semana pasada"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setModoVentana(k)}
                style={{
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid var(--border-tertiary)",
                  background: modoVentana === k ? "var(--fg-primary)" : "var(--bg-primary)",
                  color: modoVentana === k ? "var(--bg-primary)" : "var(--fg-secondary)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Qué se movió <strong>del {fmtFecha(ventanaAvance.from)} al {fmtFecha(ventanaAvance.to)}</strong>
          {ventanaAvance.custom ? " (rango elegido arriba)" : ""}, evento por evento. La flechita compara contra{" "}
          {ventanaAvance.custom ? "el período anterior de igual duración" : "los mismos días de la semana anterior"}: ▲ mejor, ▼ peor.
          Click en un evento para enfocar toda la pestaña en él.
        </div>
        {avanceEventos.length === 0 ? (
          <div className="text-muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
            Sin movimientos en la ventana (ni en la anterior).
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                  <th style={thStyle}>Evento</th>
                  {AVANCE_COLS.map((c) => (
                    <th key={c.key} style={thRight}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {avanceEventos.map(({ cur, prev }) => (
                  <tr
                    key={cur.campana}
                    onClick={() => setCampana(campana === cur.campana ? "todas" : cur.campana)}
                    style={{ borderBottom: "1px solid var(--border-tertiary)", cursor: "pointer", background: campana === cur.campana ? "var(--bg-secondary)" : undefined }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {cur.campana}
                      {(() => {
                        const f = fechasEvento.find((x) => x.campana_evento === cur.campana)?.evento_fecha?.slice(0, 10);
                        return f ? <span className="text-muted" style={{ fontWeight: 400, fontSize: 11, marginLeft: 6 }}>({fmtFecha(f)})</span> : null;
                      })()}
                    </td>
                    {AVANCE_COLS.map((c) => (
                      <td key={c.key} style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        {Number(cur[c.key]) === 0 && Number(prev[c.key]) === 0
                          ? <span className="text-muted">—</span>
                          : <>{c.money ? formatCurrency(Number(cur[c.key])) : Number(cur[c.key]).toLocaleString("es-AR")}<DeltaBadge cur={Number(cur[c.key])} prev={Number(prev[c.key])} money={c.money} /></>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border-tertiary)", fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  {AVANCE_COLS.map((c) => (
                    <td key={c.key} style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      {c.money ? formatCurrency(totalAvance.cur[c.key]) : totalAvance.cur[c.key].toLocaleString("es-AR")}
                      <DeltaBadge cur={totalAvance.cur[c.key]} prev={totalAvance.prev[c.key]} money={c.money} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Seguimiento por BDR: cuándo se asignó cada empresa y en qué estado está */}
      <div className="section-title">Asignaciones y procesamiento por BDR</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {fromStr || toStr ? (
            <>Empresas <strong>asignadas en el rango elegido</strong> (por fecha de asignación del BDR en Attio) y su estado actual.</>
          ) : (
            <>Todas las empresas asignadas de la selección y su estado actual. Filtrá por fechas para ver <strong>qué se le asignó a cada BDR en ese período</strong>.</>
          )}{" "}
          Click en un BDR (o elegilo en el desplegable) para ver sus empresas.
        </div>

        {/* Filtro por BDR */}
        <div style={{ marginBottom: 12 }}>
          <select
            value={bdrScore ?? "todos"}
            onChange={(e) => {
              setBdrScore(e.target.value === "todos" ? null : e.target.value);
              setPaginaBdr(0);
            }}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: bdrScore ? "var(--fg-primary)" : "var(--bg-primary)",
              color: bdrScore ? "var(--bg-primary)" : "var(--fg-secondary)",
              maxWidth: 320,
            }}
          >
            <option value="todos">Todos los BDRs ({scoreBdr.length})</option>
            {scoreBdr.map(([bdr, s]) => (
              <option key={bdr} value={bdr}>
                {bdr} — {s.asignadas} asignadas
              </option>
            ))}
          </select>
        </div>

        {/* Scorecard */}
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                <th style={thStyle}>BDR</th>
                <th style={thRight}>Asignadas</th>
                <th style={{ ...thRight, color: "var(--fg-status-error)" }}>Sin actividad</th>
                <th style={{ ...thRight, color: "var(--fg-status-info)" }}>En proceso</th>
                <th style={{ ...thRight, color: "var(--fg-status-success)" }}>Procesadas</th>
                <th style={thRight}>% proc.</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", background: "var(--bg-secondary)" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>Todos ({scoreBdr.length})</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totalScore.asignadas}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "var(--fg-status-error)" }}>{totalScore.sin}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "var(--fg-status-info)" }}>{totalScore.proc}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "var(--fg-status-success)" }}>{totalScore.done}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>
                  {totalScore.asignadas > 0 ? Math.round((totalScore.done / totalScore.asignadas) * 100) : 0}%
                </td>
              </tr>
              {scoreBdr
                .filter(([bdr]) => !bdrScore || bdr === bdrScore)
                .map(([bdr, s]) => {
                const active = bdrScore === bdr;
                return (
                  <tr
                    key={bdr}
                    onClick={() => {
                      setBdrScore(active ? null : bdr);
                      setPaginaBdr(0);
                    }}
                    style={{
                      borderBottom: "1px solid var(--border-tertiary)",
                      cursor: "pointer",
                      background: active ? "color-mix(in srgb, var(--fg-status-brand) 10%, transparent)" : undefined,
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: bdr === "— sin BDR —" ? "var(--fg-quaternary)" : undefined }}>
                      {active ? "▸ " : ""}{bdr}
                    </td>
                    <td style={{ ...tdRight, fontWeight: 600 }}>{s.asignadas}</td>
                    <td style={{ ...tdRight, ...heatStyle(s.sin, Math.max(s.asignadas, 1), "var(--fg-status-error)") }}>{s.sin > 0 ? s.sin : "·"}</td>
                    <td style={{ ...tdRight, ...heatStyle(s.proc, Math.max(s.asignadas, 1), "var(--fg-status-info)") }}>{s.proc > 0 ? s.proc : "·"}</td>
                    <td style={{ ...tdRight, ...heatStyle(s.done, Math.max(s.asignadas, 1), "var(--fg-status-success)") }}>{s.done > 0 ? s.done : "·"}</td>
                    <td style={{ ...tdRight, color: "var(--fg-secondary)" }}>
                      {s.asignadas > 0 ? Math.round((s.done / s.asignadas) * 100) : 0}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empresas del BDR seleccionado (o todas) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            {bdrScore ? `Empresas de ${bdrScore}` : "Todas las empresas asignadas"}
          </span>
          <input
            type="search"
            value={buscaBdr}
            onChange={(e) => {
              setBuscaBdr(e.target.value);
              setPaginaBdr(0);
            }}
            placeholder="Buscar empresa…"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: "var(--bg-primary)",
              color: "var(--fg-primary)",
              width: 220,
            }}
          />
          <span className="text-muted" style={{ fontSize: 12 }}>
            {empresasBdr.length} empresa{empresasBdr.length === 1 ? "" : "s"}
          </span>
          {bdrScore && (
            <button
              onClick={() => {
                setBdrScore(null);
                setPaginaBdr(0);
              }}
              style={{ ...pagBtnStyle, padding: "4px 10px", fontSize: 11 }}
            >
              ✕ Quitar filtro BDR
            </button>
          )}
        </div>

        {empresasBdr.length === 0 ? (
          <div className="text-muted" style={{ padding: 16, textAlign: "center", fontSize: 13 }}>
            Sin empresas asignadas en la selección.
          </div>
        ) : (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                  <th style={thStyle}>Empresa</th>
                  {campana === "todas" && <th style={thStyle}>Campaña</th>}
                  {!bdrScore && <th style={thStyle}>BDR</th>}
                  <th style={thRight}>Asignada el</th>
                  <th style={thRight}>1ª actividad</th>
                  <th style={thRight}>Procesada el</th>
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {empresasBdrPagina.map((c, i) => {
                  const url = attioCompanyUrl(c.attio_company_id);
                  const estado = ESTADOS_META.find((e) => e.key === c.estado_actividad)!;
                  return (
                    <tr key={`${c.attio_company_id}-${c.campana_evento}-${i}`} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-primary)", textDecoration: "none" }}>
                            {c.company_name ?? "— sin nombre —"}
                          </a>
                        ) : (
                          c.company_name ?? "— sin nombre —"
                        )}
                      </td>
                      {campana === "todas" && (
                        <td style={tdStyle}>
                          <span className="badge" style={{ background: "var(--bg-status-brand)", color: "var(--fg-status-brand)", fontSize: 10 }}>
                            {c.campana_evento}
                          </span>
                        </td>
                      )}
                      {!bdrScore && (
                        <td style={{ ...tdStyle, color: c.assigned_bdr_name ? "var(--fg-secondary)" : "var(--fg-quaternary)" }}>
                          {c.assigned_bdr_name ?? "— sin BDR —"}
                        </td>
                      )}
                      <td style={{ ...tdRight, whiteSpace: "nowrap", fontWeight: 600 }}>
                        {c.bdr_assigned_at ? fmtFecha(c.bdr_assigned_at) : "—"}
                      </td>
                      <td style={{ ...tdRight, whiteSpace: "nowrap", color: "var(--fg-secondary)" }}>
                        {c.fecha_primera_actividad ? fmtFecha(c.fecha_primera_actividad) : "—"}
                      </td>
                      <td style={{ ...tdRight, whiteSpace: "nowrap", color: "var(--fg-secondary)" }}>
                        {c.fecha_procesada ? fmtFecha(c.fecha_procesada) : "—"}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: estado.color, whiteSpace: "nowrap" }}>● {estado.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPaginasBdr > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 0 2px" }}>
                <button
                  onClick={() => setPaginaBdr(Math.max(0, paginaBdrActual - 1))}
                  disabled={paginaBdrActual === 0}
                  style={{ ...pagBtnStyle, opacity: paginaBdrActual === 0 ? 0.4 : 1 }}
                >
                  ← Anterior
                </button>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {paginaBdrActual * FILAS_POR_PAGINA + 1}–{Math.min((paginaBdrActual + 1) * FILAS_POR_PAGINA, empresasBdr.length)} de {empresasBdr.length} · pág. {paginaBdrActual + 1}/{totalPaginasBdr}
                </span>
                <button
                  onClick={() => setPaginaBdr(Math.min(totalPaginasBdr - 1, paginaBdrActual + 1))}
                  disabled={paginaBdrActual >= totalPaginasBdr - 1}
                  style={{ ...pagBtnStyle, opacity: paginaBdrActual >= totalPaginasBdr - 1 ? 0.4 : 1 }}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}

        <div className="text-muted" style={{ fontSize: 11, marginTop: 12 }}>
          &quot;Asignada el&quot; = cuándo se seteó el Assigned BDR en Attio (100% de cobertura) · estado:
          procesada = circuito completo (2 contactos con 3+2 c/u) o QM/Cliente por stage, en proceso = con actividad
          pero sin circuito, sin actividad = ni una llamada/WhatsApp. &quot;Procesada el&quot; = 2º contacto con
          estructura o primera QM — puede quedar vacía si es procesada por stage sin fecha de QM.
        </div>
      </div>

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
                  setPagina(0);
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

        {/* Buscador + desplegable de BDR (con conteos) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar empresa…"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: "var(--bg-primary)",
              color: "var(--fg-primary)",
              width: 220,
            }}
          />
          <select
            value={bdrSel ?? "todos"}
            onChange={(e) => {
              setBdrSel(e.target.value === "todos" ? null : e.target.value);
              setPagina(0);
            }}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: bdrSel ? "var(--fg-primary)" : "var(--bg-primary)",
              color: bdrSel ? "var(--bg-primary)" : "var(--fg-secondary)",
              maxWidth: 280,
            }}
          >
            <option value="todos">Todos los BDRs ({porBdr.length})</option>
            {porBdr.map(([bdr, n]) => (
              <option key={bdr} value={bdr}>
                {bdr} — {n}
              </option>
            ))}
          </select>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {filasVisibles.length} empresa{filasVisibles.length === 1 ? "" : "s"}
          </span>
        </div>

        {filasVisibles.length === 0 ? (
          <div className="text-muted" style={{ padding: 16, textAlign: "center", fontSize: 13 }}>
            Sin empresas con este hito en la selección.
          </div>
        ) : (
          <div>
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
                {filasPagina.map((f, i) => {
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
            {totalPaginas > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 0 2px" }}>
                <button
                  onClick={() => setPagina(Math.max(0, paginaActual - 1))}
                  disabled={paginaActual === 0}
                  style={{ ...pagBtnStyle, opacity: paginaActual === 0 ? 0.4 : 1 }}
                >
                  ← Anterior
                </button>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {paginaActual * FILAS_POR_PAGINA + 1}–{Math.min((paginaActual + 1) * FILAS_POR_PAGINA, filasVisibles.length)} de {filasVisibles.length} · pág. {paginaActual + 1}/{totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(Math.min(totalPaginas - 1, paginaActual + 1))}
                  disabled={paginaActual >= totalPaginas - 1}
                  style={{ ...pagBtnStyle, opacity: paginaActual >= totalPaginas - 1 ? 0.4 : 1 }}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}

        <div className="text-muted" style={{ fontSize: 11, marginTop: 12 }}>
          BDR = asignado actual en Attio · &quot;Llamó&quot; = agente de JustCall (cobertura parcial, solo llamadas recientes) ·
          DropOff/Recycle no tienen fecha histórica — se acumulan en snapshots semanales desde el 2026-07-28.
        </div>
      </div>

      {/* Tabla semanal transpuesta: métricas como filas, semanas como columnas → altura
          fija (9 filas) y scroll HORIZONTAL, no vertical. Click en una semana = filtrarla. */}
      <div className="section-title">Detalle por semana ({semanas.length})</div>
      <div className="card" style={{ padding: 0 }}>
        <div ref={semTablaRef} style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                <th style={{ ...thStyle, ...stickyCol, textAlign: "left" }}>Métrica</th>
                {semanas.map((s) => (
                  <th key={s.semana} style={{ ...thStyle, padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => filtrarSemana(s.semana)}
                      title="Filtrar esta semana"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--fg-quaternary)",
                        cursor: "pointer",
                        textDecoration: "underline dotted",
                        textUnderlineOffset: 3,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {fmtSemana(s.semana)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICAS_TABLA.map((m) => (
                <tr key={m.key} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                  <th style={{ ...tdStyle, ...stickyCol, textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)", whiteSpace: "nowrap" }}>
                    {m.label}
                  </th>
                  {semanas.map((s) => (
                    <HeatCell
                      key={s.semana}
                      valor={Number(s[m.key])}
                      max={Number(colMax[m.key as keyof typeof colMax])}
                      color={m.color}
                      bold={m.bold}
                      render={m.money ? (n) => formatCurrency(n) : undefined}
                      compact
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

// Celda de la tabla semanal: número + fondo con intensidad ∝ valor (0 = "·" atenuado,
// así las semanas activas saltan a la vista sin leer cada cifra).
function HeatCell({
  valor,
  max,
  color,
  bold,
  render,
  compact,
}: {
  valor: number;
  max: number;
  color: string;
  bold?: boolean;
  render?: (n: number) => string;
  compact?: boolean;
}) {
  const base = compact ? { ...tdRight, padding: "7px 6px", whiteSpace: "nowrap" as const } : tdRight;
  if (valor <= 0) {
    return <td style={{ ...base, color: "var(--border-tertiary)" }}>·</td>;
  }
  return (
    <td style={{ ...base, ...heatStyle(valor, max, color), fontWeight: bold ? 600 : undefined }}>
      {render ? render(valor) : valor.toLocaleString("es-AR")}
    </td>
  );
}

// Primera columna fija de la tabla transpuesta (los labels no se van con el scroll).
const stickyCol: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "var(--bg-primary)",
  zIndex: 1,
};

const pagBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-primary)",
  color: "var(--fg-secondary)",
  cursor: "pointer",
};

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
