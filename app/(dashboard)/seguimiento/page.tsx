import { fetchSeguimientoCompanies, fetchCohortesEntrega, fetchWonByCloseDate, fetchBacklogSeries } from "@/lib/supabase";
import { SeguimientoClient } from "./SeguimientoClient";

export const dynamic = "force-dynamic";

// Sección Seguimiento (spec del equipo, 2026-07-11): avance de las empresas generadas
// por marketing a través del embudo comercial + desempeño de BDRs en el procesamiento.
export default async function SeguimientoPage() {
  // Reporte semanal de gestión (José + Cande 2026-08-26): cohortes de entrada a PRE-QM + wons.
  // Backlog diario "Por procesar" (Camilo 2026-08-27): fotos de fm_backlog_snapshots.
  const [all, cohortes, wons, backlog] = await Promise.all([
    fetchSeguimientoCompanies(),
    fetchCohortesEntrega(),
    fetchWonByCloseDate(),
    fetchBacklogSeries(),
  ]);
  // "Hoy" del reporte en hora Argentina (UTC decía 27-ago a las 21hs del 26). Se calcula acá
  // para que SSR y cliente rendericen el mismo string (sin hydration mismatch).
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <SeguimientoClient companies={all} cohortes={cohortes} wons={wons} backlog={backlog} hoy={hoy} />;
}
