import { fetchDailyProgress, fetchWeeklyHitos, fetchCampanaFechas } from "@/lib/supabase";
import { SemanalClient } from "./SemanalClient";

export const dynamic = "force-dynamic";

export default async function SemanalPage() {
  const [dias, hitos, fechasEvento] = await Promise.all([
    fetchDailyProgress(),
    fetchWeeklyHitos(),
    fetchCampanaFechas(),
  ]);
  return <SemanalClient dias={dias} hitos={hitos} fechasEvento={fechasEvento} />;
}
