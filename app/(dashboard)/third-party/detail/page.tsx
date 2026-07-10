import Link from "next/link";
import { supabase, ThirdPartySummary, ThirdPartyCompany, ThirdPartyPerson, EventInvoice } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { attioCompanyUrl } from "@/lib/attio";
import { EventInvoices } from "@/app/event/[id]/EventInvoices";
import { ThirdPartyDetailEditors } from "../ThirdPartyDetailEditors";

export const dynamic = "force-dynamic";

const QM_STAGES = ["QM AGENDADA", "QM SHOW", "QM NO SHOW"];
function stageRank(s: string | null): number {
  if (s === "Cliente") return 0;
  if (QM_STAGES.includes(s ?? "")) return 1;
  if (["Procesando", "Procesada", "Con contacto", "Ready", "Not Started"].includes(s ?? "")) return 2;
  if (s === "PRE-QM - Oportunidad Marketing") return 3;
  if (["Lost", "Descalificada"].includes(s ?? "")) return 4;
  return 5;
}
function stageColors(s: string | null): { bg: string; fg: string } {
  if (s === "Cliente") return { bg: "var(--bg-status-success)", fg: "var(--fg-status-success)" };
  if (QM_STAGES.includes(s ?? "")) return { bg: "var(--bg-status-warning)", fg: "var(--fg-status-warning)" };
  if (["Lost", "Descalificada"].includes(s ?? "")) return { bg: "var(--bg-status-error)", fg: "var(--fg-status-error)" };
  if (["Procesando", "Procesada", "Con contacto", "PRE-QM - Oportunidad Marketing"].includes(s ?? ""))
    return { bg: "var(--bg-status-brand)", fg: "var(--fg-status-brand)" };
  return { bg: "var(--bg-secondary)", fg: "var(--fg-quaternary)" };
}

function inSlug(campana: string | null, slug: string): boolean {
  return (campana ?? "").split(",").map((s) => s.trim()).includes(slug);
}

export default async function ThirdPartyDetailPage({ searchParams }: { searchParams: Promise<{ ev?: string }> }) {
  const { ev } = await searchParams;
  const slug = ev ?? "";

  if (!slug) {
    return (
      <main className="dashboard-container">
        <p>Falta el evento.</p>
        <Link href="/third-party" className="link-back">&larr; Third Party</Link>
      </main>
    );
  }

  const [{ data: summaryRows }, { data: eventRow }, { data: companies }, { data: peopleRaw }, { data: invoiceRows }] = await Promise.all([
    supabase.from("fm_third_party_summary").select("*").eq("campana_evento", slug),
    supabase.from("fm_third_party_events").select("*").eq("campana_evento", slug).maybeSingle(),
    supabase.from("fm_third_party_companies_drill").select("*").eq("campana_evento", slug),
    supabase.from("fm_third_party_people").select("*").ilike("campana_evento", `%${slug}%`),
    supabase.from("fm_event_invoices").select("*").eq("luma_event_id", slug).order("created_at"),
  ]);

  const s = (summaryRows?.[0] ?? null) as ThirdPartySummary | null;
  const meta = (eventRow ?? null) as { evento_nombre: string | null; evento_fecha: string | null; pais: string | null; territorio: string | null; event_cost: number | null; event_income: number | null; ad_spend: number | null } | null;

  const nombre = s?.evento_nombre || meta?.evento_nombre || slug;
  const fecha = s?.evento_fecha || meta?.evento_fecha || null;
  const pais = s?.pais ?? meta?.pais ?? null;
  const territorio = s?.territorio ?? meta?.territorio ?? null;
  const eventCostBruto = Number(s?.event_cost ?? meta?.event_cost ?? 0);
  const eventIncome = Number(s?.event_income ?? meta?.event_income ?? 0);
  const adSpend = Number(s?.ad_spend ?? meta?.ad_spend ?? 0);

  const comps = (companies ?? []) as ThirdPartyCompany[];
  const people = ((peopleRaw ?? []) as ThirdPartyPerson[]).filter((p) => inSlug(p.campana_evento, slug));
  const invoices = (invoiceRows ?? []) as EventInvoice[];
  const gastos = invoices.filter((i) => i.tipo !== "ingreso");
  const ingresos = invoices.filter((i) => i.tipo === "ingreso");

  const qmFm = comps.filter((c) => QM_STAGES.includes(c.outbound_stage ?? "")).length;
  const qmShow = comps.filter((c) => c.outbound_stage === "QM SHOW").length;
  const qmNoShow = comps.filter((c) => c.outbound_stage === "QM NO SHOW").length;
  const directa = comps.filter((c) => c.qm_clasificacion === "directa").length;
  const influenciada = comps.filter((c) => c.qm_clasificacion === "influenciada").length;
  const sortedComps = [...comps].sort((a, b) => stageRank(a.outbound_stage) - stageRank(b.outbound_stage) || (a.company_name ?? "").localeCompare(b.company_name ?? ""));

  // Roles que asisten (por cargo).
  const roleCounts = new Map<string, number>();
  for (const p of people) { const r = (p.job_title ?? "").trim(); if (r) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1); }
  const roles = [...roleCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <main className="dashboard-container">
      <Link href="/third-party" className="link-back" style={{ display: "inline-block", marginBottom: 16 }}>&larr; Third Party</Link>

      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span className="badge badge-virtual">Third Party</span>
          {territorio && <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)" }}>{territorio}</span>}
          <span className="text-muted" style={{ fontSize: 12 }}>{fecha ?? "sin fecha"}{pais ? ` · ${pais}` : ""}</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{nombre}</h1>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>Nomenclatura: {slug}</p>
      </header>

      {/* Inputs manuales: costo / pauta / territorio */}
      <ThirdPartyDetailEditors
        slug={slug}
        eventCostBruto={eventCostBruto}
        eventIncome={eventIncome}
        adSpend={adSpend}
        pais={pais}
        territorio={territorio}
        hasGastoInvoices={gastos.length > 0}
      />

      {/* Facturas / ingresos */}
      <EventInvoices eventId={slug} invoices={gastos} tipo="gasto" variant="thirdparty" />
      <EventInvoices eventId={slug} invoices={ingresos} tipo="ingreso" variant="thirdparty" />

      {/* Personas / Registrados */}
      <div className="section-title">Personas</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        <Stat value={people.length} label="Registrados" sub="personas en el CRM (no hay inscriptos Luma)" />
        <Stat value={new Set(people.map((p) => p.company_name).filter(Boolean)).size} label="Empresas" />
        <Stat value={s?.won ?? 0} label="Won" color="var(--fg-status-info)" />
        <Stat value={formatCurrency(Number(s?.mrr_won ?? 0))} label="MRR" color="var(--fg-status-success)" />
      </div>

      {/* Pipeline empresas */}
      <div className="section-title">Pipeline Empresas</div>
      <div className="card" style={{ marginBottom: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
        <PipeStat value={qmFm} label="QM FM" color="var(--fg-status-warning)" />
        <PipeStat value={directa} label="QM Directa" />
        <PipeStat value={influenciada} label="QM Influenciada" />
        <PipeStat value={qmShow} label="QM Show" />
        <PipeStat value={qmNoShow} label="QM No Show" />
      </div>
      <div className="card" style={{ marginBottom: 28 }}>
        {sortedComps.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13, padding: 8 }}>No hay empresas asociadas todavía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sortedComps.map((c, i) => {
              const col = stageColors(c.outbound_stage);
              return (
                <div key={`${c.attio_company_id}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-tertiary)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company_name ?? "— sin nombre —"}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{[c.industria, c.pais].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {c.tiene_won && <span className="badge" style={{ background: "var(--bg-status-success)", color: "var(--fg-status-success)" }}>Cliente / Won</span>}
                    {c.qm_clasificacion && <span className="text-muted" style={{ fontSize: 10 }}>{c.qm_clasificacion === "directa" ? "QM Directa" : "QM Influenciada"}</span>}
                    <span className="badge" style={{ background: col.bg, color: col.fg, fontSize: 11 }}>{c.outbound_stage || "sin stage"}</span>
                    {c.attio_company_id && <a href={attioCompanyUrl(c.attio_company_id) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--fg-status-info)" }}>Attio ↗</a>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roles que asisten */}
      {roles.length > 0 && (
        <>
          <div className="section-title">Roles que asisten</div>
          <div className="card" style={{ marginBottom: 28, display: "flex", flexDirection: "column", gap: 4 }}>
            {roles.map(([role, n]) => (
              <div key={role} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border-tertiary)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role}</span>
                <span style={{ fontWeight: 700 }}>{n}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Fuente de datos: personas */}
      <div className="section-title">Fuente de datos ({people.length} personas)</div>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                {["Nombre", "Apellido", "Empresa", "Dominio", "Cargo", "Email", "Teléfono", "Origen", "Campaña/Evento"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 16, textAlign: "center" }} className="text-muted">Sin personas.</td></tr>
              ) : (
                people.map((p) => (
                  <tr key={p.attio_person_id} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                    <td style={tdStyle}>{p.first_name ?? (p.full_name ?? "—")}</td>
                    <td style={tdStyle}>{p.last_name ?? "—"}</td>
                    <td style={tdStyle}>{p.company_name ?? "—"}</td>
                    <td style={tdStyle}>{p.company_domain ?? "—"}</td>
                    <td style={tdStyle}>{p.job_title ?? "—"}</td>
                    <td style={tdStyle}>{p.email ?? "—"}</td>
                    <td style={tdStyle}>{p.phone ?? "—"}</td>
                    <td style={tdStyle}>{p.origen_invitacion ?? "—"}</td>
                    <td style={tdStyle}>{p.campana_evento ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Stat({ value, label, sub, color }: { value: string | number; label: string; sub?: string; color?: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 24, fontWeight: 700, ...(color ? { color } : {}) }}>{value}</div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
      {sub && <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function PipeStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 20, fontWeight: 700, ...(color ? { color } : {}) }}>{value}</div>
      <div className="text-muted" style={{ fontSize: 10 }}>{label}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 10, fontWeight: 600, color: "var(--fg-quaternary)", textTransform: "uppercase", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle", whiteSpace: "nowrap" };
