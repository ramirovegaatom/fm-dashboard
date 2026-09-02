"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { removeInvoicePdf } from "@/lib/invoice-storage";

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

// 2026-07-10 (Jose): costos/ingresos/pauta de eventos third-party. Reutilizamos
// fm_event_invoices con luma_event_id = slug (campana_evento). El costo/ingreso se recalcula
// en fm_third_party_events. Costo neto = event_cost (gastos) - event_income (ingresos).
async function recomputeTpCostIncome(slug: string) {
  const { data } = await supabase
    .from("fm_event_invoices")
    .select("monto, tipo")
    .eq("luma_event_id", slug);
  const rows = (data ?? []) as { monto: number; tipo: string }[];
  const gastoRows = rows.filter((r) => r.tipo !== "ingreso");
  const ingresos = rows.filter((r) => r.tipo === "ingreso").reduce((a, r) => a + Number(r.monto ?? 0), 0);
  const patch: Record<string, unknown> = { campana_evento: slug, event_income: ingresos, updated_at: new Date().toISOString() };
  if (gastoRows.length > 0) {
    patch.event_cost = gastoRows.reduce((a, r) => a + Number(r.monto ?? 0), 0);
  }
  const { error } = await supabase.from("fm_third_party_events").upsert(patch, { onConflict: "campana_evento" });
  if (error) throw new Error(error.message);
}

// 2026-09-02: estas dos acciones devuelven `{ success:false, error }` en vez de tirar.
// En producción Next reemplaza el mensaje de una excepción por uno genérico, así que
// el cliente nunca veía la causa real (RLS, constraint, timeout). Ahora la muestra.
export type InvoiceActionResult = { success: boolean; error?: string };

export async function addThirdPartyInvoice(
  slug: string,
  concepto: string,
  monto: number,
  pdfUrl: string | null,
  tipo: "gasto" | "ingreso" = "gasto"
): Promise<InvoiceActionResult> {
  const c = concepto.trim();
  if (!c) return { success: false, error: "Falta el concepto" };
  if (Number.isNaN(monto) || monto < 0) return { success: false, error: "Monto inválido" };
  try {
    const { error } = await supabase.from("fm_event_invoices").insert({
      luma_event_id: slug, concepto: c, monto, pdf_url: pdfUrl, tipo, created_by: "dashboard",
    });
    if (error) return { success: false, error: `No se pudo guardar el ítem: ${error.message}` };
    await recomputeTpCostIncome(slug);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/third-party");
  revalidatePath("/third-party/detail");
  return { success: true };
}

export async function deleteThirdPartyInvoice(slug: string, invoiceId: string): Promise<InvoiceActionResult> {
  try {
    const { data: row } = await supabase.from("fm_event_invoices").select("pdf_url").eq("id", invoiceId).maybeSingle();
    const { error } = await supabase.from("fm_event_invoices").delete().eq("id", invoiceId);
    if (error) return { success: false, error: `No se pudo borrar el ítem: ${error.message}` };
    await removeInvoicePdf((row as { pdf_url: string | null } | null)?.pdf_url);
    await recomputeTpCostIncome(slug);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/third-party");
  revalidatePath("/third-party/detail");
  return { success: true };
}

export async function saveThirdPartyAdSpend(slug: string, amount: number) {
  const { error } = await supabase
    .from("fm_third_party_events")
    .upsert({ campana_evento: slug, ad_spend: amount, updated_at: new Date().toISOString() }, { onConflict: "campana_evento" });
  if (error) throw new Error(error.message);
  revalidatePath("/third-party");
  revalidatePath("/third-party/detail");
  return { success: true };
}

export async function saveThirdPartyEventCost(slug: string, amount: number) {
  const { error } = await supabase
    .from("fm_third_party_events")
    .upsert({ campana_evento: slug, event_cost: amount, updated_at: new Date().toISOString() }, { onConflict: "campana_evento" });
  if (error) throw new Error(error.message);
  revalidatePath("/third-party");
  revalidatePath("/third-party/detail");
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
