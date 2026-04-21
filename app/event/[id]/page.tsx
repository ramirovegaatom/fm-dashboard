import { Fragment } from "react";
import { supabase, EventSummary, SourceBreakdown, RoleBreakdown, QmBySource, CompanyDrill, DealDrill } from "@/lib/supabase";
import Link from "next/link";
import { AdSpendInput } from "./AdSpendInput";
import { RolesChart } from "./RolesChart";
import { PipelineDrill } from "./PipelineDrill";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function Stat({ value, label, color, sub }: { value: string | number; label: string; color?: string; sub?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  Performance: "var(--fg-status-info)",
  Partner: "var(--chart-partner)",
  Outbound: "var(--fg-status-warning)",
  "Account Executive": "var(--chart-ae)",
  "Email Marketing": "var(--chart-email)",
  "Directo/Org\u00e1nico": "var(--fg-quaternary)",
  WhatsApp: "var(--fg-status-success)",
  LinkedIn: "var(--chart-linkedin)",
  "BDR Individual": "var(--fg-status-brand)",
};

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: events }, { data: sources }, { data: roles }, { data: qmSources }, { data: companiesDrill }, { data: dealsDrill }] = await Promise.all([
    supabase.from("fm_dashboard").select("*").eq("luma_event_id", id),
    supabase.from("fm_source_breakdown").select("*").eq("luma_event_id", id).order("registros", { ascending: false }),
    supabase.from("fm_roles_breakdown").select("*").eq("luma_event_id", id).order("total", { ascending: false }),
    supabase.from("fm_qm_by_source").select("*").eq("luma_event_id", id).order("empresas_qm", { ascending: false }),
    supabase.from("fm_event_companies_drill").select("*").eq("luma_event_id", id),
    supabase.from("fm_event_deals_drill").select("*").eq("luma_event_id", id),
  ]);

  const e = (events?.[0] ?? null) as EventSummary | null;
  const srcData = (sources ?? []) as SourceBreakdown[];
  const roleData = (roles ?? []) as RoleBreakdown[];
  const qmData = (qmSources ?? []).filter((q: QmBySource) => q.empresas_qm > 0 || q.empresas_gestion > 0) as QmBySource[];
  const companiesData = (companiesDrill ?? []) as CompanyDrill[];
  const dealsData = (dealsDrill ?? []) as DealDrill[];

  if (!e) {
    return (
      <main className="dashboard-container">
        <p>Evento no encontrado.</p>
        <Link href="/" className="link-back">&larr; Volver</Link>
      </main>
    );
  }

  const maxSrc = Math.max(...srcData.map((s) => s.registros), 1);

  return (
    <main className="dashboard-container">
      <Link href="/" className="link-back" style={{ display: "inline-block", marginBottom: 16 }}>&larr; Todos los eventos</Link>

      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className={`badge ${e.evento_tipo === "Presencial" ? "badge-presencial" : "badge-virtual"}`}>
            {e.evento_tipo}
          </span>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {formatDate(e.evento_fecha)}
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{e.evento_nombre}</h1>
        {e.evento_ubicacion && (
          <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>{e.evento_ubicacion}</p>
        )}
      </header>

      {/* Personas */}
      <div className="section-title">Personas</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        <Stat value={e.total_registros} label="Registros" />
        <Stat value={e.total_asistentes || e.total_joined_virtual || "\u2014"} label="Asistentes" />
        <Stat
          value={`${e.tasa_conversion_pct ?? 0}%`}
          label="Tasa asistencia"
          color={Number(e.tasa_conversion_pct) > 30 ? "var(--fg-status-success)" : Number(e.tasa_conversion_pct) > 15 ? "var(--fg-status-warning)" : "var(--fg-status-error)"}
        />
        <Stat
          value={`${e.icp_real_pct ?? 0}%`}
          label="ICP real"
          color="var(--fg-status-success)"
          sub={`${e.total_icp_real ?? 0} ICP · ${e.total_aprobados_icp} aprobados Luma (${e.icp_pct}%)`}
        />
      </div>

      {/* Pipeline Empresas */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Pipeline Empresas</div>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 16,
          background: Number(e.pct_matched) > 70 ? "var(--bg-status-success)" : Number(e.pct_matched) > 40 ? "var(--bg-status-warning)" : "var(--bg-status-error)",
          color: Number(e.pct_matched) > 70 ? "var(--fg-status-success)" : Number(e.pct_matched) > 40 ? "var(--fg-status-warning)" : "var(--fg-status-error)",
        }}>
          {e.pct_matched}% matcheados ({e.total_con_empresa}/{e.total_registros})
        </span>
      </div>
      <PipelineDrill event={e} companies={companiesData} deals={dealsData} />

      {/* QMs by Source */}
      {qmData.length > 0 && (
        <>
          <div className="section-title">QMs por Fuente de Invitaci&oacute;n</div>
          <div className="card" style={{ marginBottom: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(3, auto)", gap: "8px 24px", fontSize: 12, alignItems: "center" }}>
              <div className="text-muted" style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>Fuente</div>
              <div className="text-muted" style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase", textAlign: "right" }}>Empresas</div>
              <div className="text-muted" style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase", textAlign: "right" }}>En gesti&oacute;n</div>
              <div className="text-muted" style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase", textAlign: "right" }}>QMs</div>
              {qmData.map((q, i) => (
                <Fragment key={`qm-${q.source_group}-${i}`}>
                  <div style={{ fontWeight: 500 }}>{q.source_group}</div>
                  <div style={{ textAlign: "right" }}>{q.empresas_matcheadas}</div>
                  <div style={{ textAlign: "right" }}>{q.empresas_gestion}</div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: q.empresas_qm > 0 ? "var(--fg-status-warning)" : "inherit" }}>{q.empresas_qm}</div>
                </Fragment>
              ))}
            </div>
            <div className="text-muted" style={{ fontSize: 10, marginTop: 12, borderTop: "1px solid var(--border-tertiary)", paddingTop: 8 }}>
              Basado en registros matcheados con empresa ({e.pct_matched}% cobertura)
            </div>
          </div>
        </>
      )}

      {/* Sources + Performance grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        {/* Sources */}
        <div>
          <div className="section-title">Fuentes de Invitaci&oacute;n</div>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {srcData.map((s) => (
              <div key={s.source_normalized}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{s.source_normalized}</span>
                  <span className="text-muted">
                    {s.registros} reg &middot; {s.asistentes} asist &middot; {s.aprobados_icp_real ?? 0} ICP ({s.aprobados_icp} Luma)
                  </span>
                </div>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(s.registros / maxSrc) * 100}%`,
                      background: SOURCE_COLORS[s.source_normalized] ?? "var(--fg-quaternary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance */}
        <div>
          <div className="section-title">Performance (Pauta)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Stat value={e.registros_performance} label="Registros" color="var(--fg-status-info)" />
            <Stat value={e.asistentes_performance} label="Asistentes" color="var(--fg-status-info)" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="card">
              <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>% asistencia pauta</div>
              <div className="text-info" style={{ fontSize: 24, fontWeight: 700 }}>
                {e.pct_asistencia_performance ?? "\u2014"}%
              </div>
              <div className="bar" style={{ marginTop: 8 }}>
                <div className="bar-fill" style={{ width: `${e.pct_asistencia_performance ?? 0}%`, background: "var(--fg-status-info)" }} />
              </div>
            </div>
            <AdSpendInput eventId={e.luma_event_id} currentValue={Number(e.ad_spend)} />
            {e.costo_por_registro && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Costo por registro</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>${e.costo_por_registro}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Roles */}
      <div className="section-title">Roles que m&aacute;s asisten</div>
      <RolesChart roles={roleData} />
    </main>
  );
}
