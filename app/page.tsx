import { supabase, EventSummary, PartnerByEvent } from "@/lib/supabase";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [{ data: events }, { data: partners }] = await Promise.all([
    supabase.from("fm_dashboard").select("*").order("evento_fecha", { ascending: false }),
    supabase.from("fm_partners_by_event").select("*"),
  ]);

  return (
    <DashboardClient
      events={(events ?? []) as EventSummary[]}
      partners={(partners ?? []) as PartnerByEvent[]}
    />
  );
}
