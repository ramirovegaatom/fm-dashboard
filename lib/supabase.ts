import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type EventSummary = {
  luma_event_id: string;
  evento_nombre: string;
  evento_tipo: string;
  evento_fecha: string;
  evento_fecha_fin: string;
  evento_ubicacion: string | null;
  evento_url: string | null;
  campana_evento: string;
  total_registros: number;
  total_asistentes: number;
  total_joined_virtual: number;
  tasa_conversion_pct: number;
  total_aprobados_icp: number;
  icp_pct: number;
  registros_performance: number;
  asistentes_performance: number;
  pct_asistencia_performance: number | null;
  total_con_empresa: number;
  pct_matched: number;
  ad_spend: number;
  costo_por_registro: number | null;
  empresas_asistentes: number;
  gestion_pendiente: number;
  gestion_viva: number;
  qm_por_fm: number;
  qm_influenciada: number;
  qm_generada: number;
  descalificadas: number;
  qm_asistida: number;
  demo: number;
  won: number;
  mrr_won: number;
};

export type SourceBreakdown = {
  luma_event_id: string;
  evento_nombre: string;
  source_normalized: string;
  registros: number;
  aprobados_icp: number;
  asistentes: number;
};

export type QmBySource = {
  luma_event_id: string;
  evento_nombre: string;
  source_group: string;
  empresas_matcheadas: number;
  empresas_qm: number;
  empresas_gestion: number;
};

export type RoleBreakdown = {
  luma_event_id: string;
  evento_nombre: string;
  cargo: string;
  total: number;
  aprobados_icp: number;
};
