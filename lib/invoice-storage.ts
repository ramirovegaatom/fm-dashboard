import { supabase } from "@/lib/supabase";

// 2026-09-02: helpers server-side para los PDFs de facturas (bucket `event-invoices`).
// El upload sigue siendo client-side (publishable key + política INSERT del bucket);
// acá vive lo que necesita el secret key: borrar el objeto cuando se borra el ítem.
export const INVOICES_BUCKET = "event-invoices";

/** Devuelve el path dentro del bucket a partir de la URL pública guardada en `pdf_url`. */
export function invoicePathFromUrl(pdfUrl: string | null | undefined): string | null {
  if (!pdfUrl) return null;
  const marker = `/${INVOICES_BUCKET}/`;
  const i = pdfUrl.indexOf(marker);
  if (i < 0) return null;
  try {
    return decodeURIComponent(pdfUrl.slice(i + marker.length));
  } catch {
    return pdfUrl.slice(i + marker.length);
  }
}

/** Borra el PDF del bucket. Best-effort: un fallo acá no debe impedir borrar el ítem. */
export async function removeInvoicePdf(pdfUrl: string | null | undefined): Promise<void> {
  const path = invoicePathFromUrl(pdfUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(INVOICES_BUCKET).remove([path]);
  if (error) console.warn("[facturas] no se pudo borrar el PDF del bucket:", path, error.message);
}
