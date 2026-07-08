"use client";

import { useMemo, useState, useTransition } from "react";
import { ThirdPartySummary, ThirdPartyCompany } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { attioCompanyUrl } from "@/lib/attio";
import { saveThirdPartyEvent, setThirdPartyHidden } from "./actions";

// 2026-07-07 (Jose): eventos third-party (no-Luma). Se miden por Origen de invitación =
// Thirdparty en Attio. NO tienen asistencia/ICP (no pasan por Luma) — solo seguimiento:
// personas/empresas cargadas → QM → negocios. Nombre/fecha/país los carga José a mano.
// 2026-07-08 (Jose): el QM por empresa y el detalle salen del tag Campaña/Evento del objeto
// Company en Attio (fm_third_party_companies_drill), no de la lista events_companies.
export function ThirdPartyClient({
  events,
  companiesBySlug,
}: {
  events: ThirdPartySummary[];
  companiesBySlug: Record<string, ThirdPartyCompany[]>;
}) {
  const totals = useMemo(() => {
    return {
      eventos: events.length,
      personas: events.reduce((a, e) => a + Number(e.personas_cargadas ?? 0), 0),
      empresas: events.reduce((a, e) => a + Number(e.empresas_cargadas ?? 0), 0),
      qmFm: events.reduce((a, e) => a + Number(e.qm_por_fm ?? 0), 0),
      won: events.reduce((a, e) => a + Number(e.won ?? 0), 0),
      mrr: events.reduce((a, e) => a + Number(e.mrr_won ?? 0), 0),
    };
  }, [events]);

  return (
    <div>
      <div
        className="card"
        style={{ marginBottom: 20, background: "var(--bg-secondary)", fontSize: 12, color: "var(--fg-secondary)" }}
      >
        Eventos <strong>third-party</strong> (ferias/eventos de terceros, no pasan por Luma). Identificados
        por <strong>Origen de invitación = Thirdparty</strong> en Attio + su campaña. No se mide asistencia
        ni ICP — solo seguimiento: personas/empresas cargadas → QM → negocios. El estado de cada empresa
        sale del tag <strong>Campaña/Evento</strong> en Attio. Cargá nombre/fecha/país de cada evento; ocultá los slugs de prueba.
      </div>

      {/* Totales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
        <Total label="Eventos" value={totals.eventos} />
        <Total label="Personas" value={totals.personas} />
        <Total label="Empresas" value={totals.empresas} />
        <Total label="QM FM" value={totals.qmFm} color="var(--fg-status-warning)" />
        <Total label="Won" value={totals.won} color="var(--fg-status-info)" />
        <Total label="MRR" value={formatCurrency(totals.mrr)} color="var(--fg-status-success)" />
      </div>

      {events.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 13, padding: 20, textAlign: "center" }}>
          No hay eventos third-party sincronizados todavía. Cuando se carguen personas con Origen de
          invitación = Thirdparty en Attio, aparecen acá.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((e) => (
            <ThirdPartyRow key={e.campana_evento} e={e} companies={companiesBySlug[e.campana_evento] ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function Total({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="stat-value" style={{ fontSize: 22, ...(color ? { color } : {}) }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 64 }}>
      <div style={{ fontSize: 16, fontWeight: 700, ...(color ? { color } : {}) }}>{value}</div>
      <div className="text-muted" style={{ fontSize: 10 }}>{label}</div>
    </div>
  );
}

// Prioridad de orden + color por outbound_stage. Jose 2026-07-08.
const QM_STAGES = ["QM AGENDADA", "QM SHOW", "QM NO SHOW"];
function stageRank(stage: string | null): number {
  if (stage === "Cliente") return 0;
  if (QM_STAGES.includes(stage ?? "")) return 1;
  if (["Procesando", "Procesada", "Con contacto", "Ready", "Not Started"].includes(stage ?? "")) return 2;
  if (stage === "PRE-QM - Oportunidad Marketing") return 3;
  if (["Lost", "Descalificada"].includes(stage ?? "")) return 4;
  return 5; // sin stage
}
function stageColors(stage: string | null): { bg: string; fg: string } {
  if (stage === "Cliente") return { bg: "var(--bg-status-success)", fg: "var(--fg-status-success)" };
  if (QM_STAGES.includes(stage ?? "")) return { bg: "var(--bg-status-warning)", fg: "var(--fg-status-warning)" };
  if (["Lost", "Descalificada"].includes(stage ?? "")) return { bg: "var(--bg-status-error)", fg: "var(--fg-status-error)" };
  if (["Procesando", "Procesada", "Con contacto", "PRE-QM - Oportunidad Marketing"].includes(stage ?? ""))
    return { bg: "var(--bg-status-brand)", fg: "var(--fg-status-brand)" };
  return { bg: "var(--bg-secondary)", fg: "var(--fg-quaternary)" };
}

function ThirdPartyRow({ e, companies }: { e: ThirdPartySummary; companies: ThirdPartyCompany[] }) {
  const [open, setOpen] = useState(false);
  const [showCompanies, setShowCompanies] = useState(false);
  const [nombre, setNombre] = useState(e.evento_nombre ?? "");
  const [fecha, setFecha] = useState(e.evento_fecha ?? "");
  const [pais, setPais] = useState(e.pais ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await saveThirdPartyEvent(e.campana_evento, {
        evento_nombre: nombre,
        evento_fecha: fecha || null,
        pais,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleHide() {
    startTransition(async () => {
      await setThirdPartyHidden(e.campana_evento, true);
    });
  }

  const title = e.evento_nombre || e.campana_evento;
  const sinStage = companies.filter((c) => !c.outbound_stage).length;
  const sortedCompanies = [...companies].sort(
    (a, b) => stageRank(a.outbound_stage) - stageRank(b.outbound_stage) || (a.company_name ?? "").localeCompare(b.company_name ?? "")
  );

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          <div className="text-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>
            {e.campana_evento}
            {e.evento_fecha ? ` · ${e.evento_fecha}` : ""}
            {e.pais ? ` · ${e.pais}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Metric label="Personas" value={e.personas_cargadas} />
          <Metric label="Empresas" value={e.empresas_cargadas} />
          <Metric label="QM FM" value={e.qm_por_fm} color="var(--fg-status-warning)" />
          <Metric label="QM asist." value={e.qm_asistida} />
          <Metric label="Demo" value={e.demo} />
          <Metric label="Won" value={e.won} color="var(--fg-status-info)" />
          <Metric label="MRR" value={formatCurrency(Number(e.mrr_won))} color="var(--fg-status-success)" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <button
            onClick={() => setShowCompanies((o) => !o)}
            style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--fg-status-brand)" }}
          >
            {showCompanies ? "Ocultar empresas" : `Ver empresas (${companies.length})`}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--fg-status-info)" }}
          >
            {open ? "Cerrar" : "Editar datos"}
          </button>
        </div>
      </div>

      {/* Detalle por empresa (Jose 2026-07-08) */}
      {showCompanies && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-tertiary)" }}>
          {sortedCompanies.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12, padding: 8 }}>
              No hay empresas asociadas todavía.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {sortedCompanies.map((c, i) => {
                const col = stageColors(c.outbound_stage);
                return (
                  <div
                    key={`${c.attio_company_id}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border-tertiary)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.company_name ?? "— sin nombre —"}
                      </div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        {[c.industria, c.pais].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {c.tiene_won && (
                        <span className="badge" style={{ background: "var(--bg-status-success)", color: "var(--fg-status-success)" }}>
                          Cliente / Won
                        </span>
                      )}
                      {c.qm_clasificacion && (
                        <span className="text-muted" style={{ fontSize: 10 }}>
                          {c.qm_clasificacion === "directa" ? "QM Directa" : "QM Influenciada"}
                        </span>
                      )}
                      <span
                        className="badge"
                        style={{ background: col.bg, color: col.fg, fontSize: 11 }}
                      >
                        {c.outbound_stage || "sin stage"}
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
                );
              })}
              {sinStage > 0 && (
                <div className="text-muted" style={{ fontSize: 10, marginTop: 8 }}>
                  ⚠️ {sinStage} empresa{sinStage === 1 ? "" : "s"} sin stage: taguealas con la Campaña/Evento
                  <code style={{ margin: "0 4px" }}>{e.campana_evento}</code> en Attio (objeto Company) para ver su proceso.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-tertiary)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Nombre del evento">
            <input value={nombre} onChange={(ev) => setNombre(ev.target.value)} style={inputStyle} placeholder="Ej: Congreso Assovemg" />
          </Field>
          <Field label="Fecha">
            <input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} style={inputStyle} />
          </Field>
          <Field label="País">
            <input value={pais} onChange={(ev) => setPais(ev.target.value)} style={inputStyle} placeholder="Brasil" />
          </Field>
          <button
            onClick={handleSave}
            disabled={isPending}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: saved ? "var(--bg-status-success)" : "var(--bg-inverse-primary)",
              color: saved ? "var(--fg-status-success)" : "var(--fg-inverse-primary)",
              cursor: isPending ? "wait" : "pointer",
            }}
          >
            {isPending ? "..." : saved ? "Guardado" : "Guardar"}
          </button>
          <button
            onClick={handleHide}
            disabled={isPending}
            title="Ocultar este slug (basura / prueba)"
            style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "var(--fg-status-error)" }}
          >
            Ocultar slug
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  border: "1px solid var(--border-tertiary)",
  borderRadius: 8,
  background: "var(--bg-secondary)",
  color: "var(--fg-primary)",
  outline: "none",
};
