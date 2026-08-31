"use client";

import { useMemo, useState } from "react";
import { BacklogPoint } from "@/lib/supabase";
import { MetricInfo } from "@/components/MetricInfo";
import { SIN_BDR } from "./shared";

// Backlog "Por procesar" en el tiempo (pedido Camilo 2026-08-27): "el día tal habían 345,
// el día siguiente 320, subió o bajó" — UNA línea, un número por fecha, sin capas nuevas.
// El número es el MISMO que la fila "Sin procesar" del funnel de abajo (misma definición,
// mismo conteo por empresa×campaña): el punto de hoy se calcula en vivo sobre los datos de
// la pestaña para que ambos coincidan siempre. Attio no guarda historia de stage, así que
// la historia viene de fm_backlog_snapshots: fotos horarias desde el 2026-08-31 (queda el
// estado al cierre de cada día) y, hacia atrás, una reconstrucción estimada desde fechas de
// Attio (entrada a PRE-QM + active_from del stage) y la primera actividad registrada —
// validada con ~2-4% de error contra los valores conocidos. El tramo estimado va punteado.
// Respeta los filtros de campaña y BDR de la pestaña; el de fechas no (su eje es la fecha
// del EVENTO). Los lunes van marcados para leer "cómo empieza el lunes / cómo cierra el
// viernes", que es la lectura semanal que pidió Camilo.

function mondayOf(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function esLunes(fecha: string): boolean {
  return new Date(fecha + "T00:00:00Z").getUTCDay() === 1;
}
function diasDesde(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86_400_000);
}
function fmtDia(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" });
}
function fmtFecha(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "short", timeZone: "UTC" });
}

type Punto = { fecha: string; valor: number; estimado: boolean };

export function BacklogChart({
  serie,
  campanasSel,
  bdrsSel,
  hoy,
  hoyValor,
}: {
  serie: BacklogPoint[];
  campanasSel: Set<string>; // vacío = todas (multi-select de la pestaña)
  bdrsSel: Set<string>; // vacío = todos (SIN_BDR = sin asignar)
  hoy: string; // YYYY-MM-DD en hora Argentina (viene del server)
  hoyValor: number; // "Sin procesar" del funnel HOY, ya filtrado (calculado en vivo)
}) {
  const puntos = useMemo<Punto[]>(() => {
    // Un día "tiene dato" si el snapshot/backfill de ese día existe (aunque la selección
    // filtrada sume 0); un día sin filas de ningún tipo es un hueco (cron caído) y no se
    // dibuja punto. El punto de HOY siempre es el cálculo en vivo, pisando la foto parcial.
    const porDia = new Map<string, { valor: number; estimado: boolean }>();
    for (const r of serie) {
      if (r.fecha >= hoy) continue;
      const cur = porDia.get(r.fecha) ?? { valor: 0, estimado: r.origen === "reconstruido" };
      const bdrKey = r.assigned_bdr_name === "" ? SIN_BDR : r.assigned_bdr_name;
      if ((campanasSel.size === 0 || campanasSel.has(r.campana_evento)) && (bdrsSel.size === 0 || bdrsSel.has(bdrKey))) {
        cur.valor += r.empresas;
      }
      porDia.set(r.fecha, cur);
    }
    porDia.set(hoy, { valor: hoyValor, estimado: false });
    return [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, v]) => ({ fecha, ...v }));
  }, [serie, campanasSel, bdrsSel, hoy, hoyValor]);

  // Arranque de la semana en curso, para la lectura "empezó el lunes en X → hoy Y".
  const lunes = mondayOf(hoy);
  const valorLunes = puntos.find((p) => p.fecha === lunes)?.valor ?? null;
  const deltaSemana = valorLunes !== null ? hoyValor - valorLunes : null;

  const [hover, setHover] = useState<number | null>(null);

  if (puntos.length < 2) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 6 }}>Por procesar — evolución diaria</div>
        <div className="text-muted" style={{ fontSize: 12 }}>
          Hoy: <strong>{hoyValor}</strong> empresas sin procesar. La historia diaria se acumula con la foto de cada día.
        </div>
      </div>
    );
  }

  const W = 720, H = 210, padL = 38, padR = 16, padT = 14, padB = 30;
  const cw = W - padL - padR, ch = H - padT - padB;
  const primera = puntos[0].fecha;
  const totalDias = Math.max(1, diasDesde(primera, puntos[puntos.length - 1].fecha));
  const maxV = Math.max(1, ...puntos.map((p) => p.valor)) * 1.08;
  const x = (fecha: string) => padL + (diasDesde(primera, fecha) / totalDias) * cw;
  const y = (v: number) => padT + ch - (v / maxV) * ch; // eje desde 0: el número es absoluto

  // El tramo estimado (reconstruido) va punteado; el primer punto real lo cierra para que
  // la línea sea continua. De ahí en adelante, sólido (fotos reales + el vivo de hoy).
  const primerReal = puntos.findIndex((p) => !p.estimado);
  const path = (pts: Punto[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.fecha).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const tramoEstimado = primerReal !== 0 ? puntos.slice(0, primerReal === -1 ? puntos.length : primerReal + 1) : [];
  const tramoReal = primerReal === -1 ? [] : puntos.slice(primerReal);

  // Etiquetas del eje X: los lunes (si hay muchos, uno de cada dos para que no se pisen).
  const lunesIdx = puntos.map((p, i) => (esLunes(p.fecha) ? i : -1)).filter((i) => i >= 0);
  const lunesStep = lunesIdx.length > 9 ? 2 : 1;

  const focus = hover !== null ? puntos[hover] : null;
  const color = "var(--fg-status-error)"; // mismo rojo que la fila "Sin procesar" del funnel

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="section-title" style={{ marginBottom: 0 }}>Por procesar — evolución diaria</span>
            <MetricInfo metricKey="backlog_sin_procesar" size={12} />
          </div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            Empresas sin procesar (la fila “Sin procesar” del funnel), día por día. Los lunes están marcados.
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color }}>{hoyValor}</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>
            hoy · {fmtDia(hoy)}
            {deltaSemana !== null && (
              <span style={{ marginLeft: 6, fontWeight: 700, color: deltaSemana < 0 ? "var(--fg-status-success)" : deltaSemana > 0 ? "var(--fg-status-error)" : "var(--fg-quaternary)" }}>
                {deltaSemana < 0 ? `↓ ${Math.abs(deltaSemana)}` : deltaSemana > 0 ? `↑ ${deltaSemana}` : "= igual"}
              </span>
            )}
            {valorLunes !== null && <span> desde el lunes ({valorLunes})</span>}
          </div>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Backlog de empresas sin procesar por día">
          {[0, 1, 2, 3, 4].map((g) => {
            const v = (maxV / 4) * g;
            return (
              <g key={g}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border-tertiary)" strokeWidth={0.5} />
                <text x={padL - 5} y={y(v) + 3} fontSize={9} textAnchor="end" fill="var(--fg-quaternary)">{Math.round(v)}</text>
              </g>
            );
          })}
          {/* Corte de semana: línea vertical en cada lunes */}
          {lunesIdx.map((i, k) => (
            <g key={puntos[i].fecha}>
              <line x1={x(puntos[i].fecha)} x2={x(puntos[i].fecha)} y1={padT} y2={padT + ch} stroke="var(--border-tertiary)" strokeWidth={1} strokeDasharray="2 3" />
              {k % lunesStep === 0 && (
                <text x={x(puntos[i].fecha)} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--fg-quaternary)">
                  lun {fmtDia(puntos[i].fecha)}
                </text>
              )}
            </g>
          ))}
          {tramoEstimado.length > 1 && (
            <path d={path(tramoEstimado)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" opacity={0.7} />
          )}
          {tramoReal.length > 1 && <path d={path(tramoReal)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />}
          {/* Punto de hoy (vivo) + punto bajo hover */}
          <circle cx={x(hoy)} cy={y(hoyValor)} r={4} fill={color} stroke="var(--bg-primary)" strokeWidth={1.5} />
          {focus && <circle cx={x(focus.fecha)} cy={y(focus.valor)} r={4} fill={color} stroke="var(--bg-primary)" strokeWidth={1.5} />}
          {/* Zonas de hover por día */}
          {puntos.map((p, i) => {
            const half = cw / totalDias / 2;
            return (
              <rect
                key={p.fecha}
                x={x(p.fecha) - half} y={padT} width={half * 2} height={ch}
                fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        {focus && (
          <div
            style={{
              position: "absolute", top: 0, left: `${(x(focus.fecha) / W) * 100}%`, transform: "translateX(-50%)",
              background: "var(--fg-primary)", color: "var(--bg-primary)", padding: "5px 10px", borderRadius: 6,
              fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10, lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700 }}>{fmtFecha(focus.fecha)}</div>
            <div>
              {focus.valor} sin procesar{focus.estimado ? " · estimado" : ""}
            </div>
          </div>
        )}
      </div>

      <div className="text-muted" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>
        Tramo <strong>punteado</strong>: reconstrucción estimada desde las fechas de Attio (entrada a PRE-QM, cambio de
        stage) y la primera actividad registrada — Attio no guarda historia, hacia atrás no hay foto exacta. Tramo{" "}
        <strong>sólido</strong>: fotos diarias reales (desde el 31-ago-2026). Aplican los filtros de campaña y BDR; el de
        fechas no (filtra por fecha del evento).
      </div>
    </div>
  );
}
