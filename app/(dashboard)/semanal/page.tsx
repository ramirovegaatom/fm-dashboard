import { fetchDailyProgress, fetchWeeklyHitos, fetchCampanaFechas, fetchBdrCompanies } from "@/lib/supabase";
import { SemanalClient } from "./SemanalClient";

export const dynamic = "force-dynamic";

export default async function SemanalPage() {
  const [dias, hitos, fechasEvento, bdrCompanies] = await Promise.all([
    fetchDailyProgress(),
    fetchWeeklyHitos(),
    fetchCampanaFechas(),
    fetchBdrCompanies(),
  ]);
  return <SemanalClient dias={dias} hitos={hitos} fechasEvento={fechasEvento} bdrCompanies={bdrCompanies} />;
}
