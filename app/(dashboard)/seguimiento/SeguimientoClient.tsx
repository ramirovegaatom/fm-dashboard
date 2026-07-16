"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SeguimientoCompany } from "@/lib/supabase";
import { attioCompanyUrl } from "@/lib/attio";

// Spec del equipo + iteración José (2026-07-16): funnel por Outbound Stage VALIDADO por
// actividades reales (tabla activities), scorecard por BDR con desglose por etapa, filtro
// de campaña con búsqueda, DropOff como etapa, y clientes (lifecycle Customer) descartados.
// "Procesada por actividad" = estructura estricta por contacto: 3 llamadas + 2 WhatsApp
// o 3 WhatsApp + 2 llamadas. El stage 'Procesada' solo NO alcanza (control de gestión).
type EtapaKey = SeguimientoCompany["etapa_funnel"];

const ETAPAS: { key: EtapaKey; label: string; labelCorto: string; detalle: string; color: string }[] = [
  { key: "sin_prospectar", label: "Sin prospectar", labelCorto: "Sin prospectar", detalle: "PRE-QM + sin actividad (vacío, Ready, Not Started)", color: "var(--fg-status-error)" },
  { key: "siendo_prospectada", label: "Siendo prospectadas", labelCorto: "Prospectando", detalle: "Con contacto, Procesando, o con actividades iniciadas", color: "var(--fg-status-info)" },
  { key: "procesada", label: "Procesadas", labelCorto: "Procesadas", detalle: "Lost + procesada por actividad (3 llamadas + 2 WhatsApp o 3 WhatsApp + 2 llamadas por contacto)", color: "var(--fg-secondary)" },
  { key: "respuesta_positiva", label: "Respuesta positiva", labelCorto: "Resp. positiva", detalle: "QM Agendada, QM Show, QM No Show", color: "var(--fg-status-success)" },
  { key: "dropoff", label: "DropOff", labelCorto: "DropOff", detalle: "Descalificadas (no ICP) + Recycle", color: "var(--fg-status-warning)" },
];

export function SeguimientoClient({ companies }: { companies: SeguimientoCompany[] }) {
  const [campana, setCampana] = useState<string>("todas");

  const campanas = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => set.add(c.campana_evento));
    return [...set].sort();
  }, [companies]);

  const filtered = useMemo(
    () => (campana === "todas" ? companies : companies.filter((c) => c.campana_evento === campana)),
    [companies, campana]
  );

  const funnel = useMemo(() => {
    const counts: Record<EtapaKey, number> = { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, dropoff: 0 };
    for (const c of filtered) counts[c.etapa_funnel]++;
    return counts;
  }, [filtered]);

  const asignadas = filtered.length;

  // Scorecard por BDR: asignadas + desglose por etapa (spec José: "47 asignadas - 5 sin
  // prospectar - Prospectando - DropOff - respuesta positiva") + drill de sin prospectar.
  const bdrs = useMemo(() => {
    const map = new Map<string, { name: string; asignadas: number; etapas: Record<EtapaKey, number>; sinProspectar: SeguimientoCompany[] }>();
    for (const c of filtered) {
      const key = c.assigned_bdr_name ?? "— Sin BDR asignado —";
      const entry = map.get(key) ?? {
        name: key,
        asignadas: 0,
        etapas: { sin_prospectar: 0, siendo_prospectada: 0, procesada: 0, respuesta_positiva: 0, dropoff: 0 },
        sinProspectar: [],
      };
      entry.asignadas++;
      entry.etapas[c.etapa_funnel]++;
      if (c.etapa_funnel === "sin_prospectar") entry.sinProspectar.push(c);
      map.set(key, entry);
    }
    for (const e of map.values()) {
      e.sinProspectar.sort((a, b) => (a.bdr_assigned_at ?? "").localeCompare(b.bdr_assigned_at ?? ""));
    }
    return [...map.values()].sort((a, b) => {
      const aNull = a.name.startsWith("—") ? 1 : 0;
      const bNull = b.name.startsWith("—") ? 1 : 0;
      return aNull - bNull || b.asignadas - a.asignadas;
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

      {/* Filtro por campaña con búsqueda (feedback José #1) */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <CampanaSearch campanas={campanas} value={campana} onChange={setCampana} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          {asignadas} empresas asignadas{campana !== "todas" ? " en esta campaña" : " en total"}
        </span>
      </div>

      {/* Sección 1 — Funnel general */}
      <div className="section-title">Funnel general</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <FunnelRow label="Asignadas" detalle="empresas totales según la campaña (sin clientes)" value={asignadas} total={asignadas} color="var(--fg-primary)" bold />
        {ETAPAS.map((e) => (
          <FunnelRow key={e.key} label={e.label} detalle={e.detalle} value={funnel[e.key]} total={asignadas} color={e.color} />
        ))}
        <div className="text-muted" style={{ fontSize: 10, marginTop: 10 }}>
          Lost cuenta como resultado negativo dentro de “Procesadas”. El stage “Procesada” de Attio se
          valida contra actividad real: sin la estructura mínima de actividades, la empresa cuenta como
          “Siendo prospectada” (o “Sin prospectar” si no tiene actividad).
        </div>
      </div>

      {/* Sección 2 — Scorecard por BDR */}
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

// Combobox de campaña con búsqueda (el dropdown pelado no escala a 60+ campañas).
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
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid var(--border-tertiary)",
          background: isActive ? "var(--fg-primary)" : "var(--bg-primary)",
          color: isActive ? "var(--bg-primary)" : "var(--fg-secondary)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          maxWidth: 380,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isActive ? value : `Todas las campañas (${campanas.length})`}
        </span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            width: 360,
            background: "var(--bg-primary)",
            border: "1px solid var(--border-tertiary)",
            borderRadius: 12,
            boxShadow: "0px 8px 24px rgba(9,9,11,0.12)",
            padding: 8,
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar evento…"
            style={{
              width: "100%",
              padding: "7px 10px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: "var(--bg-secondary)",
              color: "var(--fg-primary)",
              outline: "none",
              marginBottom: 6,
            }}
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

function FunnelRow({ label, detalle, value, total, color, bold }: {
  label: string; detalle: string; value: number; total: number; color: string; bold?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--border-tertiary)" }}>
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: bold ? 700 : 600 }}>{label}</div>
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
    </div>
  );
}

function BdrCard({ bdr }: { bdr: { name: string; asignadas: number; etapas: Record<EtapaKey, number>; sinProspectar: SeguimientoCompany[] } }) {
  const [open, setOpen] = useState(false);
  const sinBdr = bdr.name.startsWith("—");
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 160, fontSize: 14, fontWeight: 600, color: sinBdr ? "var(--fg-status-warning)" : undefined }}>
          {bdr.name}
        </div>
        {/* Desglose por etapa (feedback José #6) */}
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <BdrStat value={bdr.asignadas} label="Asignadas" color="var(--fg-primary)" />
          {ETAPAS.map((e) => (
            <BdrStat key={e.key} value={bdr.etapas[e.key]} label={e.labelCorto} color={e.color} dimZero />
          ))}
          <button
            onClick={() => setOpen((o) => !o)}
            disabled={bdr.sinProspectar.length === 0}
            style={{
              all: "unset",
              cursor: bdr.sinProspectar.length === 0 ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: bdr.sinProspectar.length === 0 ? "var(--fg-quaternary)" : "var(--fg-status-info)",
              minWidth: 100,
              textAlign: "right",
            }}
          >
            {bdr.sinProspectar.length === 0 ? "Al día ✓" : open ? "Ocultar ▲" : "Ver empresas ▼"}
          </button>
        </div>
      </div>

      {open && bdr.sinProspectar.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-tertiary)" }}>
          <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>
            Empresas sin prospectar (con su fecha de asignación):
          </div>
          {bdr.sinProspectar.map((c, i) => (
            <div
              key={`${c.attio_company_id}-${i}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border-tertiary)" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.company_name ?? "— sin nombre —"}
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>{c.campana_evento}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)", fontSize: 10 }}>
                  {c.outbound_stage ?? "sin stage"}
                </span>
                <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {c.bdr_assigned_at
                    ? `asignada el ${new Date(c.bdr_assigned_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}`
                    : "sin fecha de asignación"}
                </span>
                {c.attio_company_id && (
                  <a
                    href={attioCompanyUrl(c.attio_company_id) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "var(--fg-status-info)", textDecoration: "none" }}
                  >
                    Attio ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BdrStat({ value, label, color, dimZero }: { value: number; label: string; color: string; dimZero?: boolean }) {
  const dim = dimZero && value === 0;
  return (
    <div style={{ textAlign: "right", opacity: dim ? 0.35 : 1 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      <div className="stat-label" style={{ whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}
