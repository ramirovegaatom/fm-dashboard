"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EventSummary, PartnerByEvent } from "@/lib/supabase";
import { StatCard } from "@/components/StatCard";
import { EventCard } from "@/components/EventCard";
import { EventModal } from "@/components/EventModal";
import {
  TipoEventoPills,
  TerritorioPills,
  matchTerritorio,
  countByTerritorio,
  type TipoFilter,
  type TerritorioFilter,
} from "@/components/EventFilters";
import { DateFilter, filterByDateRange, type DateRange } from "@/components/DateFilter";
import { formatCurrency } from "@/lib/format";
import { effectivePartner } from "@/lib/partner";

export function PrincipalClient({
  events: initialEvents,
  partners,
}: {
  events: EventSummary[];
  partners: PartnerByEvent[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [tipo, setTipo] = useState<TipoFilter>("todos");
  const [territorio, setTerritorio] = useState<TerritorioFilter>("todos");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<EventSummary | null>(null);

  const archivedCount = useMemo(() => events.filter((e) => e.hidden).length, [events]);

  const partnerByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partners) {
      if (!map.has(p.luma_event_id)) map.set(p.luma_event_id, p.partner);
    }
    return map;
  }, [partners]);

  const partnerOptions = useMemo(
    () => Array.from(new Set(partners.map((p) => p.partner).filter(Boolean))).sort(),
    [partners]
  );

  // Archivados: excluidos por defecto de métricas y lista. Toggle para gestionarlos.
  const byArchive = useMemo(
    () => events.filter((e) => (showArchived ? e.hidden : !e.hidden)),
    [events, showArchived]
  );
  const inRange = useMemo(() => filterByDateRange(byArchive, dateRange), [byArchive, dateRange]);

  const tipoCounts = useMemo(() => {
    const c: Record<TipoFilter, number> = { todos: inRange.length, Presencial: 0, Virtual: 0, "Third Party": 0 };
    for (const e of inRange) {
      if (e.evento_tipo === "Presencial") c.Presencial++;
      else if (e.evento_tipo === "Virtual") c.Virtual++;
      else if (e.evento_tipo === "Third Party") c["Third Party"]++;
    }
    return c;
  }, [inRange]);

  const territorioCounts = useMemo(() => countByTerritorio(inRange, (e) => e.territorio), [inRange]);

  const filtered = useMemo(() => {
    return inRange.filter((e) => {
      if (tipo !== "todos" && e.evento_tipo !== tipo) return false;
      if (!matchTerritorio(e.territorio, territorio)) return false;
      return true;
    });
  }, [inRange, tipo, territorio]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => {
          // 2026-07-10 (Jose): third-party no tiene data de asistencia (no hay inscriptos
          // Luma). Sí suma "registrados" (personas del CRM), pero NO debe entrar en la tasa
          // de asistencia. Por eso asistBase (denominador de la tasa) excluye los TP.
          const esTP = e.evento_tipo === "Third Party";
          return {
            // 2026-05-27 (Jose): Registros = aceptados. Mantenemos totalRegs aparte para el sub.
            registros: acc.registros + e.total_aprobados_icp,
            totalRegs: acc.totalRegs + e.total_registros,
            asistentes: acc.asistentes + (e.total_asistentes || e.total_joined_virtual || 0),
            asistBase: acc.asistBase + (esTP ? 0 : e.total_aprobados_icp),
            qmFm: acc.qmFm + e.qm_por_fm,
            qmAsist: acc.qmAsist + e.qm_asistida,
            demo: acc.demo + e.demo,
            won: acc.won + e.won,
            mrr: acc.mrr + Number(e.mrr_won),
            cost: acc.cost + Number(e.event_cost),
          };
        },
        { registros: 0, totalRegs: 0, asistentes: 0, asistBase: 0, qmFm: 0, qmAsist: 0, demo: 0, won: 0, mrr: 0, cost: 0 }
      ),
    [filtered]
  );

  // Tasa de asistencia sobre eventos con data de asistencia (excluye third-party).
  const tasaAsis = totals.asistBase > 0 ? Math.round((totals.asistentes / totals.asistBase) * 100) : 0;
  const descalif = Math.max(totals.totalRegs - totals.registros, 0);

  function handleUpdate(updated: EventSummary) {
    setEvents((prev) => prev.map((e) => (e.luma_event_id === updated.luma_event_id ? updated : e)));
    setSelected(updated);
  }

  // Third-party: su detalle vive en /third-party/detail (keyed por campana_evento).
  // No abrimos el modal normal porque escribiría metadata contra fm_event_metadata (Luma).
  function handleCardClick(e: EventSummary) {
    if (e.evento_tipo === "Third Party") {
      router.push(`/third-party/detail?ev=${encodeURIComponent(e.campana_evento)}`);
      return;
    }
    setSelected(e);
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <TipoEventoPills value={tipo} onChange={setTipo} counts={tipoCounts} />
        <TerritorioPills value={territorio} onChange={setTerritorio} counts={territorioCounts} />
        <DateFilter value={dateRange} onChange={setDateRange} />
        {(archivedCount > 0 || showArchived) && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border-tertiary)",
              cursor: "pointer",
              background: showArchived ? "var(--fg-status-warning)" : "var(--bg-primary)",
              color: showArchived ? "var(--bg-primary)" : "var(--fg-secondary)",
            }}
            title="Eventos archivados: no cuentan en las métricas"
          >
            {showArchived ? "← Volver a activos" : `Ver archivados (${archivedCount})`}
          </button>
        )}
      </div>
      {showArchived && (
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Mostrando <strong>eventos archivados</strong> (no cuentan en ninguna métrica). Abrí uno y usá “Desarchivar” para reincluirlo.
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12, marginBottom: 32 }}>
        <StatCard value={totals.registros} label="Registros" sub={`${totals.totalRegs} totales · ${descalif} descalif.`} metricKey="total_registros" />
        <StatCard value={totals.asistentes} label="Asistentes" sub={`${tasaAsis}% asist.`} metricKey="total_asistentes" />
        <StatCard value={totals.qmFm} label="QM FM" color="var(--fg-status-warning)" metricKey="qm_por_fm" />
        <StatCard value={totals.qmAsist} label="QM Asist." color="var(--fg-status-warning)" metricKey="total_qm_asist" />
        <StatCard value={totals.demo} label="Demo" metricKey="total_demo" />
        <StatCard value={totals.won} label="Won" color="var(--fg-status-info)" metricKey="total_won" />
        <StatCard value={formatCurrency(totals.mrr)} label="MRR Won" color="var(--fg-status-success)" metricKey="total_mrr" />
        <StatCard value={formatCurrency(totals.cost)} label="Costo total" metricKey="total_cost" />
      </div>

      {/* Events */}
      <div className="section-title">Eventos ({filtered.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((e) => (
          <EventCard
            key={e.luma_event_id}
            event={e}
            mode="principal"
            partner={effectivePartner(e, partnerByEvent.get(e.luma_event_id)) ?? undefined}
            onClick={handleCardClick}
          />
        ))}
        {filtered.length === 0 && (
          <div className="card text-muted" style={{ textAlign: "center", padding: 40 }}>
            No hay eventos con los filtros seleccionados.
          </div>
        )}
      </div>

      <EventModal
        event={selected}
        mode="principal"
        partner={selected ? (effectivePartner(selected, partnerByEvent.get(selected.luma_event_id)) ?? undefined) : undefined}
        partnerOptions={partnerOptions}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
