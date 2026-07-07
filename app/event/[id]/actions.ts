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

// 2026-05-27 (Jose F): excluir/reincluir empresa del pipeline de un evento (visual, no Attio).
function revalidateAll(eventId: string) {
  revalidatePath("/");
  revalidatePath("/partners");
  revalidatePath("/pauta");
  revalidatePath(`/event/${eventId}`);
}

export async function excludeCompany(eventId: string, companyId: string) {
  const { error } = await supabase
    .from("fm_event_company_exclusions")
    .upsert(
      { luma_event_id: eventId, attio_company_id: companyId, excluded_by: "dashboard", excluded_at: new Date().toISOString() },
      { onConflict: "luma_event_id,attio_company_id" }
    );
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}

export async function unexcludeCompany(eventId: string, companyId: string) {
  const { error } = await supabase
    .from("fm_event_company_exclusions")
    .delete()
    .eq("luma_event_id", eventId)
    .eq("attio_company_id", companyId);
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}

// 2026-05-27 (Jose A): excluir/reincluir partner mal-atribuido de un evento.
export async function excludePartner(eventId: string, partnerName: string) {
  const { error } = await supabase
    .from("fm_partner_event_exclusions")
    .upsert(
      { luma_event_id: eventId, partner_name_text: partnerName, excluded_by: "dashboard", excluded_at: new Date().toISOString() },
      { onConflict: "luma_event_id,partner_name_text" }
    );
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}

export async function unexcludePartner(eventId: string, partnerName: string) {
  const { error } = await supabase
    .from("fm_partner_event_exclusions")
    .delete()
    .eq("luma_event_id", eventId)
    .eq("partner_name_text", partnerName);
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}

// 2026-05-27 (Jose): asignar nomenclatura de campana_evento (Attio) a un evento desde
// la plataforma. Al crear un evento nuevo, se le asigna su slug; cuando un deal se taggea
// con ese slug en Attio, el botón de sync lo trae y se atribuye automáticamente.
export async function addEventMapping(eventId: string, attioCampana: string) {
  const slug = attioCampana.trim();
  if (!slug) throw new Error("Nomenclatura vacía");
  const { error } = await supabase
    .from("fm_event_mapping")
    .upsert({ attio_campana: slug, luma_event_id: eventId }, { onConflict: "attio_campana" });
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}

export async function removeEventMapping(eventId: string, attioCampana: string) {
  const { error } = await supabase
    .from("fm_event_mapping")
    .delete()
    .eq("attio_campana", attioCampana);
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}

// 2026-07-06 (Jose): factura del evento — subir PDF (Storage, desde el cliente) + monto.
// El monto es el costo total del evento (event_cost); se guardan juntos en un solo submit.
export async function saveInvoiceUrl(eventId: string, invoiceUrl: string | null, amount?: number) {
  const patch: Record<string, unknown> = {
    luma_event_id: eventId,
    invoice_url: invoiceUrl,
    updated_at: new Date().toISOString(),
  };
  if (typeof amount === "number" && !Number.isNaN(amount) && amount >= 0) {
    patch.event_cost = amount;
  }
  const { error } = await supabase
    .from("fm_event_metadata")
    .upsert(patch, { onConflict: "luma_event_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/partners");
  revalidatePath(`/event/${eventId}`);
  return { success: true };
}

// 2026-05-27 (Jose): elegir si el evento fue Directo o de un Partner desde el modal.
// value: 'DIRECTO' (directo), nombre del partner, o null (volver al auto-derivado).
export async function saveEventPartnerOverride(eventId: string, value: string | null) {
  const { error } = await supabase
    .from("fm_event_metadata")
    .upsert(
      { luma_event_id: eventId, partner_override: value, updated_at: new Date().toISOString() },
      { onConflict: "luma_event_id" }
    );
  if (error) throw new Error(error.message);
  revalidateAll(eventId);
  return { success: true };
}
