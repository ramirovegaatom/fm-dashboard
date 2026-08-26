import { fetchSeguimientoCompanies, fetchCohortesEntrega, fetchWonByCloseDate } from "@/lib/supabase";
import { SeguimientoClient } from "./SeguimientoClient";

export const dynamic = "force-dynamic";

// Sección Seguimiento (spec del equipo, 2026-07-11): avance de las empresas generadas
// por marketing a través del embudo comercial + desempeño de BDRs en el procesamiento.
export default async function SeguimientoPage() {
  // Reporte semanal de gestión (José + Cande 2026-08-26): cohortes de entrada a PRE-QM + wons.
  const [all, cohortes, wons] = await Promise.all([fetchSeguimientoCompanies(), fetchCohortesEntrega(), fetchWonByCloseDate()]);
  return <SeguimientoClient companies={all} cohortes={cohortes} wons={wons} />;
}
