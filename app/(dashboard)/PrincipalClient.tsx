"use client";

import { useMemo, useState } from "react";
import { EventSummary, PartnerByEvent } from "@/lib/supabase";
import { StatCard } from "@/components/StatCard";
import { EventCard } from "@/components/EventCard";
import { EventModal } from "@/components/EventModal";
import {
  TipoEventoPills,
  TerritorioPills,
  type TipoFilter,
  type TerritorioFilter,
} from "@/components/EventFilters";
import { DateFilter, filterByDateRange, type DateRange } from "@/components/DateFilter";
import { formatCurrency } from "@/lib/format";

export function PrincipalClient({
  events: initialEvents,
  partners,
}: {
  events: EventSummary[];
  partners: PartnerByEvent[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [tipo, setTipo] = useState<TipoFilter>("todos");
  const [territorio, setTerritorio] = useState<TerritorioFilter>("todos");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [selected, setSelected] = useState<EventSummary | null>(null);

  const partnerByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partners) {
      if (!map.has(p.luma_event_id)) map.set(p.luma_event_id, p.partner);
    }
    return map;
  }, [partners]);

  const inRange = useMemo(() => filterByDateRange(events, dateRange), [events, dateRange]);

  const tipoCounts = useMemo(() => {
    const c: Record<TipoFilter, number> = { todos: inRange.length, Presencial: 0, Virtual: 0, "Third Party": 0 };
    for (const e of inRange) {
      if (e.evento_tipo === "Presencial") c.Presencial++;
      else if (e.evento_tipo === "Virtual") c.Virtual++;
      else if (e.evento_tipo === "Third Party") c["Third Party"]++;
    }
    return c;
  }, [inRange]);

  const territorioCounts = useMemo(() => {
    const c: Record<TerritorioFilter, number> = { todos: inRange.length, Norte: 0, Sur: 0, Brasil: 0 };
    for (const e of inRange) {
      if (e.territorio === "Norte") c.Norte++;
      else if (e.territorio === "Sur") c.Sur++;
      else if (e.territorio === "Brasil") c.Brasil++;
    }
    return c;
  }, [inRange]);

  const filtered = useMemo(() => {
    return inRange.filter((e) => {
      if (tipo !== "todos" && e.evento_tipo !== tipo) return false;
      if (territorio !== "todos" && e.territorio !== territorio) return false;
      return true;
    });
  }, [inRange, tipo, territorio]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => ({
          // 2026-05-27 (Jose): Registros = aceptados. Mantenemos totalRegs aparte para el sub.
          registros: acc.registros + e.total_aprobados_icp,
          totalRegs: acc.totalRegs + e.total_registros,
          asistentes: acc.asistentes + e.total_asistentes,
          qmAgend: acc.qmAgend + e.qm_agendada,
          qmAsist: acc.qmAsist + e.qm_asistida,
          demo: acc.demo + e.demo,
          won: acc.won + e.won,
          mrr: acc.mrr + Number(e.mrr_won),
          cost: acc.cost + Number(e.event_cost),
        }),
        { registros: 0, totalRegs: 0, asistentes: 0, qmAgend: 0, qmAsist: 0, demo: 0, won: 0, mrr: 0, cost: 0 }
      ),
    [filtered]
  );

  const tasaAsis = totals.registros > 0 ? Math.round((totals.asistentes / totals.registros) * 100) : 0;
  const descalif = Math.max(totals.totalRegs - totals.registros, 0);

  function handleUpdate(updated: EventSummary) {
    setEvents((prev) => prev.map((e) => (e.luma_event_id === updated.luma_event_id ? updated : e)));
    setSelected(updated);
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <TipoEventoPills value={tipo} onChange={setTipo} counts={tipoCounts} />
        <TerritorioPills value={territorio} onChange={setTerritorio} counts={territorioCounts} />
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12, marginBottom: 32 }}>
        <StatCard value={totals.registros} label="Registros" sub={`${totals.totalRegs} totales · ${descalif} descalif.`} metricKey="total_registros" />
        <StatCard value={totals.asistentes} label="Asistentes" sub={`${tasaAsis}% asist.`} metricKey="total_asistentes" />
        <StatCard value={totals.qmAgend} label="QM Agend." color="var(--fg-status-warning)" metricKey="total_qm_agend" />
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
            partner={partnerByEvent.get(e.luma_event_id)}
            onClick={setSelected}
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
        partner={selected ? partnerByEvent.get(selected.luma_event_id) : undefined}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
