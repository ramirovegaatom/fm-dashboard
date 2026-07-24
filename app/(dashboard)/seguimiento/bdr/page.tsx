import Link from "next/link";
import { supabase, fetchSeguimientoCompanies } from "@/lib/supabase";
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

  // Perf 2026-07-23: empresas de esta persona (paginación paralela) + destinos desde la
  // vista liviana fm_bdr_options (antes esto paginaba TODA fm_seguimiento_companies solo
  // para armar el dropdown → 3 queries pesadas de más por carga).
  const [all, { data: bdrRows }] = await Promise.all([
    fetchSeguimientoCompanies(bdrName === SIN_BDR ? null : bdrName),
    supabase.from("fm_bdr_options").select("id, name"),
  ]);
  const bdrOptions = ((bdrRows ?? []) as { id: string; name: string | null }[])
    .map((b) => ({ id: b.id, name: b.name ?? b.id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <BdrDetailClient bdrName={bdrName} companies={all} bdrOptions={bdrOptions} />;
}
