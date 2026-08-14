import { createClient } from "@supabase/supabase-js";

// 2026-07-11: Supabase activó RLS (sin políticas) en las tablas base y deshabilitó el
// anon key legacy. Las lecturas del dashboard corren server-side, así que usan el SECRET
// key (bypassa RLS) desde una env var SOLO-servidor: Next NO inyecta esta var al bundle
// del cliente (solo inyecta NEXT_PUBLIC_*), así que el secret nunca se expone.
// En el cliente (ej: upload de facturas en EventInvoices) cae al publishable key, que es
// rol anon (seguro de exponer): con RLS activa no puede leer datos, solo lo que permitan
// las políticas de Storage.
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ?? // solo-servidor, bypassa RLS (lecturas del dashboard)
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? // fallback cliente (publishable/anon, público)
  "";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
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
  csat: number | null; // satisfacción del evento (encuesta Luma), 1-5, carga manual
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
  event_income: number;
  ad_spend: number;
};

// Persona de un evento third-party (fm_third_party_people) — tabla "fuente de datos". Jose 2026-07-10.
export type ThirdPartyPerson = {
  attio_person_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  company_domain: string | null;
  origen_invitacion: string | null;
  campana_evento: string | null;
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
  // pais: override manual por deal (fm_deal_territory_overrides). Jose 2026-07-10.
  // Si está seteado, su territorio le gana al derivado del evento.
  pais: string | null;
};

// Pestaña Semanal (fm_weekly_progress): progreso semana a semana por campaña. Retro-construido
// de fuentes con fecha real: activities (llamadas/WA → procesamiento) y fm_attio_deals
// (fecha_qm_agendada/fecha_de_demo/close_date → funnel de negocio). Semana = lunes (date_trunc UTC).
// 2026-07-28.
export type WeeklyProgress = {
  campana_evento: string;
  semana: string; // lunes de la semana (YYYY-MM-DD)
  llamadas: number;
  whatsapps: number;
  empresas_trabajadas: number; // empresas con ≥1 actividad esa semana
  empresas_procesadas: number; // completaron circuito (2 contactos con 3+2) o tuvieron QM agendada, esa semana
  qm_agendadas: number; // deals con fecha_qm_agendada esa semana
  qm_completadas: number;
  demos: number;
  wons: number;
  mrr_won: number;
  losts: number;
};

// Drill de la pestaña Semanal (fm_weekly_hitos): QUÉ empresa alcanzó QUÉ hito en QUÉ semana
// y QUIÉN lo trabajó. Fecha = la del hito real (actividad o fecha de etapa del deal), NUNCA
// la fecha del evento. BDR = asignado actual en Attio (mismo criterio que el scorecard de
// Seguimiento); agentes = quién llamó según JustCall (solo era webhook, cobertura parcial).
// dropoff/recycle no tienen fecha histórica (Attio sobreescribe el stage) → se cubrirán con
// fm_weekly_snapshots hacia adelante. 2026-07-28.
export type WeeklyHito = {
  hito: "inicio_prospeccion" | "procesada" | "qm_agendada" | "qm_completada" | "demo" | "won";
  campana_evento: string;
  attio_company_id: string | null;
  company_name: string | null;
  assigned_bdr_name: string | null;
  agentes: string | null; // agent_name(s) de JustCall, "A, B"
  deal_name: string | null; // solo hitos de deal (qm_*/demo/won)
  fecha: string;
  semana: string; // lunes (YYYY-MM-DD)
};

// Trae TODAS las filas de fm_weekly_hitos (~2k hoy; paginado por si crece).
export async function fetchWeeklyHitos(): Promise<WeeklyHito[]> {
  const PAGE = 1000;
  const out: WeeklyHito[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("fm_weekly_hitos")
      .select("*")
      .order("semana")
      .order("campana_evento")
      .order("company_name")
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as WeeklyHito[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Grano DIARIO (fm_daily_progress): permite filtros desde/hasta custom como el resto
// del dashboard (feedback Ramiro 2026-07-28); el cliente agrega a semanas para los charts.
export type DailyProgress = Omit<WeeklyProgress, "semana"> & { fecha: string };

// Trae TODAS las filas de fm_daily_progress (~1.9k hoy; paginado por si crece).
export async function fetchDailyProgress(): Promise<DailyProgress[]> {
  const PAGE = 1000;
  const out: DailyProgress[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("fm_daily_progress")
      .select("*")
      .order("fecha")
      .order("campana_evento")
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as DailyProgress[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Calendario de eventos FUTUROS (fm_upcoming_events) — proyecto FM Events Calendar.
// Fuente de verdad de "qué se viene"; el equipo FM carga/edita desde la pestaña. 2026-07-29.
export type UpcomingEvent = {
  id: string;
  nombre: string;
  fecha: string; // YYYY-MM-DD
  fecha_fin: string | null; // eventos multi-día
  tipo: "Presencial" | "Virtual" | "Third Party";
  industria: string | null;
  pais: string | null;
  territorio: "Norte" | "Sur" | "Brasil" | null;
  ciudad: string | null;
  responsable: string | null;
  notas: string | null;
  estado: "Planificado" | "Confirmado" | "Cancelado";
  campana_evento: string | null; // link al tracking (Attio/Luma) cuando exista
  // Metas y links del doc de planificación de José (meta vs real cuando el evento pase).
  ppt_link: string | null;
  plan_fm_link: string | null;
  plan_ventas_link: string | null;
  meta_registros: number | null;
  meta_asistentes: number | null;
  meta_qms: number | null;
  meta_wons: number | null;
  meta_mrr: number | null;
  costo_estimado: number | null;
  // Proyecto de Asana del evento (uno por evento, portfolio 1216774054127024). Se pega la
  // URL en /calendario y la server action guarda el GID normalizado. 2026-08-12.
  asana_project_gid: string | null;
  // Pedidos de Steph (2026-08-13) para poder arrancar a invitar. El link de registro es lo
  // primero que nombró; viaja en el DM de invitaciones y de ventas.
  link_registro: string | null;
  partner: string | null;
  // Evento tipo Spark/Fenabrave: corre 7 días los avisos de base_datos e invitaciones.
  // Steph necesita 3 semanas en vez de 2, y Martín tiene que tener la base para entonces.
  evento_grande: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export async function fetchUpcomingEvents(): Promise<UpcomingEvent[]> {
  const { data } = await supabase
    .from("fm_upcoming_events")
    .select("*")
    .order("fecha");
  return (data ?? []) as UpcomingEvent[];
}

// Accionables por evento (fm_event_accionables) — Fase 2, reunión Mario/Martín 2026-07-31.
// Tracking MACRO por área: la barra se llena con updates de status (dashboard o bot Slack).
// aplica: null = condicional pendiente del check de Mario (ej: pauta).
export type EventAccionable = {
  id: string;
  event_id: string;
  template_clave: string | null;
  nombre: string;
  rol: string;
  responsable: string | null;
  slack_user_id: string | null;
  fecha_aviso: string | null;
  aplica: boolean | null;
  progreso: number; // 0-100
  asana_task_gid: string | null;
  ultimo_update_at: string | null;
  ultimo_update_por: string | null;
};

export type EventPrep = {
  event_id: string;
  accionables: number;
  completados: number;
  avance_pct: number;
  pendientes_check: number;
};

export async function fetchEventAccionables(): Promise<EventAccionable[]> {
  const { data } = await supabase
    .from("fm_event_accionables")
    .select("*")
    .order("fecha_aviso");
  return (data ?? []) as EventAccionable[];
}

export async function fetchEventPrep(): Promise<EventPrep[]> {
  const { data } = await supabase.from("fm_event_prep").select("*");
  return (data ?? []) as EventPrep[];
}

// Seguimiento por BDR (fm_bdr_companies): una fila por empresa×campaña con la fecha de
// asignación del BDR (Attio active_from, 100% cobertura) y el estado por ACTIVIDADES.
// Responde: cuándo se asignó X empresa a X persona, cuántas procesó / en proceso / sin
// actividad. Mismas exclusiones que fm_seguimiento_companies (números consistentes). 2026-07-28.
export type BdrCompany = {
  campana_evento: string;
  attio_company_id: string;
  company_name: string | null;
  assigned_bdr_name: string | null;
  bdr_assigned_at: string | null; // fecha de asignación (YYYY-MM-DD)
  fecha_primera_actividad: string | null;
  // Cuándo se procesó: circuito completo (2º contacto con 3+2) o primera QM agendada — la
  // que llegue antes. Null si es procesada solo por stage positivo sin fecha de QM.
  fecha_procesada: string | null;
  // procesada = circuito completo O QM/Cliente por stage (Candela 2026-08-06: los contactos
  // de evento pueden convertir sin completar el circuito y eso es válido).
  estado_actividad: "sin_actividad" | "en_proceso" | "procesada";
};

// Trae TODAS las filas de fm_bdr_companies (~2.4k hoy; paginado por si crece).
export async function fetchBdrCompanies(): Promise<BdrCompany[]> {
  const PAGE = 1000;
  const out: BdrCompany[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("fm_bdr_companies")
      .select("*")
      .order("bdr_assigned_at", { ascending: false, nullsFirst: false })
      .order("campana_evento")
      .order("company_name")
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as BdrCompany[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Fecha del evento por campaña (fm_campana_fechas) — para marcar el inicio del evento
// en la pestaña Semanal y el shortcut "Desde el evento".
export type CampanaFecha = { campana_evento: string; evento_fecha: string };

export async function fetchCampanaFechas(): Promise<CampanaFecha[]> {
  const { data } = await supabase.from("fm_campana_fechas").select("*");
  return (data ?? []) as CampanaFecha[];
}

// Sección Seguimiento (fm_seguimiento_companies): funnel por Outbound Stage + scorecard
// BDR. Una fila por (empresa, campaña). bdr_assigned_at = active_from del assigned_bdr
// en Attio (cuándo se seteó = fecha de asignación). 2026-07-11.
export type SeguimientoCompany = {
  campana_evento: string;
  attio_company_id: string;
  company_name: string | null;
  outbound_stage: string | null;
  // Iteración José 2026-07-16: etapas validadas por ACTIVIDAD real (tabla activities);
  // 'dropoff' = Descalificada + RECYCLE; clientes (lifecycle Customer) excluidos en la vista.
  etapa_funnel: "sin_prospectar" | "siendo_prospectada" | "procesada" | "respuesta_positiva" | "dropoff" | "recycle";
  assigned_bdr_id: string | null;
  assigned_bdr_name: string | null;
  bdr_assigned_at: string | null;
  actividades_prospeccion: number; // llamadas + WhatsApps registrados (todas sus personas)
  // Circuito v2 (Ramiro+Candela 2026-08-06): contactos de la empresa que completaron
  // CADA UNO la estructura (3 llamadas + 2 WA, o 2+3). Circuito completo = ≥2 contactos.
  contactos_con_circuito: number;
  estructura_completa: boolean; // circuito completo (≥2 contactos con estructura c/u)
  // Fecha del evento de la campaña (mapping regular o third-party); null si la campaña
  // no está mapeada — esas filas quedan fuera cuando el filtro de fechas está activo.
  evento_fecha: string | null;
  // Flags de circuito (2026-08-06). El stage terminal en Attio no siempre viene respaldado
  // por el circuito de actividades; cada caso se trata distinto:
  // - positiva_sin_circuito: llegó a QM/Cliente sin circuito → VÁLIDO (contacto caliente de
  //   evento, Candela 2026-08-06), badge informativo.
  // - descalificada_sin_circuito: Descalificada en Attio sin circuito → cuenta en DropOff
  //   pero marcada; el porqué (industria/filtros) queda para mapear más adelante.
  // - recycle_sin_circuito (iter. 2 2026-08-06): RECYCLE sin circuito → mismo tratamiento
  //   que Descalificada: cuenta en Recycle pero marcada (se devolvió al pool sin trabajarla).
  // - terminal_sin_circuito: Procesada/Lost en Attio sin circuito → NO cuenta en esa
  //   etapa (la fuente de verdad son las actividades), aparece en su etapa real con ⚠.
  positiva_sin_circuito: boolean;
  descalificada_sin_circuito: boolean;
  terminal_sin_circuito: boolean;
  recycle_sin_circuito: boolean;
  // Descartada desde el dashboard (fm_company_discards, 2026-08-06): decisión deliberada
  // de no asignarla a ningún BDR. Cuenta en dropoff pero NO enciende descalificada_sin_circuito.
  descartada_dashboard: boolean;
};

// Trae TODAS las filas de fm_seguimiento_companies (PostgREST corta en 1000 por request).
// Perf 2026-07-23: las páginas se piden EN PARALELO por tandas (antes 3 requests en serie
// = 3x la latencia de la vista). bdrName: undefined = todas; null = sin BDR; string = ese BDR.
export async function fetchSeguimientoCompanies(bdrName?: string | null): Promise<SeguimientoCompany[]> {
  const PAGE = 1000;
  const BATCH = 3; // 2.4k filas hoy → 1 tanda cubre todo; escala a más tandas si crece
  const out: SeguimientoCompany[] = [];
  for (let tanda = 0; ; tanda += BATCH) {
    const pages = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => {
        let q = supabase.from("fm_seguimiento_companies").select("*");
        if (bdrName === null) q = q.is("assigned_bdr_name", null);
        else if (bdrName !== undefined) q = q.eq("assigned_bdr_name", bdrName);
        const from = (tanda + i) * PAGE;
        return q.order("campana_evento").order("company_name").range(from, from + PAGE - 1);
      })
    );
    let done = false;
    for (const { data } of pages) {
      const rows = (data ?? []) as SeguimientoCompany[];
      out.push(...rows);
      if (rows.length < PAGE) { done = true; break; }
    }
    if (done) break;
  }
  return out;
}

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
  // true si el deal está taggeado con la campaña del evento (José 2026-07-17:
  // Demo/Revisión/Negociación cuentan SOLO estos; la heurística asistió+fecha+origen
  // queda solo para Won/Lost/QM Agendada).
  por_tag: boolean;
};
