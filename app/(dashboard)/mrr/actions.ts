"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { defaultTerritorio } from "@/lib/territories";

// 2026-07-10 (Jose): asignar manualmente el país de un deal en MRR Cerrado.
// Muchos deals corresponden a un país pero el evento no tiene territorio mapeado,
// así que no filtran bien. Este override (por deal) le gana al territorio del evento.
// pais = null → borra el override y vuelve al territorio derivado del evento.
export async function saveDealTerritory(dealId: string, pais: string | null) {
  const p = pais?.trim() || null;

  if (!p) {
    const { error } = await supabase
      .from("fm_deal_territory_overrides")
      .delete()
      .eq("attio_deal_id", dealId);
    if (error) throw new Error(error.message);
  } else {
    const territorio = defaultTerritorio(p);
    const { error } = await supabase
      .from("fm_deal_territory_overrides")
      .upsert(
        { attio_deal_id: dealId, pais: p, territorio, updated_at: new Date().toISOString() },
        { onConflict: "attio_deal_id" }
      );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/mrr");
  return { success: true };
}
