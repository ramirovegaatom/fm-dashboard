"use server";

import { revalidatePath } from "next/cache";

const SYNC_URL = "https://xwjjvocsnznikeyeqioc.supabase.co/functions/v1/fm-attio-sync";

export type ReassignResult = {
  success: boolean;
  updated: number;
  bdrName?: string | null;
  errors?: string[];
  error?: string;
};

// Reasignación en bulk del Assigned BDR (Stefany/José 2026-07-17): actualiza Attio y el
// reflejo local. La escritura a Attio la hace la edge function (tiene ATTIO_API_KEY);
// esta action se autentica con SUPABASE_SECRET_KEY (env solo-servidor, nunca llega al
// cliente). La página está detrás de Google SSO (proxy.ts), así que solo usuarios
// @atomchat.io pueden disparar esto.
export async function reassignBdrAction(companyIds: string[], bdrId: string): Promise<ReassignResult> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return { success: false, updated: 0, error: "SUPABASE_SECRET_KEY no configurada" };
  const ids = [...new Set(companyIds)].filter(Boolean).slice(0, 200);
  if (!ids.length || !bdrId) return { success: false, updated: 0, error: "Faltan empresas o BDR destino" };
  try {
    const r = await fetch(`${SYNC_URL}?phase=reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify({ company_ids: ids, bdr_id: bdrId }),
    });
    const j = (await r.json().catch(() => ({}))) as { updated?: number; bdr_name?: string; errors?: string[]; error?: string };
    if (!r.ok) return { success: false, updated: 0, error: j.error ?? `HTTP ${r.status}` };
    revalidatePath("/seguimiento");
    revalidatePath("/seguimiento/etapa");
    revalidatePath("/seguimiento/bdr");
    return { success: true, updated: j.updated ?? 0, bdrName: j.bdr_name ?? null, errors: j.errors ?? [] };
  } catch (e) {
    return { success: false, updated: 0, error: String(e) };
  }
}
