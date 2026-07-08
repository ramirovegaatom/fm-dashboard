import { supabase, ThirdPartySummary, ThirdPartyCompany } from "@/lib/supabase";
import { ThirdPartyClient } from "./ThirdPartyClient";

export const dynamic = "force-dynamic";

export default async function ThirdPartyPage() {
  const [{ data: summary }, { data: companies }] = await Promise.all([
    supabase.from("fm_third_party_summary").select("*"),
    supabase.from("fm_third_party_companies_drill").select("*"),
  ]);

  // Agrupar empresas por campaña para el detalle de cada evento.
  const companiesBySlug: Record<string, ThirdPartyCompany[]> = {};
  for (const c of (companies ?? []) as ThirdPartyCompany[]) {
    (companiesBySlug[c.campana_evento] ??= []).push(c);
  }

  return (
    <ThirdPartyClient
      events={(summary ?? []) as ThirdPartySummary[]}
      companiesBySlug={companiesBySlug}
    />
  );
}
