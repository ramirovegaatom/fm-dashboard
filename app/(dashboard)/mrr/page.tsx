import { supabase, WonByCloseDate } from "@/lib/supabase";
import { MrrClient } from "./MrrClient";

export const dynamic = "force-dynamic";

export default async function MrrPage() {
  const { data } = await supabase
    .from("fm_won_by_close_date")
    .select("*")
    .order("close_date", { ascending: false });

  return <MrrClient deals={(data ?? []) as WonByCloseDate[]} />;
}
