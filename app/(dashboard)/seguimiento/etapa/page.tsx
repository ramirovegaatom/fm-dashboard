import Link from "next/link";
import { fetchSeguimientoCompanies } from "@/lib/supabase";
import { EtapaDetailClient } from "./EtapaDetailClient";

export const dynamic = "force-dynamic";

// "procesadas" = acumulado de las 4 etapas terminales (fila agregada del funnel general).
const ETAPA_KEYS = ["todas", "procesadas", "sin_prospectar", "siendo_prospectada", "procesada", "respuesta_positiva", "dropoff", "recycle"];

// Detalle de una etapa del funnel general (José 2026-07-17): todas las empresas en ese
// estadío, con BDR, campaña y la data completa. ?e=<etapa> (+ ?campana= opcional, repetible:
// ?campana=a&campana=b → varias campañas a la vez; José + Cande 2026-08-26).
export default async function EtapaDetailPage({ searchParams }: { searchParams: Promise<{ e?: string; campana?: string | string[] }> }) {
  const { e, campana } = await searchParams;
  const campanasIniciales = campana === undefined ? [] : Array.isArray(campana) ? campana : [campana];
  const etapa = e && ETAPA_KEYS.includes(e) ? e : null;

  if (!etapa) {
    return (
      <div>
        <p className="text-muted" style={{ fontSize: 13 }}>Etapa inválida.</p>
        <Link href="/seguimiento" style={{ fontSize: 13, color: "var(--fg-status-brand)", textDecoration: "none" }}>&larr; Volver a Estado actual</Link>
      </div>
    );
  }

  // Traemos TODO (paginación en paralelo): la página filtra por etapa client-side para
  // poder cambiar de etapa con pills sin recargar.
  const all = await fetchSeguimientoCompanies();

  return <EtapaDetailClient etapaInicial={etapa} campanasIniciales={campanasIniciales} companies={all} />;
}
