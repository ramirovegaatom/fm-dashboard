import { supabase, WonByCloseDate, fetchDealsSinAtribuir, fetchCampanaOptions } from "@/lib/supabase";
import { MrrClient } from "./MrrClient";
import { SinAtribuirSection } from "./SinAtribuirSection";

export const dynamic = "force-dynamic";

// Pestaña "Deals" (ex "MRR cerrado", José 2026-08-19): arriba el MRR cerrado de siempre,
// abajo la cola de revisión de deals de evento sin atribuir.
export default async function MrrPage() {
  const [{ data }, sinAtribuir, options] = await Promise.all([
    supabase.from("fm_won_by_close_date").select("*").order("close_date", { ascending: false }),
    fetchDealsSinAtribuir(),
    fetchCampanaOptions(),
  ]);

  return (
    <div>
      <MrrClient deals={(data ?? []) as WonByCloseDate[]} />
      <SinAtribuirSection rows={sinAtribuir} options={options} />
    </div>
  );
}
