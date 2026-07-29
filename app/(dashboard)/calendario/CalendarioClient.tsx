"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UpcomingEvent } from "@/lib/supabase";
import { Modal } from "@/components/Modal";
import { PAISES_POR_TERRITORIO, defaultTerritorio } from "@/lib/territories";
import { saveUpcomingEvent, deleteUpcomingEvent, UpcomingEventInput } from "./actions";

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

export function CalendarioClient({ eventos }: { eventos: UpcomingEvent[] }) {
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
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-tertiary)", textAlign: "left" }}>
                <th style={thStyle}>Evento</th>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Industria</th>
                <th style={thStyle}>País / Territorio</th>
                <th style={thStyle}>Responsable</th>
                <th style={thStyle}>Metas</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {proximos.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-tertiary)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{e.nombre}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {fmtFecha(e.fecha)}{e.fecha_fin ? ` → ${fmtFecha(e.fecha_fin)}` : ""}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: TIPO_COLOR[e.tipo] }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: TIPO_COLOR[e.tipo] }} />
                      {e.tipo}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{e.industria ?? "—"}</td>
                  <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>
                    {e.pais ?? "—"}{e.territorio ? ` · ${e.territorio}` : ""}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--fg-secondary)" }}>{e.responsable ?? "—"}</td>
                  <td style={{ ...tdStyle, color: "var(--fg-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {e.meta_qms != null || e.meta_mrr != null
                      ? `${e.meta_qms ?? "—"} QMs · $${Number(e.meta_mrr ?? 0).toLocaleString("es-AR")}`
                      : "—"}
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
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <button
                      onClick={() => setEditing(e)}
                      style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border-tertiary)", background: "var(--bg-secondary)", color: "var(--fg-secondary)", cursor: "pointer" }}
                    >
                      editar →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EventForm
          evento={editing === "nuevo" ? null : editing}
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

// Alta/edición de un evento del calendario.
function EventForm({
  evento,
  fechaPrefill,
  onClose,
}: {
  evento: UpcomingEvent | null;
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
      </div>

      {evento && (evento.ppt_link || evento.plan_fm_link || evento.plan_ventas_link) && (
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {evento.ppt_link && <a href={evento.ppt_link} target="_blank" rel="noopener noreferrer" style={linkChip}>📊 PPT Atom ↗</a>}
          {evento.plan_fm_link && <a href={evento.plan_fm_link} target="_blank" rel="noopener noreferrer" style={linkChip}>📋 Plan FM ↗</a>}
          {evento.plan_ventas_link && <a href={evento.plan_ventas_link} target="_blank" rel="noopener noreferrer" style={linkChip}>💼 Plan Ventas ↗</a>}
        </div>
      )}

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
