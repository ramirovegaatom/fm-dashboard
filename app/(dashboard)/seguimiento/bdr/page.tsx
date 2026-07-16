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

  return <BdrDetailClient bdrName={bdrName} companies={all} />;
}
