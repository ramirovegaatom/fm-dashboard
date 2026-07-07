import { supabase, ThirdPartySummary } from "@/lib/supabase";
import { ThirdPartyClient } from "./ThirdPartyClient";

export const dynamic = "force-dynamic";

export default async function ThirdPartyPage() {
  const { data } = await supabase.from("fm_third_party_summary").select("*");
  return <ThirdPartyClient events={(data ?? []) as ThirdPartySummary[]} />;
}
