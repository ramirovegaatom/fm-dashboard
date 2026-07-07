"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

// 2026-07-07: registro manual de eventos third-party (José llena nombre/fecha/país,
// oculta slugs basura/test). El slug (campana_evento) es la clave.
export async function saveThirdPartyEvent(
  slug: string,
  fields: {
    evento_nombre?: string | null;
    evento_fecha?: string | null;
    pais?: string | null;
    territorio?: string | null;
  }
) {
  const patch: Record<string, unknown> = {
    campana_evento: slug,
    updated_at: new Date().toISOString(),
  };
  if (fields.evento_nombre !== undefined) patch.evento_nombre = fields.evento_nombre || null;
  if (fields.evento_fecha !== undefined) patch.evento_fecha = fields.evento_fecha || null;
  if (fields.pais !== undefined) patch.pais = fields.pais || null;
  if (fields.territorio !== undefined) patch.territorio = fields.territorio || null;

  const { error } = await supabase
    .from("fm_third_party_events")
    .upsert(patch, { onConflict: "campana_evento" });
  if (error) throw new Error(error.message);
  revalidatePath("/third-party");
  return { success: true };
}

export async function setThirdPartyHidden(slug: string, hidden: boolean) {
  const { error } = await supabase
    .from("fm_third_party_events")
    .upsert(
      { campana_evento: slug, hidden, updated_at: new Date().toISOString() },
      { onConflict: "campana_evento" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/third-party");
  return { success: true };
}
