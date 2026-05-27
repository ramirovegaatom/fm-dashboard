// Deep-links a Attio. Workspace slug confirmado por Jose 2026-05-27: "atomchat" (no "atom").
// Formato de company confirmado: /atomchat/company/{id}/overview (singular + /overview).
const ATTIO_WORKSPACE = "atomchat";

export function attioCompanyUrl(id: string | null): string | null {
  return id ? `https://app.attio.com/${ATTIO_WORKSPACE}/company/${id}/overview` : null;
}

export function attioDealUrl(id: string): string {
  return `https://app.attio.com/${ATTIO_WORKSPACE}/deals/record/${id}`;
}
