"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { defaultTerritorio } from "@/lib/territories";

const SYNC_URL = "https://xwjjvocsnznikeyeqioc.supabase.co/functions/v1/fm-attio-sync";

export type AtribuirResult = {
  success: boolean;
  updated: number;
  errors?: string[];
  error?: string;
};

// 2026-08-19 (José): atribuir un evento a un deal de la cola de revisión. La escritura al
// tag campana_evento del DEAL en Attio la hace la edge fn (phase=atribuir, tiene
// ATTIO_API_KEY); esta action se autentica con SUPABASE_SECRET_KEY (env solo-servidor).
// Mismo patrón que reassign/descartar de Seguimiento.
export async function atribuirDealAction(dealIds: string[], slug: string): Promise<AtribuirResult> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return { success: false, updated: 0, error: "SUPABASE_SECRET_KEY no configurada" };
  const ids = [...new Set(dealIds)].filter(Boolean).slice(0, 200);
  const s = slug.trim();
  if (!ids.length || !s) return { success: false, updated: 0, error: "Faltan deals o evento destino" };
  try {
    const r = await fetch(`${SYNC_URL}?phase=atribuir`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify({ deal_ids: ids, slug: s }),
    });
    const j = (await r.json().catch(() => ({}))) as { updated?: number; errors?: string[]; error?: string };
    if (!r.ok) return { success: false, updated: 0, error: j.error ?? `HTTP ${r.status}` };
    revalidatePath("/mrr");
    return { success: true, updated: j.updated ?? 0, errors: j.errors ?? [] };
  } catch (e) {
    return { success: false, updated: 0, error: String(e) };
  }
}

// Descarte de la cola de revisión: el deal NO es atribuible a un evento concreto (o no
// corresponde). Solo local — sale de fm_deals_sin_atribuir vía fm_deal_atribucion_descartes;
// Attio no se toca (no hay nada seguro que escribir ahí).
export async function descartarDealAtribucionAction(dealIds: string[]): Promise<AtribuirResult> {
  const ids = [...new Set(dealIds)].filter(Boolean).slice(0, 200);
  if (!ids.length) return { success: false, updated: 0, error: "Faltan deals" };
  const { error } = await supabase
    .from("fm_deal_atribucion_descartes")
    .upsert(ids.map((id) => ({ attio_deal_id: id, source: "dashboard" })), { onConflict: "attio_deal_id" });
  if (error) return { success: false, updated: 0, error: error.message };
  revalidatePath("/mrr");
  return { success: true, updated: ids.length };
}

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
