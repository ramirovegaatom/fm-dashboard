"use client";

import { useMemo, useState, useTransition } from "react";
import { ThirdPartySummary } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { saveThirdPartyEvent, setThirdPartyHidden } from "./actions";

// 2026-07-07 (Jose): eventos third-party (no-Luma). Se miden por Origen de invitación =
// Thirdparty en Attio. NO tienen asistencia/ICP (no pasan por Luma) — solo seguimiento:
// personas/empresas cargadas → QM → negocios. Nombre/fecha/país los carga José a mano.
export function ThirdPartyClient({ events }: { events: ThirdPartySummary[] }) {
  const totals = useMemo(() => {
    return {
      eventos: events.length,
      personas: events.reduce((a, e) => a + Number(e.personas_cargadas ?? 0), 0),
      empresas: events.reduce((a, e) => a + Number(e.empresas_cargadas ?? 0), 0),
      qmAgend: events.reduce((a, e) => a + Number(e.qm_agendada ?? 0), 0),
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
        ni ICP — solo seguimiento: personas/empresas cargadas → QM → negocios. Cargá nombre/fecha/país de
        cada evento; ocultá los slugs de prueba.
      </div>

      {/* Totales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
        <Total label="Eventos" value={totals.eventos} />
        <Total label="Personas" value={totals.personas} />
        <Total label="Empresas" value={totals.empresas} />
        <Total label="QM agendadas" value={totals.qmAgend} color="var(--fg-status-warning)" />
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
            <ThirdPartyRow key={e.campana_evento} e={e} />
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

function ThirdPartyRow({ e }: { e: ThirdPartySummary }) {
  const [open, setOpen] = useState(false);
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
          <Metric label="QM agend." value={e.qm_agendada} color="var(--fg-status-warning)" />
          <Metric label="QM asist." value={e.qm_asistida} />
          <Metric label="Demo" value={e.demo} />
          <Metric label="Won" value={e.won} color="var(--fg-status-info)" />
          <Metric label="MRR" value={formatCurrency(Number(e.mrr_won))} color="var(--fg-status-success)" />
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--fg-status-info)" }}
        >
          {open ? "Cerrar" : "Editar datos"}
        </button>
      </div>

      {e.empresas_en_lista === 0 && e.empresas_cargadas > 0 && (
        <div className="text-muted" style={{ fontSize: 10, marginTop: 8 }}>
          ⚠️ Empresas cargadas pero ninguna en la lista Events-Companies aún → el funnel de QM por empresa
          (QM Show) queda en 0 hasta completar el paso 5 del proceso.
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
