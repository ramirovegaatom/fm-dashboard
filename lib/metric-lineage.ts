export type LineageNodeKind = "source" | "pipeline" | "store" | "ui";

export type LineageNode = {
  label: string;
  kind: LineageNodeKind;
  detail?: string;
};

export type LineageEntry = {
  label: string;
  flow: LineageNode[];
  table?: string;
  column?: string;
  filter?: string;
  update: string;
  note?: string;
  derivedFrom?: string[];
};

const LUMA_FLOW: LineageNode[] = [
  { label: "Luma", kind: "source", detail: "webhook" },
  { label: "Bruno (Supabase)", kind: "pipeline", detail: "real-time" },
  { label: "fm_dashboard", kind: "store", detail: "view" },
  { label: "Dashboard", kind: "ui" },
];

const ATTIO_COMPANIES_FLOW: LineageNode[] = [
  { label: "Attio Companies", kind: "source", detail: "list events_companies" },
  { label: "fm-attio-sync", kind: "pipeline", detail: "edge fn · cron 4h" },
  { label: "fm_attio_companies", kind: "store" },
  { label: "fm_dashboard", kind: "store", detail: "view" },
  { label: "Dashboard", kind: "ui" },
];

const ATTIO_DEALS_FLOW: LineageNode[] = [
  { label: "Attio Deals", kind: "source" },
  { label: "fm-attio-sync", kind: "pipeline", detail: "edge fn · cron 4h" },
  { label: "fm_attio_deals", kind: "store" },
  { label: "fm_deals_by_event", kind: "store", detail: "view" },
  { label: "Dashboard", kind: "ui" },
];

const MANUAL_FLOW: LineageNode[] = [
  { label: "Input manual", kind: "source", detail: "modal del dashboard" },
  { label: "fm_event_metadata", kind: "store" },
  { label: "fm_dashboard", kind: "store", detail: "view" },
  { label: "Dashboard", kind: "ui" },
];

const DERIVED_FLOW: LineageNode[] = [
  { label: "Cálculo en frontend", kind: "pipeline", detail: "JS sobre fm_dashboard" },
  { label: "Dashboard", kind: "ui" },
];

export const METRIC_LINEAGE: Record<string, LineageEntry> = {
  // ─────────────── Personas (Luma → Bruno → contactos_eventos) ───────────────
  registros: {
    label: "Registros",
    flow: LUMA_FLOW,
    table: "contactos_eventos",
    column: "COUNT WHERE approval_status = 'approved' (aceptados)",
    filter: "registros aceptados/aprobados",
    update: "Webhook real-time (Luma → Bruno desde 2026-04-22)",
    note: "Desde 2026-05-27 (Jose): Registros = aceptados. El sub muestra totales y descalificados. Excepción: Pauta usa total inscritos (no aceptados) y Fuentes de invitación mantiene total para visibilidad de origen.",
  },
  asistentes: {
    label: "Asistentes",
    flow: LUMA_FLOW,
    table: "contactos_eventos",
    column: "Presencial: event_tickets[].checked_in_at IS NOT NULL · Virtual: joined_at IS NOT NULL",
    filter: "luma_event_id = ?",
    update: "Webhook real-time (check-in en QR / join en Zoom)",
    note: "Para presenciales se cuenta el primer check-in. Para virtuales basta con joined_at.",
  },
  tasa_asistencia: {
    label: "Tasa de asistencia",
    flow: DERIVED_FLOW,
    column: "Math.round((asistentes / total_aprobados_icp) * 100)",
    update: "Recalculado en cada render",
    derivedFrom: ["asistentes", "registros"],
    note: "Desde 2026-07-06 (Jose): denominador = registros aceptados (total_aprobados_icp), NO registros totales. La columna SQL tasa_conversion_pct divide por total_registros y subestima la tasa; el frontend la recalcula sobre aceptados en card, modal y detalle.",
  },
  icp_luma: {
    label: "ICP Luma (aprobados)",
    flow: LUMA_FLOW,
    table: "contactos_eventos",
    column: "approval_status",
    filter: "approval_status = 'approved'",
    update: "Manual en Luma (Jose/Mario aprueban) → webhook → Bruno",
    note: "Métrica histórica usada antes de tener ICP real. Se mantiene para comparar.",
  },
  icp_real: {
    label: "ICP real",
    flow: [
      { label: "Attio Companies", kind: "source", detail: "Clay enrichment" },
      { label: "Bruno (Supabase)", kind: "pipeline", detail: "match email → contactos_growth" },
      { label: "contactos_growth.contacto_con_rol_icp", kind: "store" },
      { label: "fm_event_summary", kind: "store", detail: "view" },
      { label: "Dashboard", kind: "ui" },
    ],
    table: "contactos_growth",
    column: "contacto_con_rol_icp = true",
    filter: "rol ICP en industria ICP (post-enriquecimiento de Clay)",
    update: "Cron de enriquecimiento Clay (Bruno)",
    note: "Más estricto que ICP Luma: exige rol ICP en industria ICP, no solo aprobación.",
  },
  pct_matched: {
    label: "% Matcheados",
    flow: [
      { label: "Luma + Karen", kind: "source", detail: "registro" },
      { label: "Bruno match engine", kind: "pipeline", detail: "email corp → empresa" },
      { label: "contactos_eventos.empresa_growth_id", kind: "store" },
      { label: "Dashboard", kind: "ui" },
    ],
    table: "contactos_eventos",
    column: "COUNT(empresa_growth_id NOT NULL) / COUNT(*) * 100",
    filter: "registros con empresa identificada por email corp",
    update: "Continuo (matching mejorado con form nuevo + enrichment pre-aprobación)",
  },
  roles: {
    label: "Roles (Marketing/Ventas/Servicio/Otros)",
    flow: [
      { label: "Luma form", kind: "source", detail: "registration_answers JSONB" },
      { label: "fm_roles_breakdown", kind: "store", detail: "parsea JSONB" },
      { label: "RolesChart", kind: "ui", detail: "regex classifyCargo()" },
    ],
    table: "fm_roles_breakdown",
    column: "cargo (extraído de registration_answers)",
    filter: "question_type = 'company' en JSONB",
    update: "Continuo (cuando un guest llena el formulario)",
    note: "La clasificación en 4 grupos se hace en frontend con regex. Marketing incluye CMO, brand, growth, content. Ventas incluye CRO, BDR, AE. Servicio incluye CS, CX, success.",
  },
  seniority: {
    label: "Seniority",
    flow: [
      { label: "Clay enrichment", kind: "source", detail: "via contactos_growth" },
      { label: "fm_roles_breakdown", kind: "store", detail: "LEFT JOIN contactos_growth" },
      { label: "Dashboard", kind: "ui" },
    ],
    table: "contactos_growth",
    column: "seniority (CxO / VP / Director / Manager / Senior / Entry-level)",
    update: "Cron de enriquecimiento Clay (Bruno)",
    note: "Si Clay no encuentra el contacto, queda 'Sin clasificar'.",
  },

  // ─────────────── Pipeline empresas (Attio events_companies) ───────────────
  empresas_asistentes: {
    label: "Empresas asistentes",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "COUNT distinct empresas con asistio_a_evento = true",
    filter: "list entry de events_companies + asistio_a_evento checkbox",
    update: "Cron 4h (edge function fm-attio-sync, phase 1)",
  },
  gestion_pendiente: {
    label: "Gestión pendiente",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "proceso_field_marketing = 'Sin iniciar'",
    update: "Cron 4h",
    note: "Empresa asistió pero todavía no fue contactada por FM/BDR.",
  },
  gestion_viva: {
    label: "En gestión",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "proceso_field_marketing IN ('Inicio de gestión', 'Con Contacto', 'Procesada evento (7 días)')",
    update: "Cron 4h",
  },
  qm_por_fm: {
    label: "QM FM",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "outbound_stage IN ('QM AGENDADA', 'PRE-QM - Oportunidad Marketing', 'QM SHOW', 'QM NO SHOW') · O proceso_fm = 'QM'",
    update: "Cron 4h",
    note: "Empresas marcadas como QM por FM (a nivel Company en Attio). QM NO SHOW se incluye desde 2026-05-27 (pedido Jose) — se agendó la QM aunque no asistieron, sigue siendo QM generada por marketing.",
  },
  qm_totales: {
    label: "QM Totales",
    flow: DERIVED_FLOW,
    column: "qm_influenciada + qm_generada",
    update: "Recalculado en cada render",
    derivedFrom: ["qm_influenciada", "qm_generada"],
    note: "Total de empresas QM del evento (Jose 2026-07-06): suma de influenciadas (tienen deal abierto) + generadas (sin deal). Cuadro-resumen para no sumar a mano. Ambas vienen de fm_attio_companies.qm_type. Fix 2026-07-06 (edge fn v27): antes outbound_stage/qm_type quedaban congelados desde el primer sync (enrichCompanies solo tocaba empresas nuevas) → Spark mostraba 0 QM cuando tenía 52. Ahora refreshCompanies re-enriquece todas las empresas y qm_type incluye QM SHOW/NO SHOW.",
  },
  qm_show: {
    label: "QM Show",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "outbound_stage = 'QM SHOW'",
    update: "Cron 4h",
    note: "Reuniones QM efectivamente realizadas (asistió). Desglose de QM FM (Jose 2026-05-27). QM Show + QM No Show ≈ total agendadas.",
  },
  qm_no_show: {
    label: "QM No Show",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "outbound_stage = 'QM NO SHOW'",
    update: "Cron 4h",
    note: "QM agendadas que no ocurrieron (no asistió). Desglose de QM FM (Jose 2026-05-27).",
  },
  qm_generada: {
    label: "QM Generada",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "qm_type = 'generada' (calculado en Phase 2 enrichCompanies)",
    filter: "empresa asistió + sin deal previo al evento",
    update: "Cron 4h",
    note: "Deducción: empresa que asistió y NO tenía deals abiertos antes del evento.",
  },
  qm_influenciada: {
    label: "QM Influenciada",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "qm_type = 'influenciada'",
    filter: "empresa asistió + tenía deal abierto antes del evento",
    update: "Cron 4h",
    note: "Deducción: empresa que asistió y YA tenía deal abierto. El evento influencia el deal existente.",
  },
  descalificadas: {
    label: "Descalificadas",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "proceso_field_marketing = 'Descalificada no ICP'",
    update: "Cron 4h",
  },
  partner: {
    label: "Partner asociado",
    flow: ATTIO_COMPANIES_FLOW,
    table: "fm_attio_companies",
    column: "partner_name_text (record-reference partner_name → Company name)",
    filter: "atributo a nivel Company en Attio",
    update: "Cron 4h (phase 4 syncPartners, chunked 300/batch)",
    note: "Fuente correcta de partner. NO usar custom_source de Luma — eso cuenta el evento entero como del partner si solo 1 persona tenía ese UTM. Cobertura actual: 30.4% empresas con partner asignado.",
  },

  // ─────────────── Pipeline deals (Attio Deals) ───────────────
  qm_agendada: {
    label: "QM Agendada",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "COUNT distinct deals con fecha_qm_agendada IS NOT NULL",
    filter: "doble signal: (empresa asistente + post-fecha + origen compatible) OR (deal.campana_evento → fm_event_mapping)",
    update: "Cron 4h",
    note: "Desde 2026-05-27 (Jose): atribución por doble signal. Signal 2 = campana_evento del deal mapeado a evento vía fm_event_mapping — destraba deals tagueados cuya empresa no está en la list (ej: Panautos Won del Evento_Lima). 10/22 slugs del mapping tienen opción válida en Attio.",
  },
  qm_asistida: {
    label: "QM Asistida",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "qm_completada=true OR fecha_qm_completada IS NOT NULL (TRAZA acumulada)",
    filter: "empresa asistió + post-fecha + origen_negocio compatible",
    update: "Cron 4h",
    note: "Cambio 2026-05-06 (Camilo): de estado actual a traza. Cuenta deals que ALGUNA VEZ tocaron QM Asistida — no se pierden si pasan a Demo/Won/Lost después.",
  },
  demo: {
    label: "Demo",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "demo_completado=true OR fecha_de_demo NOT NULL OR fecha_de_revision_interna NOT NULL OR negociacion NOT NULL OR Won (TRAZA)",
    filter: "empresa asistió + post-fecha + origen_negocio compatible",
    update: "Cron 4h",
    note: "Traza acumulada — un deal Won también es contado como Demo (porque pasó por ahí).",
  },
  revision_interna: {
    label: "Revisión interna",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "fecha_de_revision_interna NOT NULL OR negociacion NOT NULL OR Won",
    filter: "empresa asistió + post-fecha + origen_negocio compatible",
    update: "Cron 4h",
    note: "Stage intermedio del funnel. Traza acumulada.",
  },
  negociacion: {
    label: "Negociación",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "fecha_negociacion_de_terminos_completada NOT NULL OR Won",
    filter: "empresa asistió + post-fecha + origen_negocio compatible",
    update: "Cron 4h",
    note: "Stage final antes de Won. Traza acumulada.",
  },
  won: {
    label: "Won",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "stage = 'Won 🎉'",
    filter: "empresa asistió + post-fecha + origen_negocio compatible",
    update: "Cron 4h",
    note: "Fix 2026-05-06: la string en Attio incluye emoji 🎉. Antes filtraba por 'Won' literal y daba 0.",
  },
  lost: {
    label: "Lost",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "stage = 'Lost' OR fecha_close_lost IS NOT NULL",
    filter: "empresa asistió + post-fecha + origen_negocio compatible",
    update: "Cron 4h",
    note: "Deals que cerraron en Lost. La traza preserva en qué stage estuvieron antes de perderse.",
  },
  mrr_won: {
    label: "MRR Won",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "SUM(value) de deals con stage = 'Won 🎉'",
    filter: "mismo filtro que Won",
    update: "Cron 4h",
    note: "Fix 2026-05-06 mismo emoji. Antes daba 0 en todo el dashboard.",
  },

  // ─────────────── Pauta (variantes con utm_id en deal) ───────────────
  registros_performance: {
    label: "Registros pauta",
    flow: LUMA_FLOW,
    table: "contactos_eventos",
    column: "custom_source ILIKE 'facebook|fb|ig|pauta|f|an' (fallback)",
    filter: "registros con UTM de pauta Meta",
    update: "Webhook real-time",
    note: "Cobertura ~21% con fallback. Cuando contactos_growth.utm_medium='paid' esté poblada (Bruno+Karen), el swap es 1 CASE en la view y la cobertura sube.",
  },
  asistentes_performance: {
    label: "Asistentes pauta",
    flow: LUMA_FLOW,
    table: "contactos_eventos",
    column: "custom_source pauta + checked_in_at IS NOT NULL",
    update: "Webhook real-time",
    note: "Mismo fallback de cobertura ~21% que Registros pauta.",
  },
  pct_asistencia_performance: {
    label: "% asistencia pauta",
    flow: DERIVED_FLOW,
    column: "(asistentes_performance / registros_performance) * 100",
    update: "Recalculado en cada render",
    derivedFrom: ["asistentes_performance", "registros_performance"],
  },
  cpl: {
    label: "CPL (cost per lead)",
    flow: DERIVED_FLOW,
    column: "ad_spend / registros_performance",
    update: "Recalculado en cada render",
    derivedFrom: ["ad_spend", "registros_performance"],
    note: "CPLs del dashboard pueden divergir de los del CSV de Diego porque hoy usa fallback custom_source (~21% cobertura). Convergerán cuando utm_medium='paid' esté poblada.",
  },
  qm_agendada_pauta: {
    label: "QM Agendada (pauta)",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "qm_agendada filtrado por utm_id IS NOT NULL en deal",
    filter: "mismo filtro general + deal tiene utm_id de pauta",
    update: "Cron 4h",
    note: "utm_id solo se propaga a deals nuevos post-2026-04-26 (workflow Bruno: webhook Attio → Trigger.dev). Sin backfill — eventos previos no tienen atribución directa pauta.",
  },
  qm_asistida_pauta: {
    label: "QM Asistida (pauta)",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "qm_completada/fecha_qm_completada (TRAZA) + utm_id IS NOT NULL",
    update: "Cron 4h",
    note: "Solo deals nuevos post-2026-04-26 (workflow Bruno). Misma traza que la métrica general.",
  },
  demo_pauta: {
    label: "Demo (pauta)",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "demo (TRAZA) + utm_id IS NOT NULL",
    update: "Cron 4h",
    note: "Solo deals nuevos post-2026-04-26.",
  },
  won_pauta: {
    label: "Won (pauta)",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "stage = 'Won 🎉' + utm_id IS NOT NULL",
    update: "Cron 4h",
    note: "Solo deals nuevos post-2026-04-26.",
  },
  mrr_won_pauta: {
    label: "MRR Won (pauta)",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "SUM(value) de deals 'Won 🎉' con utm_id IS NOT NULL",
    update: "Cron 4h",
    note: "Solo deals nuevos post-2026-04-26.",
  },
  lost_pauta: {
    label: "Lost (pauta)",
    flow: ATTIO_DEALS_FLOW,
    table: "fm_deals_by_event",
    column: "stage = 'Lost' OR fecha_close_lost NOT NULL + utm_id IS NOT NULL",
    update: "Cron 4h",
    note: "Solo deals nuevos post-2026-04-26.",
  },

  // ─────────────── Costos (manual) ───────────────
  ad_spend: {
    label: "Inversión en pauta",
    flow: MANUAL_FLOW,
    table: "fm_event_metadata",
    column: "ad_spend (numeric)",
    update: "Manual (input en modal de evento)",
    note: "Hoy lo carga Diego desde CSV de Meta Ads Manager. A futuro: integración Bruno+Diego con Meta BM API.",
  },
  event_cost: {
    label: "Costo total del evento",
    flow: MANUAL_FLOW,
    table: "fm_event_metadata",
    column: "event_cost (numeric)",
    update: "Manual (input en modal de evento)",
    note: "Incluye logística, catering, venue, organización. Distinto de ad_spend (que es solo inversión en pauta).",
  },
  invoice: {
    label: "Facturas / gastos del evento",
    flow: MANUAL_FLOW,
    table: "fm_event_invoices",
    column: "ítems (concepto + monto + pdf_url) — event_cost = SUM(monto)",
    update: "Manual (desplegable en la página de detalle: agregar gasto = concepto + monto + PDF)",
    note: "Jose 2026-07-07: no hay un PDF con el costo total, son varias facturas de cosas del evento. Cada ítem tiene concepto, monto y PDF (prueba, opcional) en el bucket público event-invoices. El costo total del evento (event_cost) se recalcula como la suma de los montos de los ítems.",
  },
  roi: {
    label: "ROI",
    flow: DERIVED_FLOW,
    column: "(mrr_won_pauta / ad_spend) * 100",
    update: "Recalculado en cada render",
    derivedFrom: ["mrr_won_pauta", "ad_spend"],
  },
  costo_por_registro: {
    label: "Costo por registro",
    flow: DERIVED_FLOW,
    column: "event_cost / registros · o ad_spend / registros_performance (modo pauta)",
    update: "Recalculado en cada render",
    derivedFrom: ["event_cost", "registros"],
  },
  costo_por_qm_agend: {
    label: "Costo por QM Agendada",
    flow: DERIVED_FLOW,
    column: "cost / qm_agendada",
    update: "Recalculado en cada render",
    derivedFrom: ["event_cost", "qm_agendada"],
  },
  costo_por_qm_asist: {
    label: "Costo por QM Asistida",
    flow: DERIVED_FLOW,
    column: "cost / qm_asistida",
    update: "Recalculado en cada render",
    derivedFrom: ["event_cost", "qm_asistida"],
  },
  costo_por_demo: {
    label: "Costo por Demo",
    flow: DERIVED_FLOW,
    column: "cost / demo",
    update: "Recalculado en cada render",
    derivedFrom: ["event_cost", "demo"],
  },
  costo_por_won: {
    label: "Costo por Won",
    flow: DERIVED_FLOW,
    column: "cost / won",
    update: "Recalculado en cada render",
    derivedFrom: ["event_cost", "won"],
  },

  // ─────────────── Agregados (totales del dashboard) ───────────────
  total_registros: {
    label: "Total registros",
    flow: DERIVED_FLOW,
    column: "SUM(total_aprobados_icp) de eventos filtrados (aceptados)",
    update: "Recalculado en cada render",
    derivedFrom: ["registros"],
    note: "Desde 2026-05-27 (Jose): el agregado suma aceptados, no totales. El sub muestra totales y descalificados.",
  },
  total_asistentes: {
    label: "Total asistentes",
    flow: DERIVED_FLOW,
    column: "SUM(total_asistentes) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["asistentes"],
  },
  total_qm_agend: {
    label: "Total QM Agendada",
    flow: DERIVED_FLOW,
    column: "SUM(qm_agendada) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["qm_agendada"],
  },
  total_qm_asist: {
    label: "Total QM Asistida",
    flow: DERIVED_FLOW,
    column: "SUM(qm_asistida) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["qm_asistida"],
  },
  total_demo: {
    label: "Total Demo",
    flow: DERIVED_FLOW,
    column: "SUM(demo) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["demo"],
  },
  total_won: {
    label: "Total Won",
    flow: DERIVED_FLOW,
    column: "SUM(won) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["won"],
  },
  total_mrr: {
    label: "Total MRR Won",
    flow: DERIVED_FLOW,
    column: "SUM(mrr_won) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["mrr_won"],
  },
  total_cost: {
    label: "Total costo",
    flow: DERIVED_FLOW,
    column: "SUM(event_cost) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["event_cost"],
  },
  total_inversion: {
    label: "Total inversión pauta",
    flow: DERIVED_FLOW,
    column: "SUM(ad_spend) de eventos filtrados",
    update: "Recalculado en cada render",
    derivedFrom: ["ad_spend"],
  },
};

export function getLineage(key: string | undefined): LineageEntry | null {
  if (!key) return null;
  return METRIC_LINEAGE[key] ?? null;
}
