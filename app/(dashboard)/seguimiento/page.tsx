import { supabase, SeguimientoCompany } from "@/lib/supabase";
import { SeguimientoClient } from "./SeguimientoClient";

export const dynamic = "force-dynamic";

// Sección Seguimiento (spec del equipo, 2026-07-11): avance de las empresas generadas
// por marketing a través del embudo comercial + desempeño de BDRs en el procesamiento.
export default async function SeguimientoPage() {
  // La vista tiene ~2.4k filas y PostgREST corta en 1000 por request: paginamos.
  const all: SeguimientoCompany[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("fm_seguimiento_companies")
      .select("*")
      .order("campana_evento")
      .order("company_name")
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as SeguimientoCompany[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  return <SeguimientoClient companies={all} />;
}
