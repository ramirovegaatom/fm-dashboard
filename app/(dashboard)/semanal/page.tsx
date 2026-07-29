import { fetchWeeklyProgress } from "@/lib/supabase";
import { SemanalClient } from "./SemanalClient";

export const dynamic = "force-dynamic";

export default async function SemanalPage() {
  const rows = await fetchWeeklyProgress();
  return <SemanalClient rows={rows} />;
}
