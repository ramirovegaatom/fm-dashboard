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
  asana_project_gid?: string | null; // se pega la URL del proyecto; se guarda el GID
};

// El campo de Asana se completa pegando el link del proyecto (así lo acordó Mario), pero lo
// que sirve para la API es el GID. Aceptamos las dos URLs que devuelve Asana hoy y el GID
// pelado; si no se puede extraer, avisamos en vez de guardar basura silenciosamente.
//   nueva: https://app.asana.com/1/1176142409313345/project/1216775021660455/list
//   vieja: https://app.asana.com/0/1216775021660455/1216775408132811
// (sin export: en un archivo "use server" solo se pueden exportar funciones async)
function parseAsanaProjectGid(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  const nuevo = s.match(/\/project\/(\d+)/);
  if (nuevo) return nuevo[1];
  const viejo = s.match(/app\.asana\.com\/0\/(\d+)/);
  if (viejo) return viejo[1];
  return null;
}

export async function saveUpcomingEvent(input: UpcomingEventInput) {
  if (!input.nombre?.trim()) throw new Error("El nombre es obligatorio");
  if (!input.fecha) throw new Error("La fecha es obligatoria");
  if (input.fecha_fin && input.fecha_fin < input.fecha) {
    throw new Error("La fecha de fin no puede ser anterior a la de inicio");
  }

  const asanaRaw = input.asana_project_gid?.trim() ?? "";
  const asanaGid = parseAsanaProjectGid(asanaRaw);
  if (asanaRaw && !asanaGid) {
    throw new Error(
      "No pude leer el proyecto de Asana de ese link. Pegá la URL del proyecto (app.asana.com/…/project/…) o el GID."
    );
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
    asana_project_gid: asanaGid,
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

// Update de un accionable (progreso 0-100, check aplica/no-aplica, responsable).
// El cambio de progreso queda en el historial (misma tabla que llenará el bot de Slack).
export async function updateAccionable(
  id: string,
  patch: { progreso?: number; aplica?: boolean | null; responsable?: string | null }
) {
  if (patch.progreso !== undefined && (patch.progreso < 0 || patch.progreso > 100)) {
    throw new Error("Progreso inválido");
  }
  const row: Record<string, unknown> = { ...patch };
  if (patch.progreso !== undefined) {
    row.ultimo_update_at = new Date().toISOString();
    row.ultimo_update_por = "dashboard";
  }
  const { error } = await supabase.from("fm_event_accionables").update(row).eq("id", id);
  if (error) throw new Error(error.message);

  if (patch.progreso !== undefined) {
    await supabase.from("fm_accionable_updates").insert({
      accionable_id: id,
      progreso: patch.progreso,
      fuente: "dashboard",
    });
  }
  revalidatePath("/calendario");
  return { success: true };
}
