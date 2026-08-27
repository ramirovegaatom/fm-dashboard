"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SeguimientoCompany, CohorteEntrega, WonByCloseDate } from "@/lib/supabase";
import { ReporteSemanal } from "./ReporteSemanal";
import { DateFilter, type DateRange } from "@/components/DateFilter";
import { SIN_BDR, ETAPAS, ETAPAS_PROCESADAS, etapaRank, CompanyRow, MultiSelectFilter, type EtapaKey } from "./shared";

// Spec del equipo + iteraciones José (2026-07-16/17): funnel por Outbound Stage VALIDADO
// por actividades reales, scorecard por BDR con desglose por etapa, filtro de campaña con
// búsqueda, filtro multi-select de BDRs. 2026-08-26 (José + Cande): el filtro de campaña
// también es multi-select — antes era "todas o una sola" y necesitaban combinar varias. Las stats de cada BDR abren un PREVIEW corto
// (5 empresas); el detalle completo vive en la subpágina /seguimiento/bdr?name=…
// Circuito v2 (Ramiro+Candela 2026-08-06): circuito completo = ≥2 contactos con estructura
// (3 llamadas + 2 WhatsApp o 2+3) cada uno. QM/Cliente valen sin circuito (badge "por stage");
// Descalificada sin circuito cuenta en DropOff pero marcada; Procesada/Lost/RECYCLE sin
// circuito caen a su etapa real con ⚠. Clientes (lifecycle Customer) excluidos en la vista SQL.
const PREVIEW_LIMIT = 5;

function bdrDetailHref(name: string) {
  return `/seguimiento/bdr?name=${encodeURIComponent(name)}`;
}

// Detalle de una etapa del funnel general (José 2026-07-17). Propaga las campañas activas
// como `?campana=a&campana=b` (repetido; vacío = todas).
function etapaHref(key: EtapaKey | "todas" | "procesadas", campanas: Set<string>) {
  const params = new URLSearchParams({ e: key });
  for (const c of [...campanas].sort()) params.append("campana", c);
  return `/seguimiento/etapa?${params.toString()}`;
}

export function SeguimientoClient({
  companies,
  cohortes,
  wons,
  hoy,
}: {
  companies: SeguimientoCompany[];
  cohortes: CohorteEntrega[];
  wons: WonByCloseDate[];
  hoy: string; // YYYY-MM-DD en hora Argentina
}) {
  // Multi-select de campañas: vacío = todas (José + Cande 2026-08-26).
  const [campanasSel, setCampanasSel] = useState<Set<string>>(new Set());
  // Multi-select de BDRs: vacío = todos (feedback José 2026-07-17).
  const [bdrsSel, setBdrsSel] = useState<Set<string>>(new Set());
  // Filtro de fechas por fecha del EVENTO de la campaña (José: Q/mes, como en eventos).
  const [dateRange, setDateRange] = useState<DateRange>({});

  // Fecha primero: define el universo de campañas/BDRs visibles.
  const byDate = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return companies;
    return companies.filter((c) => {
      if (!c.evento_fecha) return false; // campaña sin fecha mapeada: fuera del rango
      const d = new Date(c.evento_fecha);
      if (dateRange.from && d < dateRange.from) return false;
      if (dateRange.to && d > dateRange.to) return false;
      return true;
    });
  }, [companies, dateRange]);

  // Opciones de campaña (dentro del rango de fechas), con cantidad de empresas, alfabéticas.
  const campanaOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of byDate) counts.set(c.campana_evento, (counts.get(c.campana_evento) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
  }, [byDate]);

  const byCampana = useMemo(
    () => (campanasSel.size === 0 ? byDate : byDate.filter((c) => campanasSel.has(c.campana_evento))),
    [byDate, campanasSel]
  );

  // Opciones de BDR (dentro de la campaña activa), ordenadas por asignadas desc.
  const bdrOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of byCampana) {
      const key = c.assigned_bdr_name ?? SIN_BDR;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => (a[0] === SIN_BDR ? 1 : 0) - (b[0] === SIN_BDR ? 1 : 0) || b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [byCampana]);

  // Empresas de la selección (campañas + BDRs, sin fecha del evento) que NO tienen fecha de
  // entrada a PRE-QM y por eso no entran al reporte semanal. Hallazgo Spark Bogotá 2026-08-27:
  // 33 de 275 (15 en QM SHOW) nunca pasaron por PRE-QM → el reporte mostraba 44 QMs y el
  // funnel 67. Decisión Ramiro: mantener la fecha PRE-QM como definición y hacer visible el gap.
  const cohorteIds = useMemo(() => new Set(cohortes.map((c) => c.attio_company_id)), [cohortes]);
  const sinFechaEntrega = useMemo(() => {
    const ids = new Set<string>();
    for (const c of companies) {
      if (campanasSel.size > 0 && !campanasSel.has(c.campana_evento)) continue;
      if (bdrsSel.size > 0 && !bdrsSel.has(c.assigned_bdr_name ?? SIN_BDR)) continue;
      if (!cohorteIds.has(c.attio_company_id)) ids.add(c.attio_company_id);
    }
    return ids.size;
  }, [companies, campanasSel, bdrsSel, cohorteIds]);

  // Filtro por BDR aplicado a TODA la vista (funnel + scorecard), coherente con el resto.
  const filtered = useMemo(() => {
    if (bdrsSel.size === 0) return byCampana;
    return byCampana.filter((c) => bdrsSel.has(c.assigned_bdr_name ?? SIN_BDR));
  }, [byCampana, bdrsSel]);

  const funnel = useMemo(() => {
    const counts: Record<EtapaKey, number> = { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, dropoff: 0, recycle: 0 };
    for (const c of filtered) counts[c.etapa_funnel]++;
    return counts;
  }, [filtered]);

  const asignadas = filtered.length;

  // Contadores de los flags de circuito (Candela 2026-08-06): positivas que llegaron por
  // stage (válidas, informativo) y descalificadas/recicladas sin circuito (para revisar).
  const flags = useMemo(() => {
    let positivas = 0, descalificadas = 0, terminales = 0, recycles = 0;
    for (const c of filtered) {
      if (c.positiva_sin_circuito) positivas++;
      if (c.descalificada_sin_circuito) descalificadas++;
      if (c.terminal_sin_circuito) terminales++;
      if (c.recycle_sin_circuito) recycles++;
    }
    return { positivas, descalificadas, terminales, recycles };
  }, [filtered]);

  // Funnel acumulativo (Ramiro 2026-08-06): las etapas son excluyentes en la data, pero se
  // leen mejor como pipeline — de X asignadas: sin procesar → procesando → procesadas, y
  // "Procesadas" se abre en sus 4 resultados. procesadas = suma de las etapas terminales.
  const procesadasTotal = useMemo(() => ETAPAS_PROCESADAS.reduce((acc, k) => acc + funnel[k], 0), [funnel]);

  // 2026-07-23 (Camilo): empresas con campaña de evento pero SIN BDR asignado — el pool sin
  // dueño puede pasar desapercibido (error humano al cargar). Banner con acceso directo a
  // asignarles BDR. Respeta campaña/fecha pero ignora el multi-select de BDRs.
  const sinAsignar = useMemo(() => byCampana.filter((c) => !c.assigned_bdr_name).length, [byCampana]);

  const bdrs = useMemo(() => {
    const map = new Map<string, { name: string; companies: SeguimientoCompany[]; etapas: Record<EtapaKey, number> }>();
    for (const c of filtered) {
      const key = c.assigned_bdr_name ?? SIN_BDR;
      const entry = map.get(key) ?? {
        name: key,
        companies: [],
        etapas: { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, dropoff: 0, recycle: 0 },
      };
      entry.companies.push(c);
      entry.etapas[c.etapa_funnel]++;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => {
      const aNull = a.name === SIN_BDR ? 1 : 0;
      const bNull = b.name === SIN_BDR ? 1 : 0;
      return aNull - bNull || b.companies.length - a.companies.length;
    });
  }, [filtered]);

  return (
    <div>
      <div
        className="card"
        style={{ marginBottom: 20, background: "var(--bg-secondary)", fontSize: 12, color: "var(--fg-secondary)" }}
      >
        <strong>Foto de HOY</strong>: en qué etapa del embudo está cada empresa generada por marketing
        (eventos y webinars) y cómo viene cada <strong>BDR</strong> con su procesamiento. Etapas basadas en el{" "}
        <strong>Outbound Stage</strong> de Attio validado con las <strong>actividades reales</strong> (llamadas
        y WhatsApp registrados por contacto). El filtro de fechas filtra por la{" "}
        <strong>fecha del EVENTO</strong>, no de la actividad — para ver cuánta actividad hubo cada semana,
        usá la pestaña <Link href="/semanal" style={{ color: "var(--fg-status-info)" }}>Semana a semana</Link>.
        Las empresas que ya son clientes (Lifecycle Stage = <strong>Customer</strong>) no se cuentan.
      </div>

      {/* Filtros: campaña (búsqueda) + BDRs (multi-select) + fechas (Q/mes/custom) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <MultiSelectFilter
          options={campanaOptions}
          selected={campanasSel}
          onChange={setCampanasSel}
          allLabel="Todas las campañas"
          pluralLabel="campañas"
          searchPlaceholder="Buscar evento…"
          clearLabel="Limpiar selección (ver todas)"
        />
        <MultiSelectFilter
          options={bdrOptions}
          selected={bdrsSel}
          onChange={setBdrsSel}
          allLabel="Todos los BDRs"
          pluralLabel="BDRs"
          searchPlaceholder="Buscar BDR…"
          clearLabel="Limpiar selección (ver todos)"
        />
        <DateFilter value={dateRange} onChange={setDateRange} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          {asignadas} empresas asignadas
          {campanasSel.size > 0 ? ` · ${campanasSel.size} campaña${campanasSel.size === 1 ? "" : "s"}` : ""}
          {bdrsSel.size > 0 ? ` · ${bdrsSel.size} BDR${bdrsSel.size === 1 ? "" : "s"}` : ""}
          {(dateRange.from || dateRange.to) ? " · por fecha del evento" : ""}
        </span>
      </div>

      {/* Reporte semanal de gestión por cohorte de entrega (José + Cande 2026-08-26): arriba del
          todo, debajo de los filtros porque los usa (campañas + BDRs; el de fechas no aplica). */}
      <ReporteSemanal cohortes={cohortes} wons={wons} campanasSel={campanasSel} bdrsSel={bdrsSel} hoy={hoy} sinFecha={sinFechaEntrega} />

      {/* Alerta: pool sin BDR asignado (Camilo 2026-07-23) */}
      {sinAsignar > 0 && (
        <Link
          href={bdrDetailHref(SIN_BDR)}
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 20,
            border: "1px solid var(--fg-status-warning)",
            background: "var(--bg-status-warning, var(--bg-secondary))",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span style={{ fontSize: 13 }}>
            ⚠ <strong>{sinAsignar} empresa{sinAsignar === 1 ? "" : "s"} sin BDR asignado</strong>
            <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
              tienen campaña de evento pero el campo Assigned BDR está vacío en Attio
            </span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-status-warning)", whiteSpace: "nowrap" }}>
            Asignar BDR →
          </span>
        </Link>
      )}

      {/* Sección 1 — Funnel general (filas clickeables → detalle de la etapa) */}
      <div className="section-title">Funnel general</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <FunnelRow
          label="Asignadas"
          detalle="empresas totales según los filtros (sin clientes)"
          value={asignadas}
          total={asignadas}
          color="var(--fg-primary)"
          bold
          href={etapaHref("todas", campanasSel)}
        />
        {/* Pipeline: sin procesar → procesando → procesadas (acumulado que se abre en sus resultados) */}
        {ETAPAS.filter((e) => !ETAPAS_PROCESADAS.includes(e.key)).map((e) => (
          <FunnelRow
            key={e.key}
            label={e.label}
            detalle={e.detalle}
            value={funnel[e.key]}
            total={asignadas}
            color={e.color}
            href={etapaHref(e.key, campanasSel)}
          />
        ))}
        <FunnelRow
          label="Procesadas"
          detalle="terminaron su procesamiento: respuesta positiva, sin respuesta, DropOff o Recycle"
          value={procesadasTotal}
          total={asignadas}
          color="var(--fg-primary)"
          bold
          href={etapaHref("procesadas", campanasSel)}
        />
        {ETAPAS.filter((e) => ETAPAS_PROCESADAS.includes(e.key)).map((e) => (
          <FunnelRow
            key={e.key}
            label={e.label}
            detalle={e.detalle}
            value={funnel[e.key]}
            total={asignadas}
            color={e.color}
            href={etapaHref(e.key, campanasSel)}
            indent
          />
        ))}
        <div className="text-muted" style={{ fontSize: 10, marginTop: 10 }}>
          Cada empresa cuenta en UNA sola fila (la más avanzada); <strong>Procesadas</strong> es la suma
          de sus 4 resultados. <strong>Circuito completo</strong> = 2 o más contactos de la empresa con la
          estructura de actividades cada uno (3 llamadas + 2 WhatsApp, o 2+3). La fuente de verdad de “Sin
          procesar / Procesando / Procesada sin respuesta” son las <strong>actividades reales</strong>, no
          el stage manual de Attio: Procesada/Lost sin circuito aparecen en su etapa real con{" "}
          <span style={{ color: "var(--fg-status-warning)", fontWeight: 700 }}>⚠ sin circuito</span>
          {flags.terminales > 0 ? ` (${flags.terminales} hoy)` : ""}. Las{" "}
          <span style={{ color: "var(--fg-status-success)", fontWeight: 700 }}>respuestas positivas</span>{" "}
          valen sin circuito porque los contactos de evento vienen calientes ({flags.positivas} “por
          stage” hoy). Las <span style={{ color: "var(--fg-status-error)", fontWeight: 700 }}>descalificadas
          ({flags.descalificadas}) y recicladas ({flags.recycles}) sin circuito</span> cuentan en su etapa
          pero quedan marcadas — el criterio de cerrar sin trabajar el contacto está pendiente de mapear.
          Con el filtro de fechas activo quedan fuera las campañas sin fecha de evento mapeada. Click en
          una fila para ver sus empresas.
        </div>
      </div>

      {/* Sección 2 — Scorecard por BDR (stats clickeables → drill por etapa) */}
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

function FunnelRow({ label, detalle, value, total, color, bold, href, indent }: {
  label: string; detalle: string; value: number; total: number; color: string; bold?: boolean; href: string; indent?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Link
      href={href}
      title={`Ver empresas: ${label}`}
      className="funnel-row-link"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "9px 0",
        borderBottom: "1px solid var(--border-tertiary)",
        color: "inherit",
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <div style={{ width: 260, flexShrink: 0, paddingLeft: indent ? 22 : 0 }}>
        <div style={{ fontSize: 13, fontWeight: bold ? 700 : 600 }}>
          {indent && <span style={{ color: "var(--fg-quaternary)", marginRight: 4 }}>↳</span>}
          {label} <span style={{ color: "var(--fg-quaternary)", fontSize: 11 }}>→</span>
        </div>
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
    </Link>
  );
}

// Card por BDR: cada stat es clickeable y abre un PREVIEW (5 empresas) de esa etapa.
// El nombre y el preview linkean a la subpágina de detalle de la persona.
function BdrCard({ bdr }: { bdr: { name: string; companies: SeguimientoCompany[]; etapas: Record<EtapaKey, number> } }) {
  // null = cerrado; "all" = todas las asignadas; EtapaKey = solo esa etapa.
  const [drill, setDrill] = useState<"all" | EtapaKey | null>(null);
  const sinBdr = bdr.name === SIN_BDR;
  const href = bdrDetailHref(bdr.name);

  const drillCompanies = useMemo(() => {
    if (!drill) return [];
    const list = drill === "all" ? bdr.companies : bdr.companies.filter((c) => c.etapa_funnel === drill);
    // Orden: etapa (según funnel) y luego fecha de asignación asc (las más viejas primero).
    return [...list].sort(
      (a, b) => etapaRank(a.etapa_funnel) - etapaRank(b.etapa_funnel) || (a.bdr_assigned_at ?? "").localeCompare(b.bdr_assigned_at ?? "")
    );
  }, [drill, bdr.companies]);

  function toggleDrill(next: "all" | EtapaKey) {
    setDrill((cur) => (cur === next ? null : next));
  }

  const drillLabel = drill && drill !== "all" ? ETAPAS.find((e) => e.key === drill)?.labelCorto : null;
  const preview = drillCompanies.slice(0, PREVIEW_LIMIT);
  const restantes = drillCompanies.length - preview.length;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <Link
          href={href}
          style={{
            minWidth: 160,
            fontSize: 14,
            fontWeight: 600,
            color: sinBdr ? "var(--fg-status-warning)" : "inherit",
            textDecoration: "none",
          }}
          title="Ver el detalle completo de esta persona"
        >
          {bdr.name} <span style={{ color: "var(--fg-quaternary)", fontSize: 12 }}>→</span>
        </Link>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap" }}>
          <BdrStat
            value={bdr.companies.length}
            label="Asignadas"
            color="var(--fg-primary)"
            active={drill === "all"}
            onClick={() => toggleDrill("all")}
          />
          {ETAPAS.map((e) => (
            <BdrStat
              key={e.key}
              value={bdr.etapas[e.key]}
              label={e.labelCorto}
              color={e.color}
              dimZero
              active={drill === e.key}
              onClick={() => toggleDrill(e.key)}
            />
          ))}
        </div>
      </div>

      {drill && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-tertiary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {drill === "all"
                ? `Preview · ${drillCompanies.length} empresa${drillCompanies.length === 1 ? "" : "s"} asignada${drillCompanies.length === 1 ? "" : "s"}`
                : `Preview · ${drillLabel} · ${drillCompanies.length} empresa${drillCompanies.length === 1 ? "" : "s"}`}
            </span>
            <button onClick={() => setDrill(null)} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--fg-status-info)" }}>
              Cerrar ▲
            </button>
          </div>
          {preview.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12, padding: 8 }}>Sin empresas en esta etapa.</div>
          ) : (
            preview.map((c, i) => <CompanyRow key={`${c.attio_company_id}-${c.campana_evento}-${i}`} c={c} showEtapa={drill === "all"} />)
          )}
          <div style={{ paddingTop: 10 }}>
            <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-status-brand)", textDecoration: "none" }}>
              {restantes > 0 ? `Ver las ${drillCompanies.length} en el detalle de ${bdr.name} →` : `Ver detalle completo de ${bdr.name} →`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Stat clickeable del BDR: resalta cuando su drill está abierto.
function BdrStat({ value, label, color, dimZero, active, onClick }: {
  value: number; label: string; color: string; dimZero?: boolean; active?: boolean; onClick: () => void;
}) {
  const dim = dimZero && value === 0;
  return (
    <button
      onClick={onClick}
      title={`Ver empresas: ${label}`}
      style={{
        all: "unset",
        cursor: "pointer",
        textAlign: "right",
        opacity: dim && !active ? 0.35 : 1,
        padding: "4px 8px",
        borderRadius: 8,
        background: active ? "var(--bg-secondary)" : "transparent",
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      <div className="stat-label" style={{ whiteSpace: "nowrap" }}>{label}</div>
    </button>
  );
}
