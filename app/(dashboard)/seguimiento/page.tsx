import { fetchSeguimientoCompanies } from "@/lib/supabase";
import { SeguimientoClient } from "./SeguimientoClient";

export const dynamic = "force-dynamic";

// Sección Seguimiento (spec del equipo, 2026-07-11): avance de las empresas generadas
// por marketing a través del embudo comercial + desempeño de BDRs en el procesamiento.
export default async function SeguimientoPage() {
  const all = await fetchSeguimientoCompanies();
  return <SeguimientoClient companies={all} />;
}
