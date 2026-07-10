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
  total_icp_real: number;
  icp_real_pct: number;
  event_cost: number; // NETO: bruto - ingresos (lo calcula fm_dashboard)
  event_cost_bruto: number; // suma de gastos
  event_income: number; // suma de ingresos (MDF, aportes de partner)
  hidden: boolean; // evento archivado: no cuenta en métricas
  pais: string | null;
  territorio: "Norte" | "Sur" | "Brasil" | null;
  qm_agendada: number;
  qm_agendada_pauta: number;
  qm_asistida_pauta: number;
  demo_pauta: number;
  won_pauta: number;
  mrr_won_pauta: number;
  revision_interna: number;
  negociacion: number;
  lost: number;
  lost_pauta: number;
  qm_show: number;
  qm_no_show: number;
  partner_override: string | null;
  invoice_url: string | null;
};

export type SourceBreakdown = {
  luma_event_id: string;
  evento_nombre: string;
  source_normalized: string;
  registros: number;
  aprobados_icp: number;
  asistentes: number;
  aprobados_icp_real: number;
};

export type QmBySource = {
  luma_event_id: string;
  evento_nombre: string;
  source_group: string;
  empresas_matcheadas: number;
  empresas_qm: number;
  empresas_gestion: number;
};

export type PartnerByEvent = {
  luma_event_id: string;
  partner_raw: string;
  partner: string;
  attio_partner_company_id: string | null;
  registros: number;
};

export type RoleBreakdown = {
  luma_event_id: string;
  evento_nombre: string;
  cargo: string;
  total: number;
  aprobados_icp: number;
  seniority: string | null;
  aprobados_icp_real: number;
};

export type CompanyDrill = {
  luma_event_id: string;
  attio_company_id: string | null;
  company_name: string | null;
  proceso_fm_status: string | null;
  qm_type: string | null;
  outbound_stage: string | null;
  industria: string | null;
  pais: string | null;
  asistio: boolean;
  // clasificacion QM por origen del deal (directa | influenciada | null). Jose 2026-07-08.
  qm_clasificacion: string | null;
};

export type ThirdPartySummary = {
  campana_evento: string;
  evento_nombre: string | null;
  evento_fecha: string | null;
  pais: string | null;
  territorio: string | null;
  event_cost: number;
  invoice_url: string | null;
  hidden: boolean;
  personas_cargadas: number;
  empresas_cargadas: number;
  empresas_en_lista: number;
  qm_por_fm: number;
  qm_show: number;
  qm_no_show: number;
  qm_influenciada: number;
  qm_generada: number;
  descalificadas: number;
  deals_total: number;
  qm_agendada: number;
  qm_asistida: number;
  demo: number;
  won: number;
  mrr_won: number;
};

// Detalle por empresa de un evento third-party (fm_third_party_companies_drill). Jose 2026-07-08.
export type ThirdPartyCompany = {
  campana_evento: string;
  attio_company_id: string | null;
  company_name: string | null;
  outbound_stage: string | null;
  industria: string | null;
  pais: string | null;
  qm_clasificacion: string | null;
  tiene_won: boolean;
};

export type EventInvoice = {
  id: string;
  luma_event_id: string;
  concepto: string;
  monto: number;
  pdf_url: string | null;
  created_at: string;
  tipo: "gasto" | "ingreso";
};

export type WonByCloseDate = {
  attio_deal_id: string;
  deal_name: string | null;
  company_name: string | null;
  campana_evento: string | null;
  origen_negocio: string | null;
  value_amount: number | null;
  close_date: string;
  territorio: string | null;
};

export type DealDrill = {
  luma_event_id: string;
  attio_deal_id: string;
  attio_company_id: string;
  company_name: string | null;
  deal_name: string | null;
  stage: string;
  value_amount: number | null;
  origen_negocio: string | null;
  created_at_attio: string;
  toco_qm_agendada: boolean;
  toco_qm_asistida: boolean;
  toco_demo: boolean;
  toco_revision: boolean;
  toco_negociacion: boolean;
  toco_won: boolean;
  toco_lost: boolean;
};
