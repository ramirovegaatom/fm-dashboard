import Link from "next/link";
import { fetchSeguimientoCompanies } from "@/lib/supabase";
import { EtapaDetailClient } from "./EtapaDetailClient";

export const dynamic = "force-dynamic";

const ETAPA_KEYS = ["todas", "sin_prospectar", "siendo_prospectada", "procesada", "respuesta_positiva", "dropoff", "recycle"];

// Detalle de una etapa del funnel general (José 2026-07-17): todas las empresas en ese
// estadío, con BDR, campaña y la data completa. ?e=<etapa> (+ ?campana= opcional).
export default async function EtapaDetailPage({ searchParams }: { searchParams: Promise<{ e?: string; campana?: string }> }) {
  const { e, campana } = await searchParams;
  const etapa = e && ETAPA_KEYS.includes(e) ? e : null;

  if (!etapa) {
    return (
      <div>
        <p className="text-muted" style={{ fontSize: 13 }}>Etapa inválida.</p>
        <Link href="/seguimiento" style={{ fontSize: 13, color: "var(--fg-status-brand)", textDecoration: "none" }}>&larr; Volver a Seguimiento</Link>
      </div>
    );
  }

  // Traemos TODO (paginación en paralelo): la página filtra por etapa client-side para
  // poder cambiar de etapa con pills sin recargar.
  const all = await fetchSeguimientoCompanies();

  return <EtapaDetailClient etapaInicial={etapa} campanaInicial={campana ?? "todas"} companies={all} />;
}
