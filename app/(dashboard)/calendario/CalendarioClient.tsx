"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UpcomingEvent, EventAccionable, EventPrep } from "@/lib/supabase";
import { Modal } from "@/components/Modal";
import { PAISES_POR_TERRITORIO, defaultTerritorio } from "@/lib/territories";
import { saveUpcomingEvent, deleteUpcomingEvent, updateAccionable, UpcomingEventInput } from "./actions";

// 2026-07-29 — FM Events Calendar Fase 1: calendario de eventos FUTUROS.
// Vista mensual con los eventos en su día + alta/edición manual del equipo FM.
// Fase 2 le cuelga los accionables por rol; Fase 3, los recordatorios de Slack.

const TIPO_COLOR: Record<UpcomingEvent["tipo"], string> = {
  Presencial: "var(--fg-status-brand)",
  Virtual: "var(--fg-status-info)",
  "Third Party": "var(--chart-partner)",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const INDUSTRIAS_SUGERIDAS = [
  "Educación", "Automotriz", "Financiero", "Salud", "Retail", "Tecnología", "Multisector",
];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtFecha(fecha: string) {
  return new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

// Fecha compacta para la tabla ("06 ago", "14–15 ago", "28 ago – 02 sep"); año solo si no es el actual.
function fmtCorta(fecha: string, conAnio: boolean) {
  const d = new Date(fecha + "T12:00:00");
  const s = d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return conAnio ? `${s} ${d.getFullYear()}` : s;
}

function fmtRango(fecha: string, fin: string | null) {
  const conAnio = new Date(fecha + "T12:00:00").getFullYear() !== new Date().getFullYear();
  if (!fin || fin === fecha) return fmtCorta(fecha, conAnio);
  const d1 = new Date(fecha + "T12:00:00");
  const d2 = new Date(fin + "T12:00:00");
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
    return `${String(d1.getDate()).padStart(2, "0")}–${fmtCorta(fin, conAnio)}`;
  }
  return `${fmtCorta(fecha, false)} – ${fmtCorta(fin, conAnio)}`;
}

// Orden canónico de los accionables (matriz de la reunión 2026-07-31).
const ORDEN_ACCIONABLES = ["base_datos", "invitaciones", "inv_ventas", "pauta", "contenido", "handoff_cande", "post_listas"];

function prepColor(pct: number): string {
  if (pct >= 80) return "var(--fg-status-success)";
  if (pct >= 40) return "var(--fg-status-warning)";
  return "var(--fg-status-error)";
}

export function CalendarioClient({
  eventos,
  accionables,
  prep,
}: {
  eventos: UpcomingEvent[];
  accionables: EventAccionable[];
  prep: EventPrep[];
}) {
  const prepByEvent = useMemo(() => new Map(prep.map((p) => [p.event_id, p])), [prep]);
  const accionablesByEvent = useMemo(() => {
    const m = new Map<string, EventAccionable[]>();
    for (const a of accionables) m.set(a.event_id, [...(m.get(a.event_id) ?? []), a]);
    for (const list of m.values()) {
      list.sort(
        (x, y) =>
          ORDEN_ACCIONABLES.indexOf(x.template_clave ?? "") - ORDEN_ACCIONABLES.indexOf(y.template_clave ?? "")
      );
    }
    return m;
  }, [accionables]);
  const hoy = useMemo(() => new Date(), []);
  const hoyIso = isoDate(hoy);
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  // Modal: null = cerrado; "nuevo" = alta; UpcomingEvent = edición.
  const [editing, setEditing] = useState<UpcomingEvent | "nuevo" | null>(null);
  const [fechaPrefill, setFechaPrefill] = useState<string | null>(null);

  // Eventos indexados por día (los multi-día aparecen en cada día del rango).
  const porDia = useMemo(() => {
    const m = new Map<string, UpcomingEvent[]>();
    for (const e of eventos) {
      const start = new Date(e.fecha + "T12:00:00");
      const end = new Date((e.fecha_fin ?? e.fecha) + "T12:00:00");
      const cursor = new Date(start);
      let guard = 0;
      while (cursor <= end && guard < 60) {
        const key = isoDate(cursor);
        m.set(key, [...(m.get(key) ?? []), e]);
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    }
    return m;
  }, [eventos]);

  // Grilla del mes: semanas de lunes a domingo, con días de relleno de meses vecinos.
  const semanas = useMemo(() => {
    const first = new Date(mes);
    const offset = (first.getDay() + 6) % 7; // 0 = lunes
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const out: Date[][] = [];
    const cursor = new Date(start);
    while (true) {
      const semana: Date[] = [];
      for (let i = 0; i < 7; i++) {
        semana.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push(semana);
      if (cursor.getMonth() !== mes.getMonth() && cursor > mes) break;
      if (out.length > 6) break;
    }
    return out;
  }, [mes]);

  const proximos = useMemo(
    () => eventos.filter((e) => e.fecha >= hoyIso && e.estado !== "Cancelado").slice(0, 10),
    [eventos, hoyIso]
  );

  function abrirNuevo(fecha?: string) {
    setFechaPrefill(fecha ?? null);
    setEditing("nuevo");
  }

  return (
    <div>
      {/* Header: navegación de mes + alta */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} style={navBtn} aria-label="Mes anterior">←</button>
          <div style={{ fontSize: 16, fontWeight: 700, minWidth: 170, textAlign: "center" }}>
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </div>
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} style={navBtn} aria-label="Mes siguiente">→</button>
        </div>
        <button onClick={() => setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1))} style={{ ...navBtn, width: "auto", padding: "0 12px" }}>
          Hoy
        </button>
        <button
          onClick={() => abrirNuevo()}
          style={{
            marginLeft: "auto",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: "none",
            background: "var(--fg-primary)",
            color: "var(--bg-primary)",
            cursor: "pointer",
          }}
        >
          + Nuevo evento
        </button>
      </div>

      {/* Leyenda por tipo */}
      <div style={{ display: "flex", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
        {(Object.keys(TIPO_COLOR) as UpcomingEvent["tipo"][]).map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-secondary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: TIPO_COLOR[t] }} />
            {t}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-quaternary)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--fg-quaternary)" }} />
          Cancelado
        </span>
      </div>

      {/* Grilla mensual */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 32 }}>
        {/* minmax(0,1fr): sin el 0, un nombre largo de evento estira su columna y rompe la simetría */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--border-tertiary)" }}>
          {DIAS.map((d) => (
            <div key={d} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--fg-quaternary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {d}
            </div>
          ))}
        </div>
        {semanas.map((semana, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: wi < semanas.length - 1 ? "1px solid var(--border-tertiary)" : "none" }}>
            {semana.map((dia) => {
              const key = isoDate(dia);
              const delMes = dia.getMonth() === mes.getMonth();
              const esHoy = key === hoyIso;
              const evs = porDia.get(key) ?? [];
              return (
                <div
                  key={key}
                  onClick={() => abrirNuevo(key)}
                  title="Click para agregar un evento este día"
                  style={{
                    minHeight: 92,
                    minWidth: 0,
                    overflow: "hidden",
                    padding: 6,
                    borderRight: "1px solid var(--border-tertiary)",
                    background: delMes ? "var(--bg-primary)" : "var(--bg-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: esHoy ? 700 : 500,
                      color: esHoy ? "var(--bg-primary)" : delMes ? "var(--fg-secondary)" : "var(--fg-quaternary)",
                      background: esHoy ? "var(--fg-status-brand)" : "transparent",
                      borderRadius: 999,
                      width: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 4,
                    }}
                  >
                    {dia.getDate()}
                  </div>
                  {evs.map((e) => {
                    const cancelado = e.estado === "Cancelado";
                    const color = cancelado ? "var(--fg-quaternary)" : TIPO_COLOR[e.tipo];
                    return (
                      <button
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditing(e);
                        }}
                        title={`${e.nombre}${e.industria ? ` · ${e.industria}` : ""}${e.territorio ? ` · ${e.territorio}` : ""}`}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 4,
                          background: `color-mix(in srgb, ${color} 12%, transparent)`,
                          color: "var(--fg-primary)",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 6px",
                          marginBottom: 3,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textDecoration: cancelado ? "line-through" : "none",
                          opacity: cancelado ? 0.6 : 1,
                        }}
                      >
                        {e.nombre}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Próximos eventos */}
      <div className="section-title">Próximos eventos ({proximos.length})</div>
      {proximos.length === 0 ? (
        <div className="text-muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
          No hay eventos futuros cargados. Agregá el primero con &quot;+ Nuevo evento&quot;.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Compacta a 6 columnas para que entre SIN scroll horizontal: el tipo es el punto
              de color junto al nombre (leyenda arriba) y industria/país/responsable van como
              subtítulo del evento. Fila entera clickeable = editar. */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                <th style={{ ...thStyle, width: "34%" }}>Evento</th>
                <th style={{ ...thStyle, width: "13%" }}>Fecha</th>
                <th style={{ ...thStyle, width: "15%" }}>Metas</th>
                <th style={{ ...thStyle, width: "20%" }}>Preparación</th>
                <th style={{ ...thStyle, width: "12%" }}>Estado</th>
                <th style={{ ...thStyle, width: "6%" }} />
              </tr>
            </thead>
            <tbody>
              {proximos.map((e) => {
                const sub = [e.industria, [e.pais, e.territorio].filter(Boolean).join(" · "), e.responsable]
                  .filter(Boolean)
                  .join("  ·  ");
                return (
                  <tr
                    key={e.id}
                    onClick={() => setEditing(e)}
                    style={{ borderBottom: "1px solid var(--border-tertiary)", cursor: "pointer" }}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span title={e.tipo} style={{ width: 8, height: 8, borderRadius: 999, background: TIPO_COLOR[e.tipo], flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.nombre}</span>
                      </div>
                      {sub && (
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 2, paddingLeft: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {sub}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "var(--fg-secondary)" }}>
                      {fmtRango(e.fecha, e.fecha_fin)}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--fg-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {e.meta_qms != null || e.meta_mrr != null
                        ? `${e.meta_qms ?? "—"} QMs · $${Number(e.meta_mrr ?? 0).toLocaleString("es-AR")}`
                        : "—"}
                    </td>
                    <td style={tdStyle}>
                      {(() => {
                        const p = prepByEvent.get(e.id);
                        if (!p) return <span className="text-muted">—</span>;
                        return (
                          <div title={`${p.completados}/${p.accionables} accionables completados`}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--bg-secondary)", overflow: "hidden" }}>
                                <div style={{ width: `${p.avance_pct}%`, height: "100%", background: prepColor(p.avance_pct) }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: prepColor(p.avance_pct), minWidth: 32, textAlign: "right" }}>
                                {p.avance_pct}%
                              </span>
                            </div>
                            {p.pendientes_check > 0 && (
                              <div style={{ fontSize: 10, color: "var(--fg-status-warning)", marginTop: 2 }}>
                                ⚠ {p.pendientes_check} por confirmar
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={tdStyle}>
                      <span
                        className="badge"
                        style={{
                          background: e.estado === "Confirmado" ? "var(--bg-status-brand)" : "var(--bg-secondary)",
                          color: e.estado === "Confirmado" ? "var(--fg-status-brand)" : "var(--fg-secondary)",
                          fontSize: 11,
                        }}
                      >
                        {e.estado}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--fg-quaternary)", fontSize: 12 }}>
                      editar →
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cumplimiento por persona (pedido Camilo 2026-08-05): cómo viene cada responsable
          con sus accionables EXIGIBLES (el aviso ya llegó) de eventos vigentes. */}
      <CumplimientoPorPersona accionables={accionables} eventos={eventos} hoyIso={hoyIso} />

      {editing && (
        <EventForm
          evento={editing === "nuevo" ? null : editing}
          accionables={editing === "nuevo" ? [] : accionablesByEvent.get(editing.id) ?? []}
          fechaPrefill={fechaPrefill}
          onClose={() => {
            setEditing(null);
            setFechaPrefill(null);
          }}
        />
      )}
    </div>
  );
}

// Cumplimiento por persona: % de avance de los accionables exigibles (aviso ya llegado)
// de eventos vigentes, por responsable. Alimenta la conversación de accountability de
// Camilo/Mario sin perseguir a nadie: los datos los cargan las personas (dashboard o bot).
function CumplimientoPorPersona({
  accionables,
  eventos,
  hoyIso,
}: {
  accionables: EventAccionable[];
  eventos: UpcomingEvent[];
  hoyIso: string;
}) {
  const filas = useMemo(() => {
    const eventosById = new Map(eventos.map((e) => [e.id, e]));
    type Acc = { exigibles: number; completados: number; enCurso: number; sinArrancar: number; sumaProgreso: number; proximos: number };
    const m = new Map<string, Acc>();

    for (const a of accionables) {
      if (a.aplica === false) continue;
      const e = eventosById.get(a.event_id);
      if (!e || e.estado === "Cancelado" || e.fecha < hoyIso) continue; // solo preparativos vigentes
      const key = a.responsable ?? "— sin responsable —";
      const acc = m.get(key) ?? { exigibles: 0, completados: 0, enCurso: 0, sinArrancar: 0, sumaProgreso: 0, proximos: 0 };
      const exigible = !!a.fecha_aviso && a.fecha_aviso <= hoyIso;
      if (exigible) {
        acc.exigibles++;
        acc.sumaProgreso += a.progreso;
        if (a.progreso === 100) acc.completados++;
        else if (a.progreso > 0) acc.enCurso++;
        else acc.sinArrancar++;
      } else {
        acc.proximos++;
      }
      m.set(key, acc);
    }

    return [...m.entries()]
      .map(([persona, acc]) => ({
        persona,
        ...acc,
        pct: acc.exigibles > 0 ? Math.round(acc.sumaProgreso / acc.exigibles) : null,
      }))
      .filter((f) => f.exigibles > 0 || f.proximos > 0)
      .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
  }, [accionables, eventos, hoyIso]);

  if (filas.length === 0) return null;

  return (
    <>
      <div className="section-title" style={{ marginTop: 32 }}>Cumplimiento por persona</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
              <th style={{ ...thStyle, width: "26%" }}>Responsable</th>
              <th style={{ ...thStyle, width: "26%" }}>Cumplimiento</th>
              <th style={{ ...thStyle, width: "12%", textAlign: "right" }}>Exigibles</th>
              <th style={{ ...thStyle, width: "12%", textAlign: "right" }}>✓ Listos</th>
              <th style={{ ...thStyle, width: "12%", textAlign: "right" }}>Sin arrancar</th>
              <th style={{ ...thStyle, width: "12%", textAlign: "right" }}>Próximos</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.persona} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.persona}</td>
                <td style={tdStyle}>
                  {f.pct === null ? (
                    <span className="text-muted" style={{ fontSize: 12 }}>sin accionables exigibles aún</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--bg-secondary)", overflow: "hidden" }}>
                        <div style={{ width: `${f.pct}%`, height: "100%", background: prepColor(f.pct) }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: prepColor(f.pct), minWidth: 34, textAlign: "right" }}>{f.pct}%</span>
                    </div>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{f.exigibles}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "var(--fg-status-success)", fontWeight: 600 }}>{f.completados}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: f.sinArrancar > 0 ? "var(--fg-status-error)" : "var(--fg-quaternary)", fontWeight: f.sinArrancar > 0 ? 600 : 400 }}>
                  {f.sinArrancar}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "var(--fg-quaternary)" }}>{f.proximos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-muted" style={{ fontSize: 11, padding: "10px 14px" }}>
          Exigible = el aviso del accionable ya llegó y el evento sigue vigente. Cumplimiento = avance promedio de los exigibles
          (lo actualiza cada persona desde el evento o respondiendo al bot de Slack). &quot;Próximos&quot; son accionables cuyo aviso todavía no llegó.
        </div>
      </div>
    </>
  );
}

// Alta/edición de un evento del calendario.
function EventForm({
  evento,
  accionables,
  fechaPrefill,
  onClose,
}: {
  evento: UpcomingEvent | null;
  accionables: EventAccionable[];
  fechaPrefill: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState<UpcomingEventInput>({
    id: evento?.id,
    nombre: evento?.nombre ?? "",
    fecha: evento?.fecha ?? fechaPrefill ?? "",
    fecha_fin: evento?.fecha_fin ?? "",
    tipo: evento?.tipo ?? "Presencial",
    industria: evento?.industria ?? "",
    pais: evento?.pais ?? "",
    territorio: evento?.territorio ?? null,
    ciudad: evento?.ciudad ?? "",
    responsable: evento?.responsable ?? "",
    notas: evento?.notas ?? "",
    estado: evento?.estado ?? "Planificado",
    campana_evento: evento?.campana_evento ?? "",
    ppt_link: evento?.ppt_link ?? "",
    plan_fm_link: evento?.plan_fm_link ?? "",
    plan_ventas_link: evento?.plan_ventas_link ?? "",
    meta_registros: evento?.meta_registros ?? null,
    meta_asistentes: evento?.meta_asistentes ?? null,
    meta_qms: evento?.meta_qms ?? null,
    meta_wons: evento?.meta_wons ?? null,
    meta_mrr: evento?.meta_mrr ?? null,
    costo_estimado: evento?.costo_estimado ?? null,
    asana_project_gid: evento?.asana_project_gid ?? "",
  });

  function setNum(key: keyof UpcomingEventInput, value: string) {
    setForm((f) => ({ ...f, [key]: value === "" ? null : Number(value) }));
  }

  function set<K extends keyof UpcomingEventInput>(key: K, value: UpcomingEventInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await saveUpcomingEvent(form);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function eliminar() {
    if (!evento) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      try {
        await deleteUpcomingEvent(evento.id);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al eliminar");
      }
    });
  }

  return (
    <Modal isOpen onClose={onClose} title={evento ? "Editar evento" : "Nuevo evento"}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          Nombre *
          <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: AI Summit Bogotá" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Fecha *
          <input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Fecha fin (si dura varios días)
          <input type="date" value={form.fecha_fin ?? ""} onChange={(e) => set("fecha_fin", e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Tipo
          <select value={form.tipo} onChange={(e) => set("tipo", e.target.value as UpcomingEventInput["tipo"])} style={inputStyle}>
            <option>Presencial</option>
            <option>Virtual</option>
            <option>Third Party</option>
          </select>
        </label>
        <label style={labelStyle}>
          Industria
          <input list="industrias" value={form.industria ?? ""} onChange={(e) => set("industria", e.target.value)} placeholder="Ej: Educación" style={inputStyle} />
          <datalist id="industrias">
            {INDUSTRIAS_SUGERIDAS.map((i) => <option key={i} value={i} />)}
          </datalist>
        </label>
        <label style={labelStyle}>
          País
          <select
            value={form.pais ?? ""}
            onChange={(e) => {
              const pais = e.target.value || null;
              setForm((f) => ({ ...f, pais, territorio: defaultTerritorio(pais) }));
            }}
            style={inputStyle}
          >
            <option value="">— sin país —</option>
            {PAISES_POR_TERRITORIO.map((grp) => (
              <optgroup key={grp.territorio} label={grp.territorio}>
                {grp.paises.map((p) => <option key={p} value={p}>{p}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Ciudad
          <input value={form.ciudad ?? ""} onChange={(e) => set("ciudad", e.target.value)} placeholder="Ej: Bogotá" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Responsable
          <input value={form.responsable ?? ""} onChange={(e) => set("responsable", e.target.value)} placeholder="Quién lidera el evento" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Estado
          <select value={form.estado} onChange={(e) => set("estado", e.target.value as UpcomingEventInput["estado"])} style={inputStyle}>
            <option>Planificado</option>
            <option>Confirmado</option>
            <option>Cancelado</option>
          </select>
        </label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          Notas
          <textarea value={form.notas ?? ""} onChange={(e) => set("notas", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          Nomenclatura Attio (opcional — linkea el evento al tracking cuando exista)
          <input value={form.campana_evento ?? ""} onChange={(e) => set("campana_evento", e.target.value)} placeholder="Ej: Evento_AISummitBogota_15/09/26" style={inputStyle} />
        </label>

        {/* Metas del doc de planificación */}
        <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: "var(--fg-quaternary)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>
          Metas del evento
        </div>
        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <label style={labelStyle}>
            Registros meta
            <input type="number" min={0} value={form.meta_registros ?? ""} onChange={(e) => setNum("meta_registros", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Asistentes meta
            <input type="number" min={0} value={form.meta_asistentes ?? ""} onChange={(e) => setNum("meta_asistentes", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            QMs meta
            <input type="number" min={0} value={form.meta_qms ?? ""} onChange={(e) => setNum("meta_qms", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Wons meta
            <input type="number" min={0} value={form.meta_wons ?? ""} onChange={(e) => setNum("meta_wons", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            MRR meta ($)
            <input type="number" min={0} value={form.meta_mrr ?? ""} onChange={(e) => setNum("meta_mrr", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Costo estimado ($)
            <input type="number" min={0} value={form.costo_estimado ?? ""} onChange={(e) => setNum("costo_estimado", e.target.value)} style={inputStyle} />
          </label>
        </div>

        {/* Links de trabajo */}
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          PPT Atom (link)
          <input value={form.ppt_link ?? ""} onChange={(e) => set("ppt_link", e.target.value)} placeholder="https://…" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Plan de acción Field Marketing (link)
          <input value={form.plan_fm_link ?? ""} onChange={(e) => set("plan_fm_link", e.target.value)} placeholder="https://…" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Plan de acción Ventas (link)
          <input value={form.plan_ventas_link ?? ""} onChange={(e) => set("plan_ventas_link", e.target.value)} placeholder="https://…" style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          Proyecto de Asana del evento (link)
          <input
            value={form.asana_project_gid ?? ""}
            onChange={(e) => set("asana_project_gid", e.target.value)}
            placeholder="https://app.asana.com/1/…/project/…"
            style={inputStyle}
          />
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-quaternary)", marginTop: 4 }}>
            Pegá el link del proyecto del evento. Es lo que va a usar el bot para linkear cada accionable con su tarea de Asana.
          </span>
        </label>
      </div>

      {evento && (evento.ppt_link || evento.plan_fm_link || evento.plan_ventas_link || evento.asana_project_gid) && (
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {evento.ppt_link && <a href={evento.ppt_link} target="_blank" rel="noopener noreferrer" style={linkChip}>📊 PPT Atom ↗</a>}
          {evento.plan_fm_link && <a href={evento.plan_fm_link} target="_blank" rel="noopener noreferrer" style={linkChip}>📋 Plan FM ↗</a>}
          {evento.plan_ventas_link && <a href={evento.plan_ventas_link} target="_blank" rel="noopener noreferrer" style={linkChip}>💼 Plan Ventas ↗</a>}
          {evento.asana_project_gid && (
            <a href={`https://app.asana.com/0/${evento.asana_project_gid}`} target="_blank" rel="noopener noreferrer" style={linkChip}>
              ✅ Proyecto Asana ↗
            </a>
          )}
        </div>
      )}

      {evento && accionables.length > 0 && <AccionablesSection accionables={accionables} />}

      {error && (
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: "var(--fg-status-error)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
        <button
          onClick={submit}
          disabled={isPending}
          style={{
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: "none",
            background: "var(--fg-primary)",
            color: "var(--bg-primary)",
            cursor: "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? "Guardando…" : evento ? "Guardar cambios" : "Crear evento"}
        </button>
        <button
          onClick={onClose}
          disabled={isPending}
          style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid var(--border-tertiary)", background: "var(--bg-primary)", color: "var(--fg-secondary)", cursor: "pointer" }}
        >
          Cancelar
        </button>
        {evento && (
          <button
            onClick={eliminar}
            disabled={isPending}
            style={{
              marginLeft: "auto",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              background: confirmDelete ? "var(--fg-status-error)" : "var(--bg-primary)",
              color: confirmDelete ? "var(--bg-primary)" : "var(--fg-status-error)",
              cursor: "pointer",
            }}
          >
            {confirmDelete ? "¿Seguro? Click de nuevo" : "Eliminar"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// Preparación del evento: los accionables por rol con su barra de avance.
// La barra se llena desde acá o (Fase 3) respondiendo al bot de Slack.
function AccionablesSection({ accionables }: { accionables: EventAccionable[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimista: reflejar el cambio ya, el refresh confirma.
  const [local, setLocal] = useState<Record<string, Partial<EventAccionable>>>({});

  function patch(id: string, p: { progreso?: number; aplica?: boolean | null }) {
    setLocal((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
    startTransition(async () => {
      try {
        await updateAccionable(id, p);
        router.refresh();
      } catch {
        setLocal((prev) => ({ ...prev, [id]: {} }));
      }
    });
  }

  const efectivos = accionables.map((a) => ({ ...a, ...local[a.id] }));
  const activos = efectivos.filter((a) => a.aplica !== false);
  const avance = activos.length > 0 ? Math.round(activos.reduce((s, a) => s + a.progreso, 0) / activos.length) : 0;

  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--border-tertiary)", paddingTop: 16, opacity: isPending ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-quaternary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Preparación del evento
        </span>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--bg-secondary)", overflow: "hidden" }}>
          <div style={{ width: `${avance}%`, height: "100%", background: prepColor(avance), transition: "width 0.2s" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: prepColor(avance) }}>{avance}%</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {efectivos.map((a) => {
          const noAplica = a.aplica === false;
          const pendienteCheck = a.aplica === null;
          return (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                opacity: noAplica ? 0.5 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, textDecoration: noAplica ? "line-through" : "none" }}>{a.nombre}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {a.responsable ?? "— sin responsable —"}
                  {a.fecha_aviso ? ` · aviso ${fmtFecha(a.fecha_aviso)}` : ""}
                </div>
              </div>

              {pendienteCheck ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-status-warning)", whiteSpace: "nowrap" }}>¿Aplica?</span>
                  <button onClick={() => patch(a.id, { aplica: true })} style={checkBtn} title="Sí, aplica a este evento">✓ Sí</button>
                  <button onClick={() => patch(a.id, { aplica: false })} style={checkBtn} title="No aplica a este evento">✗ No</button>
                </div>
              ) : noAplica ? (
                <button onClick={() => patch(a.id, { aplica: null })} style={{ ...checkBtn, whiteSpace: "nowrap" }} title="Volver a considerar">
                  no aplica · deshacer
                </button>
              ) : (
                <>
                  <div style={{ width: 90, height: 6, borderRadius: 999, background: "var(--bg-primary)", overflow: "hidden" }}>
                    <div style={{ width: `${a.progreso}%`, height: "100%", background: prepColor(a.progreso), transition: "width 0.2s" }} />
                  </div>
                  <select
                    value={a.progreso}
                    onChange={(e) => patch(a.id, { progreso: Number(e.target.value) })}
                    style={{
                      padding: "4px 6px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "1px solid var(--border-tertiary)",
                      background: "var(--bg-primary)",
                      color: a.progreso === 100 ? "var(--fg-status-success)" : "var(--fg-primary)",
                    }}
                  >
                    {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => (
                      <option key={v} value={v}>{v === 100 ? "✓ 100%" : `${v}%`}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
        El avance se actualiza acá o respondiendo al bot de Slack (próximamente). Los accionables con &quot;¿Aplica?&quot; esperan el check de Mario.
      </div>
    </div>
  );
}

const checkBtn: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 6,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-primary)",
  color: "var(--fg-secondary)",
  cursor: "pointer",
};

const linkChip: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--fg-status-info)",
  textDecoration: "none",
  padding: "4px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-secondary)",
};

const navBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-primary)",
  color: "var(--fg-secondary)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-secondary)",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--border-tertiary)",
  background: "var(--bg-primary)",
  color: "var(--fg-primary)",
  fontWeight: 400,
};

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-quaternary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "middle",
};
