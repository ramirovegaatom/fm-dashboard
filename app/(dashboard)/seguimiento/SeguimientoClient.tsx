"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SeguimientoCompany } from "@/lib/supabase";
import { DateFilter, type DateRange } from "@/components/DateFilter";
import { SIN_BDR, ETAPAS, etapaRank, CompanyRow, type EtapaKey } from "./shared";

// Spec del equipo + iteraciones José (2026-07-16/17): funnel por Outbound Stage VALIDADO
// por actividades reales, scorecard por BDR con desglose por etapa, filtro de campaña con
// búsqueda, filtro multi-select de BDRs. Las stats de cada BDR abren un PREVIEW corto
// (5 empresas); el detalle completo vive en la subpágina /seguimiento/bdr?name=…
// "Procesada por actividad" = estructura estricta por contacto: 3 llamadas + 2 WhatsApp
// o 3 WhatsApp + 2 llamadas. Clientes (lifecycle Customer) excluidos en la vista SQL.
const PREVIEW_LIMIT = 5;

function bdrDetailHref(name: string) {
  return `/seguimiento/bdr?name=${encodeURIComponent(name)}`;
}

// Detalle de una etapa del funnel general (José 2026-07-17). Propaga la campaña activa.
function etapaHref(key: EtapaKey | "todas", campana: string) {
  const params = new URLSearchParams({ e: key });
  if (campana !== "todas") params.set("campana", campana);
  return `/seguimiento/etapa?${params.toString()}`;
}

export function SeguimientoClient({ companies }: { companies: SeguimientoCompany[] }) {
  const [campana, setCampana] = useState<string>("todas");
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

  const campanas = useMemo(() => {
    const set = new Set<string>();
    byDate.forEach((c) => set.add(c.campana_evento));
    return [...set].sort();
  }, [byDate]);

  const byCampana = useMemo(
    () => (campana === "todas" ? byDate : byDate.filter((c) => c.campana_evento === campana)),
    [byDate, campana]
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
        Avance de las <strong>empresas generadas por marketing</strong> (eventos y webinars) a través del
        embudo comercial, y desempeño de los <strong>BDRs</strong> en su procesamiento. Etapas basadas en el{" "}
        <strong>Outbound Stage</strong> de Attio validado con las <strong>actividades reales</strong> (llamadas
        y WhatsApp registrados por contacto). Las empresas que ya son clientes (Lifecycle Stage ={" "}
        <strong>Customer</strong>) no se cuentan.
      </div>

      {/* Filtros: campaña (búsqueda) + BDRs (multi-select) + fechas (Q/mes/custom) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <CampanaSearch campanas={campanas} value={campana} onChange={setCampana} />
        <BdrMultiSelect options={bdrOptions} selected={bdrsSel} onChange={setBdrsSel} />
        <DateFilter value={dateRange} onChange={setDateRange} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          {asignadas} empresas asignadas
          {campana !== "todas" ? " · campaña filtrada" : ""}
          {bdrsSel.size > 0 ? ` · ${bdrsSel.size} BDR${bdrsSel.size === 1 ? "" : "s"}` : ""}
          {(dateRange.from || dateRange.to) ? " · por fecha del evento" : ""}
        </span>
      </div>

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
          href={etapaHref("todas", campana)}
        />
        {ETAPAS.map((e) => (
          <FunnelRow
            key={e.key}
            label={e.label}
            detalle={e.detalle}
            value={funnel[e.key]}
            total={asignadas}
            color={e.color}
            href={etapaHref(e.key, campana)}
          />
        ))}
        <div className="text-muted" style={{ fontSize: 10, marginTop: 10 }}>
          La fuente de verdad de “Sin procesar / Procesando / Procesada” son las <strong>actividades
          reales</strong> (llamadas y WhatsApp por contacto), no el stage manual de Attio. Lost cuenta
          como resultado negativo dentro de “Procesada”. Las empresas marcadas “Procesada” en Attio sin
          la estructura de actividades aparecen en su etapa real con la alerta{" "}
          <span style={{ color: "var(--fg-status-warning)", fontWeight: 700 }}>⚠ sin actividades</span>.
          Con el filtro de fechas activo quedan fuera las campañas sin fecha de evento mapeada. Click en
          una etapa para ver sus empresas.
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

// Combobox de campaña con búsqueda (60+ campañas no escalan en un select pelado).
function CampanaSearch({ campanas, value, onChange }: { campanas: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const matches = useMemo(
    () => campanas.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase())),
    [campanas, query]
  );

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  const isActive = value !== "todas";
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen((o) => !o)} style={filterBtnStyle(isActive)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isActive ? value : `Todas las campañas (${campanas.length})`}
        </span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div style={dropdownStyle}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar evento…"
            style={searchInputStyle}
          />
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <DropdownItem label={`Todas las campañas (${campanas.length})`} selected={value === "todas"} onClick={() => pick("todas")} />
            {matches.map((c) => (
              <DropdownItem key={c} label={c} selected={value === c} onClick={() => pick(c)} />
            ))}
            {matches.length === 0 && (
              <div className="text-muted" style={{ fontSize: 12, padding: "8px 10px" }}>Sin resultados para “{query}”.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-select de BDRs con búsqueda: elegís qué personas se ven en la vista.
// Selección vacía = todos. José 2026-07-17.
function BdrMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { name: string; count: number }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const matches = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query]
  );

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  }

  const isActive = selected.size > 0;
  const label = !isActive
    ? `Todos los BDRs (${options.length})`
    : selected.size === 1
    ? [...selected][0]
    : `${selected.size} BDRs seleccionados`;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen((o) => !o)} style={filterBtnStyle(isActive)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div style={dropdownStyle}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar BDR…"
            style={searchInputStyle}
          />
          {isActive && (
            <button
              onClick={() => onChange(new Set())}
              style={{ all: "unset", cursor: "pointer", display: "block", padding: "4px 10px 8px", fontSize: 11, fontWeight: 600, color: "var(--fg-status-info)" }}
            >
              Limpiar selección (ver todos)
            </button>
          )}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {matches.map((o) => {
              const checked = selected.has(o.name);
              return (
                <button
                  key={o.name}
                  onClick={() => toggle(o.name)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    width: "calc(100% - 20px)",
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: checked ? 700 : 500,
                    borderRadius: 8,
                    background: checked ? "var(--bg-secondary)" : "transparent",
                    color: "var(--fg-primary)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                        border: checked ? "none" : "1.5px solid var(--border-tertiary)",
                        background: checked ? "var(--fg-primary)" : "transparent",
                        color: "var(--bg-primary)",
                        fontSize: 10, lineHeight: "14px", textAlign: "center", fontWeight: 700,
                      }}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    {o.name}
                  </span>
                  <span className="text-muted" style={{ fontSize: 11, flexShrink: 0 }}>{o.count}</span>
                </button>
              );
            })}
            {matches.length === 0 && (
              <div className="text-muted" style={{ fontSize: 12, padding: "8px 10px" }}>Sin resultados para “{query}”.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownItem({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "7px 10px",
        fontSize: 12,
        fontWeight: selected ? 700 : 500,
        borderRadius: 8,
        border: "none",
        background: selected ? "var(--bg-secondary)" : "transparent",
        color: "var(--fg-primary)",
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {selected ? "✓ " : ""}{label}
    </button>
  );
}

function FunnelRow({ label, detalle, value, total, color, bold, href }: {
  label: string; detalle: string; value: number; total: number; color: string; bold?: boolean; href: string;
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
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: bold ? 700 : 600 }}>
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

const filterBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: active ? "var(--fg-primary)" : "var(--bg-primary)",
  color: active ? "var(--bg-primary)" : "var(--fg-secondary)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  maxWidth: 380,
});

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 50,
  width: 340,
  background: "var(--bg-primary)",
  border: "1px solid var(--border-tertiary)",
  borderRadius: 12,
  boxShadow: "0px 8px 24px rgba(9,9,11,0.12)",
  padding: 8,
};

const searchInputStyle: React.CSSProperties = {
  width: "calc(100% - 20px)",
  padding: "7px 10px",
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-secondary)",
  color: "var(--fg-primary)",
  outline: "none",
  marginBottom: 6,
};
