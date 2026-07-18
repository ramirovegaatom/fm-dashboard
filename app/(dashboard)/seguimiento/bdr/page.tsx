import Link from "next/link";
import { supabase, SeguimientoCompany } from "@/lib/supabase";
import { BdrDetailClient } from "./BdrDetailClient";

export const dynamic = "force-dynamic";

const SIN_BDR = "— Sin BDR asignado —";

// Detalle por BDR (José 2026-07-17): todas las empresas asignadas a UNA persona, por
// etapa, con la info completa. Keyed por searchParam (?name=) — los nombres tienen
// espacios/acentos y el sentinel "— Sin BDR asignado —" no viaja bien como segmento.
export default async function BdrDetailPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  const bdrName = name ?? "";

  if (!bdrName) {
    return (
      <div>
        <p className="text-muted" style={{ fontSize: 13 }}>Falta el BDR.</p>
        <Link href="/seguimiento" style={{ fontSize: 13, color: "var(--fg-status-brand)", textDecoration: "none" }}>&larr; Volver a Seguimiento</Link>
      </div>
    );
  }

  // Paginamos por las dudas (PostgREST corta en 1000 por request).
  const all: SeguimientoCompany[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("fm_seguimiento_companies").select("*");
    q = bdrName === SIN_BDR ? q.is("assigned_bdr_name", null) : q.eq("assigned_bdr_name", bdrName);
    const { data } = await q.order("campana_evento").order("company_name").range(from, from + PAGE - 1);
    const rows = (data ?? []) as SeguimientoCompany[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Lista completa de BDRs (destinos posibles de la reasignación) — las empresas de esta
  // página son de UN solo BDR, así que los destinos salen de toda la vista.
  const bdrPairs: { id: string; name: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("fm_seguimiento_companies")
      .select("assigned_bdr_id, assigned_bdr_name")
      .not("assigned_bdr_id", "is", null)
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as { assigned_bdr_id: string; assigned_bdr_name: string | null }[];
    for (const r of rows) bdrPairs.push({ id: r.assigned_bdr_id, name: r.assigned_bdr_name ?? r.assigned_bdr_id });
    if (rows.length < PAGE) break;
  }
  const bdrOptions = [...new Map(bdrPairs.map((b) => [b.id, b])).values()].sort((a, b) => a.name.localeCompare(b.name));

  return <BdrDetailClient bdrName={bdrName} companies={all} bdrOptions={bdrOptions} />;
}
