import { supabase, EventSummary } from "@/lib/supabase";
import Link from "next/link";
import { SyncButton } from "./SyncButton";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function StatCard({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default async function Dashboard() {
  const { data: events } = await supabase
    .from("fm_dashboard")
    .select("*")
    .order("evento_fecha", { ascending: false });

  const all = (events ?? []) as EventSummary[];

  const totals = all.reduce(
    (acc, e) => ({
      registros: acc.registros + e.total_registros,
      asistentes: acc.asistentes + e.total_asistentes,
      icp: acc.icp + e.total_aprobados_icp,
      performance: acc.performance + e.registros_performance,
      qm: acc.qm + e.qm_por_fm,
      demo: acc.demo + e.demo,
      won: acc.won + e.won,
      mrr: acc.mrr + Number(e.mrr_won),
    }),
    { registros: 0, asistentes: 0, icp: 0, performance: 0, qm: 0, demo: 0, won: 0, mrr: 0 }
  );

  const presenciales = all.filter((e) => e.evento_tipo === "Presencial");
  const virtuales = all.filter((e) => e.evento_tipo === "Virtual");

  const totalConEmpresa = all.reduce((acc, e) => acc + (e.total_con_empresa ?? 0), 0);
  const pctMatchGlobal = totals.registros > 0 ? Math.round(totalConEmpresa / totals.registros * 100) : 0;

  return (
    <main className="dashboard-container">
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Field Marketing Dashboard</h1>
          <SyncButton />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
            {all.length} eventos &mdash; {presenciales.length} presenciales, {virtuales.length} webinars
          </p>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 16,
            background: pctMatchGlobal > 70 ? "var(--bg-status-success)" : pctMatchGlobal > 40 ? "var(--bg-status-warning)" : "var(--bg-status-error)",
            color: pctMatchGlobal > 70 ? "var(--fg-status-success)" : pctMatchGlobal > 40 ? "var(--fg-status-warning)" : "var(--fg-status-error)",
          }}>
            {pctMatchGlobal}% matching ({totalConEmpresa}/{totals.registros})
          </span>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12, marginBottom: 32 }}>
        <StatCard value={totals.registros} label="Registros" />
        <StatCard value={totals.asistentes} label="Asistentes" />
        <StatCard value={totals.icp} label="ICP" color="var(--fg-status-success)" />
        <StatCard value={totals.performance} label="Performance" color="var(--fg-status-info)" />
        <StatCard value={totals.qm} label="QM FM" color="var(--fg-status-warning)" />
        <StatCard value={totals.demo} label="Demo" />
        <StatCard value={totals.won} label="Won" color="var(--fg-status-success)" />
        <StatCard value={`$${totals.mrr.toLocaleString()}`} label="MRR Won" color="var(--fg-status-success)" />
      </div>

      <div className="section-title">Eventos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {all.map((e) => (
          <Link
            key={e.luma_event_id}
            href={`/event/${e.luma_event_id}`}
            className="card card-hover"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${e.evento_tipo === "Presencial" ? "badge-presencial" : "badge-virtual"}`}>
                    {e.evento_tipo}
                  </span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {formatDate(e.evento_fecha)}
                  </span>
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.evento_nombre}
                </h3>
                {e.evento_ubicacion && (
                  <p className="text-muted" style={{ fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.evento_ubicacion}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: 16, flexShrink: 0, textAlign: "right" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{e.total_registros}</div>
                  <div className="stat-label">Registros</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{e.total_asistentes || e.total_joined_virtual || "\u2014"}</div>
                  <div className="stat-label">Asistentes</div>
                </div>
                <div>
                  <div className="text-success" style={{ fontSize: 18, fontWeight: 700 }}>{e.icp_pct}%</div>
                  <div className="stat-label">ICP</div>
                </div>
                <div>
                  <div className="text-info" style={{ fontSize: 18, fontWeight: 700 }}>{e.registros_performance}</div>
                  <div className="stat-label">Pauta</div>
                </div>
                {(e.qm_por_fm > 0 || e.demo > 0 || e.won > 0) && (
                  <div>
                    <div className="text-warning" style={{ fontSize: 18, fontWeight: 700 }}>{e.qm_por_fm}</div>
                    <div className="stat-label">QM FM</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{
                    width: `${e.tasa_conversion_pct ?? 0}%`,
                    background: Number(e.tasa_conversion_pct) > 30
                      ? "var(--fg-status-success)"
                      : Number(e.tasa_conversion_pct) > 15
                      ? "var(--fg-status-warning)"
                      : "var(--fg-status-error)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span className="text-muted" style={{ fontSize: 10 }}>
                  Tasa asistencia: {e.tasa_conversion_pct ?? 0}%
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 12,
                  background: Number(e.pct_matched) > 70 ? "var(--bg-status-success)" : Number(e.pct_matched) > 40 ? "var(--bg-status-warning)" : "var(--bg-status-error)",
                  color: Number(e.pct_matched) > 70 ? "var(--fg-status-success)" : Number(e.pct_matched) > 40 ? "var(--fg-status-warning)" : "var(--fg-status-error)",
                }}>
                  {e.pct_matched}% match
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
