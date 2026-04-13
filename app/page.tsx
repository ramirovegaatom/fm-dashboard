import { supabase, EventSummary } from "@/lib/supabase";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { data: events } = await supabase
    .from("fm_dashboard")
    .select("*")
    .order("evento_fecha", { ascending: false });

  return <DashboardClient events={(events ?? []) as EventSummary[]} />;
}
