import { supabase, EventSummary, PartnerByEvent } from "@/lib/supabase";
import { PrincipalClient } from "./PrincipalClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [{ data: events }, { data: partners }] = await Promise.all([
    // fm_dashboard_all = eventos regulares (Luma) + third-party unificados. Jose 2026-07-10.
    supabase.from("fm_dashboard_all").select("*").order("evento_fecha", { ascending: false }),
    supabase.from("fm_partners_by_event").select("*"),
  ]);

  return (
    <PrincipalClient
      events={(events ?? []) as EventSummary[]}
      partners={(partners ?? []) as PartnerByEvent[]}
    />
  );
}
