"use client";

import { useMemo, useState } from "react";
import { WeeklyProgress } from "@/lib/supabase";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";

// 2026-07-28: progreso semana a semana (pedido reunión Camilo/José 2026-07-23).
// Histórico retro-construido de fuentes con fecha real: activities (llamadas/WA)
// y fechas de etapa de los deals. Semana = lunes. Los deals con fecha futura
// (data quality en Attio) quedan fuera del rango mostrado.
type RangoSemanas = 12 | 26 | 0; // 0 = todo

const METRICAS_CHART: {
  key: keyof WeeklyProgress;
  label: string;
  color: string;
  money?: boolean;
}[] = [
  { key: "llamadas", label: "Llamadas", color: "var(--chart-linkedin)" },
  { key: "whatsapps", label: "WhatsApps", color: "var(--chart-email)" },
  { key: "empresas_procesadas", label: "Empresas procesadas (estructura 3+2)", color: "var(--fg-status-brand)" },
  { key: "qm_agendadas", label: "QM agendadas (deals)", color: "var(--fg-status-info)" },
  { key: "demos", label: "Demos", color: "var(--chart-partner)" },
  { key: "mrr_won", label: "MRR cerrado", color: "var(--fg-status-success)", money: true },
];

export function SemanalClient({ rows }: { rows: WeeklyProgress[] }) {
  const [campana, setCampana] = useState<string>("todas");
  const [rango, setRango] = useState<RangoSemanas>(12);

  // Lunes de la semana en curso (UTC, igual que date_trunc('week') en la vista).
  const semanaActual = useMemo(() => {
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7; // 0 = lunes
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow))
      .toISOString()
      .slice(0, 10);
  }, []);

  const campanas = useMemo(() => {
    const set = new Set(rows.map((r) => r.campana_evento));
    return ["todas", ...[...set].sort()];
  }, [rows]);

  // Agregado por semana (sobre la campaña elegida), sin semanas futuras, con
  // semanas vacías rellenadas en 0 para que el eje de tiempo sea continuo.
  const semanas = useMemo(() => {
    const filtered = rows.filter(
      (r) => r.semana <= semanaActual && (campana === "todas" || r.campana_evento === campana)
    );
    if (filtered.length === 0) return [];

    const byWeek = new Map<string, WeeklyProgress>();
    for (const r of filtered) {
      const acc = byWeek.get(r.semana);
      if (!acc) {
        byWeek.set(r.semana, { ...r, campana_evento: campana });
      } else {
        acc.llamadas += r.llamadas;
        acc.whatsapps += r.whatsapps;
        acc.empresas_trabajadas += r.empresas_trabajadas;
        acc.empresas_procesadas += r.empresas_procesadas;
        acc.qm_agendadas += r.qm_agendadas;
        acc.qm_completadas += r.qm_completadas;
        acc.demos += r.demos;
        acc.wons += r.wons;
        acc.mrr_won = Number(acc.mrr_won) + Number(r.mrr_won);
        acc.losts += r.losts;
      }
    }

    // Secuencia continua de lunes desde la primera semana con data hasta la actual.
    const keys = [...byWeek.keys()].sort();
    const out: WeeklyProgress[] = [];
    const cursor = new Date(keys[0] + "T00:00:00Z");
    const end = new Date(semanaActual + "T00:00:00Z");
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      out.push(
        byWeek.get(key) ?? {
          campana_evento: campana,
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
    return rango === 0 ? out : out.slice(-rango);
  }, [rows, campana, rango, semanaActual]);

  const totals = useMemo(() => {
    return semanas.reduce(
      (acc, s) => ({
        llamadas: acc.llamadas + s.llamadas,
        whatsapps: acc.whatsapps + s.whatsapps,
        procesadas: acc.procesadas + s.empresas_procesadas,
        qm: acc.qm + s.qm_agendadas,
        wons: acc.wons + s.wons,
        mrr: acc.mrr + Number(s.mrr_won),
      }),
      { llamadas: 0, whatsapps: 0, procesadas: 0, qm: 0, wons: 0, mrr: 0 }
    );
  }, [semanas]);

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <select
          value={campana}
          onChange={(e) => setCampana(e.target.value)}
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
        <div style={{ display: "flex", gap: 4 }}>
          {([12, 26, 0] as RangoSemanas[]).map((r) => (
            <button
              key={r}
              onClick={() => setRango(r)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border-tertiary)",
                cursor: "pointer",
                background: rango === r ? "var(--fg-primary)" : "var(--bg-primary)",
                color: rango === r ? "var(--bg-primary)" : "var(--fg-secondary)",
              }}
            >
              {r === 0 ? "Todo" : `${r} sem`}
            </button>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Semana = lunes a domingo · actividades y fechas de etapa de deals con campaña FM
        </span>
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
          Sin data semanal para la campaña seleccionada.
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
            />
          ))}
        </div>
      )}

      {/* Tabla (vista accesible de la misma data, semana más reciente arriba) */}
      <div className="section-title">Detalle por semana ({semanas.length})</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
              <th style={thStyle}>Semana</th>
              <th style={thRight}>Llamadas</th>
              <th style={thRight}>WhatsApps</th>
              <th style={thRight}>Emp. trabajadas</th>
              <th style={thRight}>Emp. procesadas</th>
              <th style={thRight}>QM agend.</th>
              <th style={thRight}>QM compl.</th>
              <th style={thRight}>Demos</th>
              <th style={thRight}>Wons</th>
              <th style={thRight}>MRR</th>
              <th style={thRight}>Losts</th>
            </tr>
          </thead>
          <tbody>
            {[...semanas].reverse().map((s) => (
              <tr key={s.semana} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtSemana(s.semana)}</td>
                <td style={tdRight}>{s.llamadas}</td>
                <td style={tdRight}>{s.whatsapps}</td>
                <td style={tdRight}>{s.empresas_trabajadas}</td>
                <td style={tdRight}>{s.empresas_procesadas}</td>
                <td style={tdRight}>{s.qm_agendadas}</td>
                <td style={tdRight}>{s.qm_completadas}</td>
                <td style={tdRight}>{s.demos}</td>
                <td style={{ ...tdRight, fontWeight: 600 }}>{s.wons}</td>
                <td style={{ ...tdRight, color: "var(--fg-status-success)", fontWeight: 600 }}>
                  {Number(s.mrr_won) > 0 ? formatCurrency(Number(s.mrr_won)) : "—"}
                </td>
                <td style={{ ...tdRight, color: "var(--fg-quaternary)" }}>{s.losts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Barras semanales de UNA métrica (single series: el título la nombra, sin leyenda).
// Tooltip por barra al hover; ejes recesivos; barras ancladas a la baseline.
function WeekBars({
  title,
  color,
  points,
  fmt,
}: {
  title: string;
  color: string;
  points: { semana: string; valor: number }[];
  fmt: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.valor), 1);
  const H = 110;
  // Etiquetas del eje X: ≤6 para que no colisionen.
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

function fmtSemana(semana: string) {
  const d = new Date(semana + "T12:00:00Z");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

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
