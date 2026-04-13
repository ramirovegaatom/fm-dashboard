"use server";

import { supabase } from "@/lib/supabase";

export async function saveAdSpend(eventId: string, amount: number) {
  const { error } = await supabase
    .from("fm_event_metadata")
    .upsert(
      { luma_event_id: eventId, ad_spend: amount, updated_at: new Date().toISOString() },
      { onConflict: "luma_event_id" }
    );

  if (error) throw new Error(error.message);
  return { success: true };
}
