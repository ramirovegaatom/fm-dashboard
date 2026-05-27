import { EventSummary } from "./supabase";

// Valor sentinel para forzar evento directo (sin partner).
export const DIRECTO = "DIRECTO";

// Partner efectivo de un evento: override manual (Jose) gana sobre el auto-derivado.
// - partner_override === 'DIRECTO' → null (directo, sin badge)
// - partner_override con texto    → ese partner
// - partner_override NULL         → auto-derivado (fm_partners_by_event)
export function effectivePartner(event: EventSummary, autoPartner?: string | null): string | null {
  if (event.partner_override === DIRECTO) return null;
  if (event.partner_override) return event.partner_override;
  return autoPartner ?? null;
}
