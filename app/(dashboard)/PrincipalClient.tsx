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
  const [selected, setSelected] = useState<EventSummary | null>(null);

  const partnerByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partners) {
      if (!map.has(p.luma_event_id)) map.set(p.luma_event_id, p.partner);
    }
    return map;
  }, [partners]);

  const tipoCounts = useMemo(() => {
    const c: Record<TipoFilter, number> = { todos: events.length, Presencial: 0, Virtual: 0, "Third Party": 0 };
    for (const e of events) {
      if (e.evento_tipo === "Presencial") c.Presencial++;
      else if (e.evento_tipo === "Virtual") c.Virtual++;
      else if (e.evento_tipo === "Third Party") c["Third Party"]++;
    }
    return c;
  }, [events]);

  const territorioCounts = useMemo(() => {
    const c: Record<TerritorioFilter, number> = { todos: events.length, Norte: 0, Sur: 0, Brasil: 0 };
    for (const e of events) {
      if (e.territorio === "Norte") c.Norte++;
      else if (e.territorio === "Sur") c.Sur++;
      else if (e.territorio === "Brasil") c.Brasil++;
    }
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (tipo !== "todos" && e.evento_tipo !== tipo) return false;
      if (territorio !== "todos" && e.territorio !== territorio) return false;
      return true;
    });
  }, [events, tipo, territorio]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => ({
          registros: acc.registros + e.total_registros,
          asistentes: acc.asistentes + e.total_asistentes,
          qmAgend: acc.qmAgend + e.qm_agendada,
          qmAsist: acc.qmAsist + e.qm_asistida,
          demo: acc.demo + e.demo,
          won: acc.won + e.won,
          mrr: acc.mrr + Number(e.mrr_won),
          cost: acc.cost + Number(e.event_cost),
        }),
        { registros: 0, asistentes: 0, qmAgend: 0, qmAsist: 0, demo: 0, won: 0, mrr: 0, cost: 0 }
      ),
    [filtered]
  );

  const tasaAsis = totals.registros > 0 ? Math.round((totals.asistentes / totals.registros) * 100) : 0;

  function handleUpdate(updated: EventSummary) {
    setEvents((prev) => prev.map((e) => (e.luma_event_id === updated.luma_event_id ? updated : e)));
    setSelected(updated);
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <TipoEventoPills value={tipo} onChange={setTipo} counts={tipoCounts} />
        <TerritorioPills value={territorio} onChange={setTerritorio} counts={territorioCounts} />
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 12, marginBottom: 32 }}>
        <StatCard value={totals.registros} label="Registros" />
        <StatCard value={totals.asistentes} label="Asistentes" sub={`${tasaAsis}% asist.`} />
        <StatCard value={totals.qmAgend} label="QM Agend." color="var(--fg-status-warning)" />
        <StatCard value={totals.qmAsist} label="QM Asist." color="var(--fg-status-warning)" />
        <StatCard value={totals.demo} label="Demo" />
        <StatCard value={totals.won} label="Won" color="var(--fg-status-info)" />
        <StatCard value={formatCurrency(totals.mrr)} label="MRR Won" color="var(--fg-status-success)" />
        <StatCard value={formatCurrency(totals.cost)} label="Costo total" />
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
