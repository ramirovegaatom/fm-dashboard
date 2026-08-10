"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SeguimientoCompany } from "@/lib/supabase";
import { attioCompanyUrl } from "@/lib/attio";
import { reassignBdrAction, descartarCompaniesAction } from "./actions";

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
  // ≥2 CONTACTOS con estructura (3 llamadas + 2 WA o 2+3) cada uno. Procesada/Lost en Attio
  // sin circuito NO cuentan en esa etapa — aparecen en su etapa real con ⚠. Las etapas son
  // EXCLUYENTES (cada empresa cuenta en una sola, la más avanzada); en el funnel general se
  // presentan de forma acumulativa: "Procesadas" = positiva + sin respuesta + dropoff + recycle.
  { key: "procesada", label: "Procesada sin respuesta", labelCorto: "Sin respuesta", detalle: "circuito completo (2+ contactos con 3 llamadas + 2 WhatsApp c/u) sin llegar a respuesta positiva; incluye Lost con circuito", color: "var(--fg-secondary)" },
  // Los QM/Cliente cuentan acá SIN exigir circuito (Candela 2026-08-06: los contactos de
  // evento vienen calientes y pueden convertir antes de completarlo — válido, con badge).
  { key: "respuesta_positiva", label: "Respuesta positiva", labelCorto: "Resp. positiva", detalle: "QM Agendada, QM Show, QM No Show, Cliente — válida aun sin circuito completo", color: "var(--fg-status-success)" },
  { key: "dropoff", label: "DropOff", labelCorto: "DropOff", detalle: "Descalificadas (no ICP) — las sin circuito completo llevan marca para revisar", color: "var(--fg-status-warning)" },
  // José 2026-07-17: Recycle separado de DropOff — no son lo mismo (vuelven al pool).
  // 2026-08-06 iter. 2 (Ramiro): mismo tratamiento que Descalificada — cuentan acá aunque
  // no tengan circuito, marcadas (antes se degradaban y el funnel mostraba 0 con 66 en Attio).
  { key: "recycle", label: "Recycle", labelCorto: "Recycle", detalle: "recicladas al pool — las sin circuito completo llevan marca para revisar", color: "var(--fg-status-brand)" },
];

// Etapas que componen el acumulado "Procesadas" del funnel (terminaron su procesamiento).
export const ETAPAS_PROCESADAS: EtapaKey[] = ["respuesta_positiva", "procesada", "dropoff", "recycle"];

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
        {c.descartada_dashboard && (
          <span
            className="badge"
            title="Descartada desde el dashboard: se decidió no asignarla a ningún BDR (no califica). Cuenta en DropOff como descarte deliberado — no es una descalificación del BDR sin circuito."
            style={{ background: "var(--bg-secondary)", color: "var(--fg-quaternary)", fontSize: 10, fontWeight: 700, cursor: "help" }}
          >
            descartada
          </span>
        )}
        {c.recycle_sin_circuito && (
          <span
            className="badge"
            title={`Reciclada en Attio sin circuito completo (${c.contactos_con_circuito}/2 contactos con estructura). Cuenta en Recycle pero se devolvió al pool sin trabajar el circuito — para revisar.`}
            style={{ background: "var(--bg-status-error, var(--bg-secondary))", color: "var(--fg-status-error)", fontSize: 10, fontWeight: 700, cursor: "help" }}
          >
            recycle sin circuito
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
  const [msgEsError, setMsgEsError] = useState(false);
  // 2026-08-10: la confirmación es INLINE, no con confirm() del navegador. Si Chrome tiene
  // los diálogos suprimidos en la pestaña (pasa al tildar "no volver a mostrar" o por
  // política), confirm() devuelve false y el click no hacía NADA ni mostraba error — que es
  // exactamente el síntoma que reportó Ramiro con el botón de descartar.
  const [confirmando, setConfirmando] = useState<"descartar" | "reasignar" | null>(null);
  const [isPending, startTransition] = useTransition();

  if (selected.size === 0 && !msg) return null;
  const verbo = assign ? "Asignar" : "Reasignar";

  function reportar(res: { success: boolean; updated: number; errors?: string[]; error?: string; bdrName?: string | null }, accion: string) {
    // Si no se actualizó ninguna y hubo errores, es un FALLO: se muestra en rojo con el
    // detalle crudo (antes decía "✓ 0 empresas descartadas" y parecía éxito).
    if (!res.success) {
      setMsg(`✗ Error al ${accion}: ${res.error ?? "sin detalle"}`);
      setMsgEsError(true);
      return;
    }
    if (res.updated === 0) {
      setMsg(`✗ No se pudo ${accion} ninguna empresa${res.errors?.length ? `: ${res.errors[0].substring(0, 160)}` : " (sin detalle del error)"}`);
      setMsgEsError(true);
      return;
    }
    const errDetail = res.errors?.length ? ` · ${res.errors.length} con error (${res.errors[0].substring(0, 120)})` : "";
    setMsg(`✓ ${res.updated} empresa${res.updated === 1 ? "" : "s"} ${accion === "descartar" ? "descartada" : "actualizada"}${res.updated === 1 ? "" : "s"}${errDetail}`);
    setMsgEsError(false);
  }

  // Descarte en bulk (Ramiro 2026-08-06): para las empresas del pool que no califican para
  // asignarse a nadie y quedaban por siempre en "sin BDR asignado". Escribe Descalificada
  // en Attio y las registra como descartadas (badge "descartada", sin flag de revisión).
  function handleDescartar() {
    setConfirmando(null);
    startTransition(async () => {
      const res = await descartarCompaniesAction([...selected]);
      reportar(res, "descartar");
      if (res.success && res.updated > 0) {
        onClear();
        router.refresh();
      }
      setTimeout(() => setMsg(null), 15000);
    });
  }

  function handleReassign() {
    const target = bdrOptions.find((b) => b.id === bdrId);
    if (!target) return;
    setConfirmando(null);
    startTransition(async () => {
      const res = await reassignBdrAction([...selected], target.id);
      reportar(res, verbo.toLowerCase());
      if (res.success && res.updated > 0) {
        setMsg(`✓ ${res.updated} empresa${res.updated === 1 ? "" : "s"} ${assign ? "asignada" : "reasignada"}${res.updated === 1 ? "" : "s"} a ${res.bdrName ?? target.name}`);
        onClear();
        setBdrId("");
        router.refresh();
      }
      setTimeout(() => setMsg(null), 15000);
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
          {confirmando === null ? (
            <>
              <button
                onClick={() => setConfirmando("reasignar")}
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
              <span style={{ width: 1, height: 18, background: "var(--border-tertiary)" }} />
              <button
                onClick={() => setConfirmando("descartar")}
                disabled={isPending}
                title="Para empresas que no califican para asignar a ningún BDR: las marca Descalificada en Attio y salen del pool"
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                  border: "1px solid var(--fg-status-error)", background: "transparent",
                  color: "var(--fg-status-error)", cursor: isPending ? "default" : "pointer",
                }}
              >
                {isPending ? "Descartando…" : "Descartar (no asignar)"}
              </button>
              <button
                onClick={onClear}
                disabled={isPending}
                style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--fg-quaternary)" }}
              >
                Limpiar selección
              </button>
            </>
          ) : (
            /* Confirmación inline: sin depender del confirm() del navegador */
            <>
              <span style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                {confirmando === "descartar"
                  ? <>Se marcan <strong>Descalificada</strong> en Attio y salen del pool de asignación. ¿Confirmás?</>
                  : <>Se escribe el <strong>Assigned BDR</strong> en Attio para {selected.size} empresa{selected.size === 1 ? "" : "s"}. ¿Confirmás?</>}
              </span>
              <button
                onClick={confirmando === "descartar" ? handleDescartar : handleReassign}
                disabled={isPending}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none",
                  background: confirmando === "descartar" ? "var(--fg-status-error)" : "var(--bg-inverse-primary)",
                  color: confirmando === "descartar" ? "#fff" : "var(--fg-inverse-primary)",
                  cursor: isPending ? "default" : "pointer",
                }}
              >
                {isPending ? "Aplicando…" : `Sí, ${confirmando}`}
              </button>
              <button
                onClick={() => setConfirmando(null)}
                disabled={isPending}
                style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--fg-quaternary)" }}
              >
                Cancelar
              </button>
            </>
          )}
        </>
      ) : null}
      {msg && (
        <span style={{ fontSize: 12, fontWeight: 600, color: msgEsError ? "var(--fg-status-error)" : "var(--fg-status-success)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
