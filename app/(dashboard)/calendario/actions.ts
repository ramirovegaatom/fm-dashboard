"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { UpcomingEvent } from "@/lib/supabase";

export type UpcomingEventInput = {
  id?: string; // sin id = alta
  nombre: string;
  fecha: string;
  fecha_fin?: string | null;
  tipo: UpcomingEvent["tipo"];
  industria?: string | null;
  pais?: string | null;
  territorio?: UpcomingEvent["territorio"];
  ciudad?: string | null;
  responsable?: string | null;
  notas?: string | null;
  estado: UpcomingEvent["estado"];
  campana_evento?: string | null;
  ppt_link?: string | null;
  plan_fm_link?: string | null;
  plan_ventas_link?: string | null;
  meta_registros?: number | null;
  meta_asistentes?: number | null;
  meta_qms?: number | null;
  meta_wons?: number | null;
  meta_mrr?: number | null;
  costo_estimado?: number | null;
};

export async function saveUpcomingEvent(input: UpcomingEventInput) {
  if (!input.nombre?.trim()) throw new Error("El nombre es obligatorio");
  if (!input.fecha) throw new Error("La fecha es obligatoria");
  if (input.fecha_fin && input.fecha_fin < input.fecha) {
    throw new Error("La fecha de fin no puede ser anterior a la de inicio");
  }

  const row = {
    nombre: input.nombre.trim(),
    fecha: input.fecha,
    fecha_fin: input.fecha_fin || null,
    tipo: input.tipo,
    industria: input.industria?.trim() || null,
    pais: input.pais || null,
    territorio: input.territorio || null,
    ciudad: input.ciudad?.trim() || null,
    responsable: input.responsable?.trim() || null,
    notas: input.notas?.trim() || null,
    estado: input.estado,
    campana_evento: input.campana_evento?.trim() || null,
    ppt_link: input.ppt_link?.trim() || null,
    plan_fm_link: input.plan_fm_link?.trim() || null,
    plan_ventas_link: input.plan_ventas_link?.trim() || null,
    meta_registros: input.meta_registros ?? null,
    meta_asistentes: input.meta_asistentes ?? null,
    meta_qms: input.meta_qms ?? null,
    meta_wons: input.meta_wons ?? null,
    meta_mrr: input.meta_mrr ?? null,
    costo_estimado: input.costo_estimado ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = input.id
    ? await supabase.from("fm_upcoming_events").update(row).eq("id", input.id)
    : await supabase.from("fm_upcoming_events").insert(row);

  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
  return { success: true };
}

export async function deleteUpcomingEvent(id: string) {
  const { error } = await supabase.from("fm_upcoming_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
  return { success: true };
}
