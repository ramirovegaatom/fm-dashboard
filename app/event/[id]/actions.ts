"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

export async function saveAdSpend(eventId: string, amount: number) {
  const { error } = await supabase
    .from("fm_event_metadata")
    .upsert(
      { luma_event_id: eventId, ad_spend: amount, updated_at: new Date().toISOString() },
      { onConflict: "luma_event_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/pauta");
  revalidatePath(`/event/${eventId}`);
  return { success: true };
}

export async function saveEventCost(eventId: string, amount: number) {
  const { error } = await supabase
    .from("fm_event_metadata")
    .upsert(
      { luma_event_id: eventId, event_cost: amount, updated_at: new Date().toISOString() },
      { onConflict: "luma_event_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/partners");
  revalidatePath(`/event/${eventId}`);
  return { success: true };
}

export async function saveTerritory(eventId: string, pais: string, territorio: "Norte" | "Sur" | "Brasil") {
  const { error } = await supabase
    .from("fm_event_metadata")
    .upsert(
      {
        luma_event_id: eventId,
        pais,
        territorio,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "luma_event_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/partners");
  revalidatePath("/pauta");
  revalidatePath(`/event/${eventId}`);
  return { success: true };
}
