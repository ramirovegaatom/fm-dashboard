import { fetchDailyProgress, fetchWeeklyHitos, fetchCampanaFechas, fetchBdrCompanies, fetchFunnelMovements } from "@/lib/supabase";
import { SemanalClient } from "./SemanalClient";

export const dynamic = "force-dynamic";

export default async function SemanalPage() {
  const [dias, hitos, fechasEvento, bdrCompanies, movimientos] = await Promise.all([
    fetchDailyProgress(),
    fetchWeeklyHitos(),
    fetchCampanaFechas(),
    fetchBdrCompanies(),
    fetchFunnelMovements(),
  ]);
  return <SemanalClient dias={dias} hitos={hitos} fechasEvento={fechasEvento} bdrCompanies={bdrCompanies} movimientos={movimientos} />;
}
