"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SeguimientoCompany } from "@/lib/supabase";
import { attioCompanyUrl } from "@/lib/attio";
import { reassignBdrAction } from "./actions";

// Piezas compartidas entre la vista general de Seguimiento y el detalle por BDR.
export type EtapaKey = SeguimientoCompany["etapa_funnel"];

export const SIN_BDR = "— Sin BDR asignado —";

// Wording José 2026-07-17: Sin procesar / Procesando / Procesada (antes: Sin prospectar /
// Siendo prospectadas / Procesadas). Las keys SQL no cambian.
export const ETAPAS: { key: EtapaKey; label: string; labelCorto: string; detalle: string; color: string }[] = [
  { key: "sin_prospectar", label: "Sin procesar", labelCorto: "Sin procesar", detalle: "PRE-QM + sin actividad (vacío, Ready, Not Started)", color: "var(--fg-status-error)" },
  { key: "siendo_prospectada", label: "Procesando", labelCorto: "Procesando", detalle: "Con contacto, Procesando, o con actividades iniciadas", color: "var(--fg-status-info)" },
  // 2026-07-23 (Ramiro): la fuente de verdad de estas etapas son las ACTIVIDADES, no el
  // stage manual de Attio. Circuito v2 (Ramiro+Candela 2026-08-06): circuito completo =
  // ≥2 CONTACTOS con estructura (3 llamadas + 2 WA o 2+3) cada uno. Procesada/Lost/RECYCLE
  // en Attio sin circuito NO cuentan en esa etapa — aparecen en su etapa real con ⚠.
  { key: "procesada", label: "Procesada", labelCorto: "Procesada", detalle: "circuito completo: 2+ contactos con 3 llamadas + 2 WhatsApp (o 2+3) cada uno; incluye Lost con circuito", color: "var(--fg-secondary)" },
  // Los QM/Cliente cuentan acá SIN exigir circuito (Candela 2026-08-06: los contactos de
  // evento vienen calientes y pueden convertir antes de completarlo — válido, con badge).
  { key: "respuesta_positiva", label: "Respuesta positiva", labelCorto: "Resp. positiva", detalle: "QM Agendada, QM Show, QM No Show, Cliente — válida aun sin circuito completo", color: "var(--fg-status-success)" },
  { key: "dropoff", label: "DropOff", labelCorto: "DropOff", detalle: "Descalificadas (no ICP) — las sin circuito completo llevan marca para revisar", color: "var(--fg-status-warning)" },
  // José 2026-07-17: Recycle separado de DropOff — no son lo mismo (vuelven al pool).
  { key: "recycle", label: "Recycle", labelCorto: "Recycle", detalle: "recicladas al pool — solo cuentan acá con circuito completo", color: "var(--fg-status-brand)" },
];

export const etapaRank = (e: EtapaKey) => ETAPAS.findIndex((x) => x.key === e);

// Fila de empresa: checkbox de selección (opcional, para reasignar), etapa (opcional),
// BDR (opcional), outbound stage, actividades, fecha de asignación, Attio.
export function CompanyRow({ c, showEtapa, showBdr, selected, onToggleSelect }: {
  c: SeguimientoCompany;
  showEtapa: boolean;
  showBdr?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const etapa = ETAPAS.find((e) => e.key === c.etapa_funnel);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border-tertiary)", background: selected ? "var(--bg-secondary)" : undefined }}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          title="Seleccionar para reasignar BDR"
          style={{ width: 15, height: 15, flexShrink: 0, cursor: "pointer", accentColor: "var(--fg-primary)" }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.company_name ?? "— sin nombre —"}
        </div>
        <div className="text-muted" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {showBdr ? `${c.assigned_bdr_name ?? "Sin BDR asignado"} · ` : ""}{c.campana_evento}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {showEtapa && etapa && (
          <span className="badge" style={{ background: "var(--bg-secondary)", color: etapa.color, fontSize: 10, fontWeight: 700 }}>
            {etapa.labelCorto}
          </span>
        )}
        <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)", fontSize: 10 }}>
          {c.outbound_stage ?? "sin stage"}
        </span>
        {c.terminal_sin_circuito && (
          <span
            className="badge"
            title={`Marcada "${c.outbound_stage}" en Attio pero sin circuito completo (${c.contactos_con_circuito}/2 contactos con 3 llamadas + 2 WhatsApp c/u). La fuente de verdad son las actividades: acá cuenta en su etapa real.`}
            style={{ background: "var(--bg-status-warning, var(--bg-secondary))", color: "var(--fg-status-warning)", fontSize: 10, fontWeight: 700, cursor: "help" }}
          >
            ⚠ sin circuito
          </span>
        )}
        {c.descalificada_sin_circuito && (
          <span
            className="badge"
            title={`Descalificada en Attio sin circuito completo (${c.contactos_con_circuito}/2 contactos). Puede ser válida (industria u otros filtros) — el criterio queda pendiente de mapear con Candela. Cuenta en DropOff.`}
            style={{ background: "var(--bg-status-error, var(--bg-secondary))", color: "var(--fg-status-error)", fontSize: 10, fontWeight: 700, cursor: "help" }}
          >
            desc. sin circuito
          </span>
        )}
        {c.positiva_sin_circuito && (
          <span
            className="badge"
            title={`Llegó a respuesta positiva sin completar el circuito (${c.contactos_con_circuito}/2 contactos) — contacto caliente del evento. Válido; el badge es solo informativo.`}
            style={{ background: "var(--bg-secondary)", color: "var(--fg-status-success)", fontSize: 10, fontWeight: 700, cursor: "help" }}
          >
            por stage
          </span>
        )}
        <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={`Llamadas + WhatsApps registrados · contactos con estructura completa (de los 2 que exige el circuito)`}>
          {c.actividades_prospeccion} act. · {c.contactos_con_circuito}/2{c.estructura_completa ? " ✓" : ""}
        </span>
        <span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
          {c.bdr_assigned_at
            ? `asig. ${new Date(c.bdr_assigned_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}`
            : "sin fecha"}
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
}

// Barra de reasignación en bulk (Stefany/José 2026-07-17): con N empresas seleccionadas,
// elegís el BDR destino y escribe el Assigned BDR en Attio (vía edge fn) + reflejo local.
// assign=true (2026-07-23, Camilo): modo "asignar" para el pool sin BDR — mismo flujo,
// wording distinto. Si hay errores, se muestra el primero (antes solo el conteo y el
// diagnóstico era a ciegas — lección del 403 por token read-only).
export function ReassignBar({
  selected,
  bdrOptions,
  onClear,
  assign,
}: {
  selected: Set<string>;
  bdrOptions: { id: string; name: string }[];
  onClear: () => void;
  assign?: boolean;
}) {
  const router = useRouter();
  const [bdrId, setBdrId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (selected.size === 0 && !msg) return null;
  const verbo = assign ? "Asignar" : "Reasignar";

  function handleReassign() {
    const target = bdrOptions.find((b) => b.id === bdrId);
    if (!target) return;
    if (!confirm(`¿${verbo} ${selected.size} empresa${selected.size === 1 ? "" : "s"} a ${target.name}?\n\nEsto actualiza el campo Assigned BDR en Attio.`)) return;
    startTransition(async () => {
      const res = await reassignBdrAction([...selected], target.id);
      if (res.success) {
        const errDetail = res.errors?.length
          ? ` · ${res.errors.length} con error (${res.errors[0].substring(0, 90)})`
          : "";
        setMsg(`✓ ${res.updated} empresa${res.updated === 1 ? "" : "s"} ${assign ? "asignada" : "reasignada"}${res.updated === 1 ? "" : "s"} a ${res.bdrName ?? target.name}${errDetail}`);
        onClear();
        setBdrId("");
        router.refresh();
      } else {
        setMsg(`Error al ${verbo.toLowerCase()}: ${res.error}`);
      }
      setTimeout(() => setMsg(null), 10000);
    });
  }

  return (
    <div
      className="card"
      style={{
        position: "sticky",
        top: 8,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 12,
        border: "1px solid var(--fg-primary)",
        opacity: isPending ? 0.7 : 1,
      }}
    >
      {selected.size > 0 ? (
        <>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
          </span>
          <select
            value={bdrId}
            onChange={(e) => setBdrId(e.target.value)}
            disabled={isPending}
            style={{
              padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 8,
              border: "1px solid var(--border-tertiary)", background: "var(--bg-primary)",
              color: "var(--fg-primary)", maxWidth: 260,
            }}
          >
            <option value="">{verbo} a…</option>
            {bdrOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            onClick={handleReassign}
            disabled={isPending || !bdrId}
            style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none",
              background: !bdrId ? "var(--bg-tertiary)" : "var(--bg-inverse-primary)",
              color: !bdrId ? "var(--fg-quaternary)" : "var(--fg-inverse-primary)",
              cursor: isPending || !bdrId ? "default" : "pointer",
            }}
          >
            {isPending ? `${verbo.replace(/ar$/, "ando")}…` : `${verbo} en Attio`}
          </button>
          <button
            onClick={onClear}
            disabled={isPending}
            style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--fg-quaternary)" }}
          >
            Limpiar selección
          </button>
        </>
      ) : null}
      {msg && (
        <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith("✓") ? "var(--fg-status-success)" : "var(--fg-status-error)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
