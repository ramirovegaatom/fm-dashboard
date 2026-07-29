import { fetchWeeklyProgress, fetchWeeklyHitos } from "@/lib/supabase";
import { SemanalClient } from "./SemanalClient";

export const dynamic = "force-dynamic";

export default async function SemanalPage() {
  const [rows, hitos] = await Promise.all([fetchWeeklyProgress(), fetchWeeklyHitos()]);
  return <SemanalClient rows={rows} hitos={hitos} />;
}
