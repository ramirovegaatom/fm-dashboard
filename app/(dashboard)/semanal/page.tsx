import { fetchDailyProgress, fetchWeeklyHitos, fetchCampanaFechas, fetchBdrCompanies, fetchFunnelMovements, fetchCohortesEntrega, fetchWonByCloseDate } from "@/lib/supabase";
import { SemanalClient } from "./SemanalClient";

export const dynamic = "force-dynamic";

export default async function SemanalPage() {
  const [dias, hitos, fechasEvento, bdrCompanies, movimientos, cohortes, wons] = await Promise.all([
    fetchDailyProgress(),
    fetchWeeklyHitos(),
    fetchCampanaFechas(),
    fetchBdrCompanies(),
    fetchFunnelMovements(),
    fetchCohortesEntrega(),
    fetchWonByCloseDate(),
  ]);
  return (
    <SemanalClient
      dias={dias}
      hitos={hitos}
      fechasEvento={fechasEvento}
      bdrCompanies={bdrCompanies}
      movimientos={movimientos}
      cohortes={cohortes}
      wons={wons}
    />
  );
}
