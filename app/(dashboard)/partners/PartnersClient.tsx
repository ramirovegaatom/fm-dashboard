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
import { effectivePartner } from "@/lib/partner";

export function PartnersClient({
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
  const [partnerFilter, setPartnerFilter] = useState<string>("todos");
  const [selected, setSelected] = useState<EventSummary | null>(null);

  const partnerByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partners) {
      if (!map.has(p.luma_event_id)) map.set(p.luma_event_id, p.partner);
    }
    return map;
  }, [partners]);

  const partnerNames = useMemo(
    () => Array.from(new Set(partners.map((p) => p.partner).filter(Boolean))).sort(),
    [partners]
  );

  const inRange = useMemo(() => filterByDateRange(events, dateRange), [events, dateRange]);

  const partnerEvents = useMemo(
    () => inRange.filter((e) => partnerByEvent.has(e.luma_event_id)),
    [inRange, partnerByEvent]
  );

  const partnerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of partnerEvents) {
      const p = partnerByEvent.get(e.luma_event_id);
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([partner, n]) => ({ partner, eventos: n }))
      .sort((a, b) => b.eventos - a.eventos);
  }, [partnerEvents, partnerByEvent]);

  const tipoCounts = useMemo(() => {
    const c: Record<TipoFilter, number> = { todos: partnerEvents.length, Presencial: 0, Virtual: 0, "Third Party": 0 };
    for (const e of partnerEvents) {
      if (e.evento_tipo === "Presencial") c.Presencial++;
      else if (e.evento_tipo === "Virtual") c.Virtual++;
      else if (e.evento_tipo === "Third Party") c["Third Party"]++;
    }
    return c;
  }, [partnerEvents]);

  const territorioCounts = useMemo(() => {
    const c: Record<TerritorioFilter, number> = { todos: partnerEvents.length, Norte: 0, Sur: 0, Brasil: 0 };
    for (const e of partnerEvents) {
      if (e.territorio === "Norte") c.Norte++;
      else if (e.territorio === "Sur") c.Sur++;
      else if (e.territorio === "Brasil") c.Brasil++;
    }
    return c;
  }, [partnerEvents]);

  const filtered = useMemo(() => {
    return partnerEvents.filter((e) => {
      if (tipo !== "todos" && e.evento_tipo !== tipo) return false;
      if (territorio !== "todos" && e.territorio !== territorio) return false;
      if (partnerFilter !== "todos" && partnerByEvent.get(e.luma_event_id) !== partnerFilter) return false;
      return true;
    });
  }, [partnerEvents, tipo, territorio, partnerFilter, partnerByEvent]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => ({
          // 2026-05-27 (Jose): Registros = aceptados. totalRegs queda para el sub.
          registros: acc.registros + e.total_aprobados_icp,
          totalRegs: acc.totalRegs + e.total_registros,
          asistentes: acc.asistentes + e.total_asistentes,
          qmFm: acc.qmFm + e.qm_por_fm,
          qmAsist: acc.qmAsist + e.qm_asistida,
          demo: acc.demo + e.demo,
          won: acc.won + e.won,
          mrr: acc.mrr + Number(e.mrr_won),
          cost: acc.cost + Number(e.event_cost),
        }),
        { registros: 0, totalRegs: 0, asistentes: 0, qmFm: 0, qmAsist: 0, demo: 0, won: 0, mrr: 0, cost: 0 }
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
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid var(--border-tertiary)",
            background: partnerFilter === "todos" ? "var(--bg-primary)" : "var(--fg-primary)",
            color: partnerFilter === "todos" ? "var(--fg-secondary)" : "var(--bg-primary)",
          }}
        >
          <option value="todos">Todos los partners ({partnerOptions.length})</option>
          {partnerOptions.map((p) => (
            <option key={p.partner} value={p.partner}>
              {p.partner} ({p.eventos})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <TipoEventoPills value={tipo} onChange={setTipo} counts={tipoCounts} />
        <TerritorioPills value={territorio} onChange={setTerritorio} counts={territorioCounts} />
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

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

      <div className="section-title">Eventos con partner ({filtered.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((e) => (
          <EventCard
            key={e.luma_event_id}
            event={e}
            mode="principal"
            partner={effectivePartner(e, partnerByEvent.get(e.luma_event_id)) ?? undefined}
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
        partner={selected ? (effectivePartner(selected, partnerByEvent.get(selected.luma_event_id)) ?? undefined) : undefined}
        partnerOptions={partnerNames}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
