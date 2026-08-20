import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ATTIO_API_KEY = Deno.env.get("ATTIO_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const ATTIO_BASE = "https://api.attio.com/v2";
const attioHeaders = { Authorization: `Bearer ${ATTIO_API_KEY}`, "Content-Type": "application/json" };

async function attioPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${ATTIO_BASE}${path}`, { method: "POST", headers: attioHeaders, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(`Attio POST ${path}: ${res.status} ${t.substring(0,200)}`); }
  return res.json();
}

function extractVal(values: Record<string, unknown[]>, slug: string): string | null {
  const arr = values?.[slug]; if (!arr?.length) return null;
  const v = arr[0] as Record<string, unknown>;
  if (v?.status) return (v.status as Record<string, unknown>)?.title as string ?? null;
  if (v?.option) return (v.option as Record<string, unknown>)?.title as string ?? null;
  if (v?.value !== undefined) return String(v.value);
  return null;
}
function extractCheck(values: Record<string, unknown[]>, slug: string): boolean {
  const arr = values?.[slug]; if (!arr?.length) return false;
  const v = arr[0] as Record<string, unknown>;
  return v?.value === true || v?.checked_value === true;
}
function extractMulti(values: Record<string, unknown[]>, slug: string): string[] {
  const arr = values?.[slug]; if (!arr?.length) return [];
  return arr.map((v: unknown) => { const val = v as Record<string, unknown>; return (val?.option as Record<string, unknown>)?.title as string ?? (val?.value ? String(val.value) : null); }).filter(Boolean) as string[];
}
function extractRef(values: Record<string, unknown[]>, slug: string): string | null {
  const arr = values?.[slug]; if (!arr?.length) return null;
  return (arr[0] as Record<string, unknown>)?.target_record_id as string ?? null;
}
function extractCurrency(values: Record<string, unknown[]>, slug: string): number | null {
  const arr = values?.[slug]; if (!arr?.length) return null;
  const v = (arr[0] as Record<string, unknown>)?.currency_value;
  return v !== undefined ? Number(v) : null;
}
function extractDate(values: Record<string, unknown[]>, slug: string): string | null {
  const arr = values?.[slug]; if (!arr?.length) return null;
  return (arr[0] as Record<string, unknown>)?.value as string ?? null;
}
function extractPersonName(values: Record<string, unknown[]>): string | null {
  const arr = values?.["name"]; if (!arr?.length) return null;
  const v = arr[0] as Record<string, unknown>;
  const full = v?.full_name as string | undefined;
  if (full) return full;
  const joined = [v?.first_name, v?.last_name].filter(Boolean).join(" ");
  return joined.length > 0 ? joined : null;
}
function extractEmail(values: Record<string, unknown[]>): string | null {
  const arr = values?.["email_addresses"]; if (!arr?.length) return null;
  const v = arr[0] as Record<string, unknown>;
  const em = (v?.email_address as string | undefined) ?? (v?.value as string | undefined);
  return em ?? null;
}

// PRE-QM ya NO cuenta como QM (Jose 2026-07-08). Ademas, qm_type quedo DEPRECADO como
// fuente de la clasificacion directa/influenciada: ahora se computa por ORIGEN del deal
// (Evento Presencial MKT / Webinars MKT = directa) en las vistas SQL fm_pipeline_by_event
// y fm_event_companies_drill. Este campo se mantiene solo por compatibilidad; ningun
// numero del dashboard lo lee.
// v32 (2026-07-10): campos extra de Personas para el detalle de eventos third-party.
function extractNameParts(values: Record<string, unknown[]>): { first: string | null; last: string | null; full: string | null } {
  const arr = values?.["name"]; if (!arr?.length) return { first: null, last: null, full: null };
  const v = arr[0] as Record<string, unknown>;
  const first = (v?.first_name as string) ?? null;
  const last = (v?.last_name as string) ?? null;
  const full = (v?.full_name as string) ?? ([first, last].filter(Boolean).join(" ") || null);
  return { first, last, full };
}
function extractPhone(values: Record<string, unknown[]>): string | null {
  const arr = values?.["phone_numbers"]; if (!arr?.length) return null;
  const v = arr[0] as Record<string, unknown>;
  return (v?.phone_number as string) ?? (v?.original_phone_number as string) ?? (v?.value as string) ?? null;
}
function extractDomain(values: Record<string, unknown[]>): string | null {
  const arr = values?.["domains"]; if (!arr?.length) return null;
  const v = arr[0] as Record<string, unknown>;
  return (v?.domain as string) ?? (v?.value as string) ?? null;
}
// v33 (2026-07-11): actor-reference (ej: assigned_bdr). El active_from del valor es
// cuándo se seteó el atributo = fecha de asignación del BDR (no existe atributo aparte).
function extractActor(values: Record<string, unknown[]>, slug: string): { id: string | null; since: string | null } {
  const arr = values?.[slug]; if (!arr?.length) return { id: null, since: null };
  const v = arr[0] as Record<string, unknown>;
  return { id: (v?.referenced_actor_id as string) ?? null, since: (v?.active_from as string) ?? null };
}
async function fetchWorkspaceMembers(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const r = await fetch(`${ATTIO_BASE}/workspace_members`, { headers: attioHeaders });
    if (!r.ok) return map;
    const j = await r.json();
    for (const m of ((j?.data ?? []) as Record<string, unknown>[])) {
      const idObj = m.id as Record<string, unknown>;
      const id = String(idObj?.workspace_member_id ?? idObj);
      const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || (m.email_address as string) || id;
      map.set(id, name);
    }
  } catch { /* sin nombres: quedan los ids */ }
  return map;
}

// v35 (2026-07-17, Stefany/José): reasignación en bulk del Assigned BDR desde el dashboard.
// Auth: la fase reassign exige x-admin-key con una key PRIVILEGIADA de Supabase; se valida
// intentando leer una tabla con RLS activada y sin policies (solo service-level ve filas).
async function isPrivilegedKey(key: string | null): Promise<boolean> {
  if (!key) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fm_event_metadata?select=luma_event_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j) && j.length > 0;
  } catch { return false; }
}

// NOTA (2026-07-23): el PATCH a Attio requiere que la API key tenga Record permissions en
// Read-Write. El token es "Dashboard Field Marketing" (Attio -> Workspace settings ->
// Developers -> Access tokens); Records se subió a Read-write ese día. Si todos los PATCH
// devuelven 403, revisar los scopes de ese token.
async function reassignBdr(companyIds: string[], bdrId: string) {
  const members = await fetchWorkspaceMembers();
  const bdrName = members.get(bdrId) ?? bdrId;
  let updated = 0; const errors: string[] = [];
  for (let i = 0; i < companyIds.length; i += 5) {
    const group = companyIds.slice(i, i + 5);
    const results = await Promise.all(group.map(async (cid): Promise<string | null> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/companies/records/${cid}`, {
          method: "PATCH",
          headers: attioHeaders,
          body: JSON.stringify({ data: { values: { assigned_bdr: [{ referenced_actor_type: "workspace-member", referenced_actor_id: bdrId }] } } }),
        });
        if (!r.ok) { const t = await r.text(); console.error(`reassign PATCH ${cid}: ${r.status} ${t.substring(0, 300)}`); return `${cid}: ${r.status} ${t.substring(0, 120)}`; }
        return null;
      } catch (e) { console.error(`reassign PATCH ${cid} threw: ${String(e)}`); return `${cid}: ${String(e).substring(0, 120)}`; }
    }));
    for (let g = 0; g < group.length; g++) { if (results[g]) errors.push(results[g]!); else updated++; }
  }
  // Reflejo local inmediato en fm_tagged_companies (el cron tc re-sincroniza el active_from
  // real de Attio después; now() es una aproximación correcta de la fecha de asignación).
  const failed = new Set(errors.map((e) => e.split(":")[0]));
  const okIds = companyIds.filter((cid) => !failed.has(cid));
  if (okIds.length) {
    const { error } = await supabase.from("fm_tagged_companies")
      .update({ assigned_bdr_id: bdrId, assigned_bdr_name: bdrName, bdr_assigned_at: new Date().toISOString(), synced_at: new Date().toISOString() })
      .in("attio_company_id", okIds);
    if (error) errors.push(`local: ${error.message}`);
  }
  return { updated, errors, bdr_id: bdrId, bdr_name: bdrName };
}

// v48 (2026-08-06, Ramiro): descarte en bulk desde el dashboard — empresas del pool que no
// califican para asignarse a ningún BDR ("no cumplen con nada") y quedaban por siempre en
// "sin BDR asignado". Escribe outbound_stage = "Descalificada" en Attio (salen del pool,
// cuentan en DropOff) y registra el descarte en fm_company_discards para distinguirlo de
// las descalificaciones del BDR: una descartada deliberada NO enciende el flag
// descalificada_sin_circuito (el marcador de revisión de Candela).
// outbound_stage es un atributo de tipo `status` en Attio. La API acepta el título como
// string simple, pero según versión/atributo puede exigir el formato [{ status: "..." }].
// Probamos el string y, si Attio lo rechaza, reintentamos con el array — y devolvemos el
// error CRUDO del segundo intento para que se vea en el dashboard (2026-08-10: el botón
// "no funcionaba" y el detalle del fallo no llegaba a la UI).
async function patchOutboundStage(cid: string, titulo: string): Promise<string | null> {
  const cuerpos = [
    { data: { values: { outbound_stage: titulo } } },
    { data: { values: { outbound_stage: [{ status: titulo }] } } },
  ];
  let ultimoError = "";
  for (const body of cuerpos) {
    try {
      const r = await fetch(`${ATTIO_BASE}/objects/companies/records/${cid}`, {
        method: "PATCH", headers: attioHeaders, body: JSON.stringify(body),
      });
      if (r.ok) return null;
      const t = await r.text();
      ultimoError = `HTTP ${r.status} ${t.substring(0, 200)}`;
      console.error(`descartar PATCH ${cid} [${JSON.stringify(body.data.values).substring(0, 60)}]: ${ultimoError}`);
      if (r.status !== 400 && r.status !== 422) break; // 401/403/404 no se arreglan cambiando el formato
    } catch (e) {
      ultimoError = String(e).substring(0, 200);
      console.error(`descartar PATCH ${cid} threw: ${ultimoError}`);
    }
  }
  return `${cid}: ${ultimoError}`;
}

async function descartarCompanies(companyIds: string[]) {
  let updated = 0; const errors: string[] = [];
  for (let i = 0; i < companyIds.length; i += 5) {
    const group = companyIds.slice(i, i + 5);
    const results = await Promise.all(group.map((cid) => patchOutboundStage(cid, "Descalificada")));
    for (let g = 0; g < group.length; g++) { if (results[g]) errors.push(results[g]!); else updated++; }
  }
  // Reflejo local inmediato + registro del descarte (el cron tc re-sincroniza después).
  const failed = new Set(errors.map((e) => e.split(":")[0]));
  const okIds = companyIds.filter((cid) => !failed.has(cid));
  if (okIds.length) {
    const { error } = await supabase.from("fm_tagged_companies")
      .update({ outbound_stage: "Descalificada", synced_at: new Date().toISOString() })
      .in("attio_company_id", okIds);
    if (error) errors.push(`local: ${error.message}`);
    const { error: e2 } = await supabase.from("fm_company_discards")
      .upsert(okIds.map((cid) => ({ attio_company_id: cid, source: "dashboard" })), { onConflict: "attio_company_id" });
    if (e2) errors.push(`discards: ${e2.message}`);
  }
  return { updated, errors };
}

// v55 (2026-08-19, José): atribuir un evento a un deal desde la cola de revisión del
// dashboard (fm_deals_sin_atribuir — deals con origen evento/webinar o empresa taggeada
// pero sin campana_evento). Escribe el tag multiselect en el DEAL de Attio y refleja
// local. campana_evento es multiselect: la API acepta el array de títulos como strings,
// pero según versión puede exigir [{ option: "..." }] — mismo patrón de doble intento
// que patchOutboundStage, devolviendo el error crudo del último intento.
async function atribuirDeal(dealId: string, slug: string): Promise<string | null> {
  const cuerpos = [
    { data: { values: { campana_evento: [slug] } } },
    { data: { values: { campana_evento: [{ option: slug }] } } },
  ];
  let ultimoError = "";
  for (const body of cuerpos) {
    try {
      const r = await fetch(`${ATTIO_BASE}/objects/deals/records/${dealId}`, {
        method: "PATCH", headers: attioHeaders, body: JSON.stringify(body),
      });
      if (r.ok) return null;
      const t = await r.text();
      ultimoError = `HTTP ${r.status} ${t.substring(0, 200)}`;
      console.error(`atribuir PATCH ${dealId} [${JSON.stringify(body.data.values).substring(0, 60)}]: ${ultimoError}`);
      if (r.status !== 400 && r.status !== 422) break; // 401/403/404 no se arreglan cambiando el formato
    } catch (e) {
      ultimoError = String(e).substring(0, 200);
      console.error(`atribuir PATCH ${dealId} threw: ${ultimoError}`);
    }
  }
  return ultimoError;
}

async function atribuirDeals(dealIds: string[], slug: string) {
  let updated = 0; const errors: string[] = [];
  for (let i = 0; i < dealIds.length; i += 5) {
    const group = dealIds.slice(i, i + 5);
    const results = await Promise.all(group.map((did) => atribuirDeal(did, slug)));
    for (let g = 0; g < group.length; g++) { if (results[g]) errors.push(`${group[g]}: ${results[g]}`); else updated++; }
  }
  // Reflejo local inmediato (el cron horario de deals re-sincroniza el valor real después).
  const failed = new Set(errors.map((e) => e.split(":")[0]));
  const okIds = dealIds.filter((did) => !failed.has(did));
  if (okIds.length) {
    const { error } = await supabase.from("fm_attio_deals")
      .update({ campana_evento: slug, synced_at: new Date().toISOString() })
      .in("attio_deal_id", okIds);
    if (error) errors.push(`local: ${error.message}`);
  }
  return { updated, errors, slug };
}

const QM_STAGES = ["QM AGENDADA", "QM SHOW", "QM NO SHOW"];
function computeQmType(status: string | null | undefined, outboundStage: string, hasOpenDeal: boolean): string | null {
  if (status === "QM" || QM_STAGES.includes(outboundStage)) {
    return hasOpenDeal ? "influenciada" : "generada";
  }
  return null;
}

function dealRowFromValues(idObj: Record<string, unknown>, vals: Record<string, unknown[]>) {
  return {
    attio_deal_id: String(idObj?.record_id ?? idObj),
    attio_company_id: extractRef(vals, "associated_company"),
    deal_name: extractVal(vals, "name"),
    stage: extractVal(vals, "stage"),
    value_amount: extractCurrency(vals, "value"),
    value_currency: "USD",
    // BUG 2026-08-18 (5 QMs de Evento_Aliados_07/08/26 invisibles): una automatización crea
    // deals con el evento en campana_evento_texto (texto libre) y el tag multiselect VACÍO.
    // Todas las vistas atribuyen por el tag, así que esos deals no existían para el dashboard.
    // El texto entra como fallback solo cuando el tag falta — si ambos están, gana el tag.
    campana_evento: extractMulti(vals, "campana_evento").join(", ") ||
      (extractVal(vals, "campana_evento_texto")?.trim() ?? ""),
    origen_negocio: extractVal(vals, "origen_del_negocio_general"),
    close_date: extractDate(vals, "close_date"),
    fecha_qm_agendada: extractDate(vals, "fecha_qm_agendada"),
    fecha_qm_completada: extractDate(vals, "fecha_qm_completada"),
    fecha_de_demo: extractDate(vals, "fecha_de_demo"),
    fecha_de_revision_interna: extractDate(vals, "fecha_de_revision_interna"),
    fecha_negociacion_de_terminos_completada: extractDate(vals, "fecha_negociacion_de_terminos_completada"),
    fecha_close_lost: extractDate(vals, "fecha_close_lost"),
    deal_stage_previo_a_lost: extractVal(vals, "deal_stage_previo_a_lost") ?? extractVal(vals, "stage_previo_a_lost"),
    qm_completada: extractCheck(vals, "qm_completada"),
    demo_completado: extractCheck(vals, "demo_completado"),
    revision_interna_completada: extractCheck(vals, "revision_interna_completada"),
    negociacion_de_terminos_completado: extractCheck(vals, "negociacion_de_terminos_completado"),
    created_at_attio: extractDate(vals, "created_at"),
    utm_id: extractVal(vals, "utm_id"),
    synced_at: new Date().toISOString(),
  };
}

async function syncListEntries() {
  let offset = 0; const allEntries: Record<string, unknown>[] = [];
  while (true) {
    const res = await attioPost("/lists/events_companies/entries/query", { limit: 500, offset });
    const entries = res.data ?? []; allEntries.push(...entries);
    if (entries.length < 500) break; offset += 500;
  }
  const rows = allEntries.map((entry) => {
    const e = entry as Record<string, unknown>;
    const parentId = e.parent_record_id as string;
    const entryIdObj = e.entry_id ?? (e.id as Record<string, unknown>)?.entry_id ?? e.id;
    const vals = e.entry_values as Record<string, unknown[]>;
    return { attio_entry_id: String(entryIdObj), attio_company_id: parentId, campana_evento: extractVal(vals, "campana_evento"), proceso_fm_status: extractVal(vals, "proceso_field_marketing"), asistio_empresa: extractCheck(vals, "asistio_a_evento"), canal_inscripcion: extractVal(vals, "canal_de_inscripcion"), synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  });
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("fm_attio_companies").upsert(rows.slice(i, i + 100), { onConflict: "attio_entry_id" });
    if (error) console.error(`Upsert batch ${i}:`, error);
  }
  return rows.length;
}

async function enrichCompanies() {
  const { data: companies } = await supabase.from("fm_attio_companies").select("attio_company_id").is("company_name", null);
  if (!companies?.length) return 0;
  const uniqueIds = [...new Set(companies.map(c => c.attio_company_id))];
  let enriched = 0;
  for (const cid of uniqueIds) {
    try {
      const res = await fetch(`${ATTIO_BASE}/objects/companies/records/${cid}`, { headers: attioHeaders });
      if (!res.ok) continue;
      const data = await res.json(); const vals = data.data?.values ?? {};
      const name = extractVal(vals, "name") ?? "Unknown";
      const outboundStage = extractVal(vals, "outbound_stage") ?? "";
      const dealRefs = vals?.associated_deals ?? [];
      const hasOpenDeal = dealRefs.length > 0;
      const { data: cached } = await supabase.from("fm_attio_companies").select("proceso_fm_status").eq("attio_company_id", cid).limit(1);
      const status = cached?.[0]?.proceso_fm_status;
      const qmType = computeQmType(status, outboundStage, hasOpenDeal);
      const companyCampanas = extractMulti(vals, "campana_evento");
      await supabase.from("fm_attio_companies").update({ company_name: name, outbound_stage: outboundStage, has_open_deal: hasOpenDeal, open_deal_count: dealRefs.length, qm_type: qmType, company_campanas: companyCampanas, updated_at: new Date().toISOString() }).eq("attio_company_id", cid);
      enriched++;
    } catch { /* skip */ }
  }
  return enriched;
}

async function refreshCompanies(offset = 0, limit = 400) {
  const { data: rows } = await supabase.from("fm_attio_companies").select("attio_company_id, proceso_fm_status").order("attio_company_id");
  if (!rows?.length) return { total: 0, processed: 0, updated: 0, errors: 0, next_offset: null };
  const statusById = new Map<string, string | null>();
  const orderedIds: string[] = [];
  for (const r of rows) {
    const cid = r.attio_company_id as string;
    if (!statusById.has(cid)) { statusById.set(cid, (r.proceso_fm_status as string) ?? null); orderedIds.push(cid); }
    else if (!statusById.get(cid) && r.proceso_fm_status) statusById.set(cid, r.proceso_fm_status as string);
  }
  const total = orderedIds.length;
  const batch = orderedIds.slice(offset, offset + limit);
  let updated = 0, errors = 0;
  const updates: Array<Record<string, unknown>> = [];
  for (let i = 0; i < batch.length; i += 8) {
    const group = batch.slice(i, i + 8);
    const results = await Promise.all(group.map(async (cid): Promise<Record<string, unknown> | null> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/companies/records/${cid}`, { headers: attioHeaders });
        if (!r.ok) return null;
        const j = await r.json(); const vals = (j?.data?.values ?? {}) as Record<string, unknown[]>;
        const name = extractVal(vals, "name") ?? "Unknown";
        const outboundStage = extractVal(vals, "outbound_stage") ?? "";
        const dealRefs = (vals?.associated_deals ?? []) as unknown[];
        const hasOpenDeal = dealRefs.length > 0;
        const qmType = computeQmType(statusById.get(cid), outboundStage, hasOpenDeal);
        const companyCampanas = extractMulti(vals, "campana_evento");
        return { attio_company_id: cid, company_name: name, outbound_stage: outboundStage, has_open_deal: hasOpenDeal, open_deal_count: dealRefs.length, qm_type: qmType, company_campanas: companyCampanas, updated_at: new Date().toISOString() };
      } catch { return null; }
    }));
    for (const row of results) { if (row) updates.push(row); else errors++; }
  }
  for (const u of updates) {
    const { error } = await supabase.from("fm_attio_companies").update({ company_name: u.company_name, outbound_stage: u.outbound_stage, has_open_deal: u.has_open_deal, open_deal_count: u.open_deal_count, qm_type: u.qm_type, company_campanas: u.company_campanas, updated_at: u.updated_at }).eq("attio_company_id", u.attio_company_id);
    if (error) { errors++; } else { updated++; }
  }
  const nextOffset = offset + batch.length >= total ? null : offset + batch.length;
  return { total, processed: batch.length, updated, errors, next_offset: nextOffset };
}

// v28 (2026-07-07): sincroniza Personas con Origen de invitacion = Thirdparty (eventos
// third-party, no-Luma). Alimenta fm_third_party_people -> fm_third_party_summary.
async function syncThirdPartyPeople() {
  const originFilter = { "$or": [
    { origen_de_invitacion: { "$eq": "Thirdparty" } },
    { origen_de_invitacion: { "$eq": "Third Party" } },
    { origen_de_invitacion: { "$eq": "ThirdParty" } },
    { origen_de_invitacion: { "$eq": "third party" } },
  ] };
  let offset = 0, total = 0;
  const allRows: Record<string, unknown>[] = [];
  while (true) {
    const res = await attioPost("/objects/people/records/query", { limit: 500, offset, filter: originFilter });
    const records = (res.data ?? []) as Record<string, unknown>[];
    if (!records.length) break;
    total += records.length;
    for (const p of records) {
      const vals = ((p as Record<string, unknown>).values ?? {}) as Record<string, unknown[]>;
      const idObj = (p as Record<string, unknown>).id as Record<string, unknown>;
      const nm = extractNameParts(vals);
      allRows.push({
        attio_person_id: String(idObj?.record_id ?? idObj),
        full_name: nm.full,
        first_name: nm.first,
        last_name: nm.last,
        job_title: extractVal(vals, "job_title"),
        phone: extractPhone(vals),
        email: extractEmail(vals),
        campana_evento: extractMulti(vals, "campana_evento").join(", "),
        origen_invitacion: extractVal(vals, "origen_de_invitacion"),
        attio_company_id: extractRef(vals, "company"),
        synced_at: new Date().toISOString(),
      });
    }
    if (records.length < 500) break;
    offset += 500;
  }

  // Nombre + dominio de la empresa de cada persona (batch por empresa distinta).
  const companyIds = [...new Set(allRows.map((r) => r.attio_company_id as string | null).filter(Boolean))] as string[];
  const companyInfo = new Map<string, { name: string | null; domain: string | null }>();
  for (let i = 0; i < companyIds.length; i += 8) {
    const group = companyIds.slice(i, i + 8);
    const results = await Promise.all(group.map(async (cid): Promise<[string, { name: string | null; domain: string | null }]> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/companies/records/${cid}`, { headers: attioHeaders });
        if (!r.ok) return [cid, { name: null, domain: null }];
        const j = await r.json();
        const cvals = (j?.data?.values ?? {}) as Record<string, unknown[]>;
        return [cid, { name: extractVal(cvals, "name"), domain: extractDomain(cvals) }];
      } catch { return [cid, { name: null, domain: null }]; }
    }));
    for (const [cid, info] of results) companyInfo.set(cid, info);
  }
  for (const row of allRows) {
    const info = row.attio_company_id ? companyInfo.get(row.attio_company_id as string) : null;
    row.company_name = info?.name ?? null;
    row.company_domain = info?.domain ?? null;
  }

  let upserted = 0;
  for (let i = 0; i < allRows.length; i += 100) {
    const { error } = await supabase.from("fm_third_party_people").upsert(allRows.slice(i, i + 100), { onConflict: "attio_person_id" });
    if (error) console.error(`Upsert tp_people i=${i}:`, error);
    else upserted += allRows.slice(i, i + 100).length;
  }
  return { total, upserted, companies: companyIds.length };
}

async function syncDeals(since?: string | null) {
  const { data: companies } = await supabase.from("fm_attio_companies").select("attio_company_id");
  if (!companies?.length) return { processed: 0, upserted: 0, since: since ?? null };
  const companyIds = [...new Set(companies.map(c => c.attio_company_id))];
  const companySet = new Set(companyIds);
  const queryBody: Record<string, unknown> = { limit: 500 };
  if (since) {
    queryBody.filter = { created_at: { "$gte": since } };
    queryBody.sorts = [{ attribute: "created_at", direction: "desc" }];
  }
  let offset = 0, totalProcessed = 0, totalUpserted = 0;
  while (true) {
    const res = await attioPost("/objects/deals/records/query", { ...queryBody, offset });
    const records = (res.data ?? []) as Record<string, unknown>[];
    if (!records.length) break;
    totalProcessed += records.length;
    const eventDeals = records.filter((d) => {
      const vals = d.values as Record<string, unknown[]>;
      const compId = extractRef(vals, "associated_company");
      return compId && companySet.has(compId);
    });
    const rows = eventDeals.map((d) => dealRowFromValues(d.id as Record<string, unknown>, d.values as Record<string, unknown[]>));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("fm_attio_deals").upsert(rows.slice(i, i + 100), { onConflict: "attio_deal_id" });
      if (error) console.error(`Upsert deals batch offset=${offset} i=${i}:`, error);
    }
    totalUpserted += rows.length;
    if (records.length < 500) break;
    offset += 500;
  }
  return { processed: totalProcessed, upserted: totalUpserted, since: since ?? null };
}

async function syncTaggedDeals() {
  const optsRes = await fetch(`${ATTIO_BASE}/objects/deals/attributes/campana_evento/options`, { headers: attioHeaders });
  if (!optsRes.ok) {
    const t = await optsRes.text();
    throw new Error(`Attio options list: ${optsRes.status} ${t.substring(0,200)}`);
  }
  const optsJson = await optsRes.json();
  const optionSlugs = ((optsJson?.data ?? []) as Record<string, unknown>[])
    .filter((o) => o.is_archived !== true)
    .map((o) => o.title as string)
    .filter(Boolean);

  // v55: persistir las options del DEAL para el selector de atribución del dashboard
  // (fm_deals_sin_atribuir). Delete+insert para que las archivadas desaparezcan.
  {
    const now = new Date().toISOString();
    const { error: delErr } = await supabase.from("fm_campana_options").delete().neq("slug", "");
    if (delErr) console.error("fm_campana_options delete:", delErr);
    const { error: insErr } = await supabase.from("fm_campana_options")
      .upsert(optionSlugs.map((slug) => ({ slug, synced_at: now })), { onConflict: "slug" });
    if (insErr) console.error("fm_campana_options upsert:", insErr);
  }

  let upserted = 0;
  const okSlugs: string[] = [];
  const badSlugs: string[] = [];
  for (const slug of optionSlugs) {
    try {
      let offset = 0;
      let slugCount = 0;
      while (true) {
        const res = await attioPost("/objects/deals/records/query", { limit: 500, offset, filter: { campana_evento: { "$eq": slug } } });
        const records = (res.data ?? []) as Record<string, unknown>[];
        if (!records.length) break;
        const rows = records.map((d) => dealRowFromValues(d.id as Record<string, unknown>, d.values as Record<string, unknown[]>));
        for (let i = 0; i < rows.length; i += 100) {
          const { error } = await supabase.from("fm_attio_deals").upsert(rows.slice(i, i + 100), { onConflict: "attio_deal_id" });
          if (error) console.error(`Upsert tagged ${slug} i=${i}:`, error);
        }
        upserted += rows.length;
        slugCount += records.length;
        if (records.length < 500) break;
        offset += 500;
      }
      okSlugs.push(`${slug} (${slugCount})`);
    } catch (e) {
      badSlugs.push(`${slug}: ${String(e).substring(0, 100)}`);
    }
  }
  return { total_options: optionSlugs.length, upserted, ok_slugs: okSlugs, bad_slugs: badSlugs };
}

// v50 (2026-08-18, Ramiro): deals con el evento SOLO en campana_evento_texto. Una
// automatización los crea así desde ~08-13 (texto libre cargado, tag multiselect vacío) y
// como ninguna vista ni sync miraba ese campo, eran QMs invisibles — así se perdieron 4 de
// los 5 de Evento_Aliados_07/08/26. Una sola pasada paginada por todos los que tienen
// texto (no una query por slug: duplicar el loop de tagged pasó los 150s del gateway);
// dealRowFromValues ya usa el texto como fallback del tag al armar la fila.
// Attio no soporta $not_empty en atributos de texto → se filtra por $contains "_", que
// todos los slugs de campaña tienen (Evento_*, Webinar_*, FEWAUT_*).
async function syncTextoDeals() {
  let offset = 0, total = 0, upserted = 0;
  while (true) {
    const res = await attioPost("/objects/deals/records/query", { limit: 500, offset, filter: { campana_evento_texto: { "$contains": "_" } } });
    const records = (res.data ?? []) as Record<string, unknown>[];
    if (!records.length) break;
    total += records.length;
    const rows = records.map((d) => dealRowFromValues(d.id as Record<string, unknown>, d.values as Record<string, unknown[]>));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("fm_attio_deals").upsert(rows.slice(i, i + 100), { onConflict: "attio_deal_id" });
      if (error) console.error(`Upsert texto i=${i}:`, error);
    }
    upserted += rows.length;
    if (records.length < 500) break;
    offset += 500;
  }
  return { total, upserted };
}

// v52 (2026-08-18, idea Ramiro): tercera red de descubrimiento — deals por ORIGEN
// (origen_del_negocio_general = evento/webinar MKT). El origen dice que el deal ES de un
// evento pero no de CUÁL, así que no sirve para atribuir: sirve para que un deal donde
// cargaron el origen pero se olvidaron del tag Y del texto igual entre a la base. Las
// vistas exigen campana_evento <> '' (verificado 2026-08-18), así que un deal sin slug
// entra a fm_attio_deals pero NO cuenta en ningún número hasta que alguien lo atribuya.
// `sin_atribuir` en la respuesta es la cola de data quality: deals que dicen ser de
// evento y nadie sabe de cuál — el insumo para reclamar en el origen, no para adivinar.
const ORIGENES_EVENTO = ["Evento Presencial MKT", "Webinars MKT"];
async function syncOrigenDeals() {
  let offset = 0, total = 0, upserted = 0, sinAtribuir = 0;
  const filter = { "$or": ORIGENES_EVENTO.map((o) => ({ origen_del_negocio_general: { "$eq": o } })) };
  while (true) {
    const res = await attioPost("/objects/deals/records/query", { limit: 500, offset, filter });
    const records = (res.data ?? []) as Record<string, unknown>[];
    if (!records.length) break;
    total += records.length;
    const rows = records.map((d) => dealRowFromValues(d.id as Record<string, unknown>, d.values as Record<string, unknown[]>));
    sinAtribuir += rows.filter((r) => !r.campana_evento).length;
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("fm_attio_deals").upsert(rows.slice(i, i + 100), { onConflict: "attio_deal_id" });
      if (error) console.error(`Upsert origen i=${i}:`, error);
    }
    upserted += rows.length;
    if (records.length < 500) break;
    offset += 500;
  }
  return { total, upserted, sin_atribuir: sinAtribuir };
}

// v58 (2026-08-20, José): la cola de revisión (fm_deals_sin_atribuir) mostraba deals que
// en Attio ya estaban Lost — entraron a fm_attio_deals una vez (vía empresa taggeada, sin
// tag/texto/origen evento) y NINGUNA fase los volvía a tocar (caso UNAD: synced_at 06-05,
// Lost en Attio desde 28-05). Esta fase refresca desde Attio exactamente los deals que
// están HOY en la cola (~120 y bajando): al actualizar stage/fecha_close_lost, los Lost
// salen solos por el filtro de la vista. Corre en el cron horario de deals.
async function refreshColaSinAtribuir() {
  const { data: rows } = await supabase.from("fm_deals_sin_atribuir").select("attio_deal_id");
  const ids = ((rows ?? []) as { attio_deal_id: string }[]).map((r) => r.attio_deal_id);
  if (!ids.length) return { total: 0, updated: 0, errors: 0 };
  let updated = 0, errors = 0;
  const updates: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ids.length; i += 8) {
    const group = ids.slice(i, i + 8);
    const results = await Promise.all(group.map(async (dealId): Promise<Record<string, unknown> | null> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/deals/records/${dealId}`, { headers: attioHeaders });
        if (!r.ok) return null;
        const j = await r.json();
        return dealRowFromValues(j?.data?.id as Record<string, unknown>, (j?.data?.values ?? {}) as Record<string, unknown[]>);
      } catch { return null; }
    }));
    for (const row of results) { if (row) updates.push(row); else errors++; }
  }
  for (let i = 0; i < updates.length; i += 100) {
    const { error } = await supabase.from("fm_attio_deals").upsert(updates.slice(i, i + 100), { onConflict: "attio_deal_id" });
    if (error) { console.error(`Upsert refresh_cola i=${i}:`, error); errors++; } else { updated += updates.slice(i, i + 100).length; }
  }
  return { total: ids.length, updated, errors };
}

// ───────────────────────── Whatan: WhatsApp real de los BDRs ─────────────────────────
// v56 (2026-08-19, rediseño WhatsApp): los BDRs prospectan con Whatan (whatan.app, alias
// WhatSync) — bandeja que conecta sus números de WhatsApp Business con Attio y crea notas
// "WhatsApp Conversation - ..." a nivel People con el TRANSCRIPT por mensaje. Esos
// WhatsApps no existían en activities (la cadena BigQuery solo trae campañas del producto).
// Esta fase escanea las notas nuevas (watermark por created_at), parsea el transcript y
// las inserta en activities con source='whatan' vía RPC whatan_insert_activities (dedup
// por MENSAJE: Whatan puede crear notas duplicadas exactas — visto 2026-07-24).
// ⚠️ Las filas NO cuentan en las vistas fm_* todavía (filtran sender='USER'): el switch de
// definición se coordina con Cande/José antes de tocar las vistas.
// Solo se ingestan mensajes de personas mapeables a contactos_growth (attio_record_id o
// teléfono): las conversaciones personales de los agentes (Whatan sincroniza el WhatsApp
// completo) quedan afuera por diseño.
const WHATAN_APP_ACTOR_ID = "a343acdf-359b-44f6-a468-a10dafbc5309";
const WHATAN_TITLE_PREFIX = "WhatsApp Conversation";
const WHATAN_MESES: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Hash chico y estable para el dedup por mensaje (el texto puede ser largo/multilínea).
function whatanHash(s: string): string {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) >>> 0;
    h2 = ((h2 * 37) ^ c) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// Timestamps del transcript, SIEMPRE UTC (verificado contra whatsapp_last_message_at y el
// created_at de las notas). Tres formatos históricos: "Aug 19, 2026, 10:24 PM" (actual),
// "Mar 31, 11:56 PM" y "Feb 19, 6:45 PM" (sin año → se toma del created_at de la nota; si
// el resultado queda a futuro de la nota, era diciembre visto en enero → año anterior).
function parseWhatanTs(raw: string, noteCreatedAt: Date): string | null {
  const m = raw.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(?:(\d{4}),\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const mon = WHATAN_MESES[m[1].toLowerCase()];
  if (mon === undefined) return null;
  const day = Number(m[2]);
  let year = m[3] ? Number(m[3]) : noteCreatedAt.getUTCFullYear();
  let hour = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  let ts = Date.UTC(year, mon, day, hour, Number(m[5]));
  if (!m[3] && ts > noteCreatedAt.getTime() + 2 * 86400000) {
    year -= 1;
    ts = Date.UTC(year, mon, day, hour, Number(m[5]));
  }
  return new Date(ts).toISOString();
}

type WhatanMsg = { ts: string; direction: "outbound" | "inbound"; text: string; fromName: string | null };

// Header de mensaje en cualquiera de los 3 formatos:
//   "[Aug 19, 2026, 10:24 PM] Outbound - You"        (actual: nombre tras "-", texto en líneas siguientes)
//   "[Mar 31, 11:56 PM] 📤 Outbound: mensaje"        (texto en la misma línea tras ":")
//   "**[Feb 19, 6:45 PM]** 📤 *Outbound*"            (markdown, texto en líneas siguientes)
const WHATAN_HEADER_RE = /^\s*\*{0,2}\[([^\]]+)\]\*{0,2}\s*(?:📤|📩)?\s*\*?(Outbound|Inbound)\*?\s*(?:(-|:)\s*(.*))?\s*$/;

function parseWhatanBody(body: string, noteCreatedAt: Date): WhatanMsg[] {
  const msgs: WhatanMsg[] = [];
  let cur: WhatanMsg | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^\s*-{3,}\s*$/.test(line)) continue; // separadores --- / -----
    const m = line.match(WHATAN_HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.text.trim(); msgs.push(cur); }
      const ts = parseWhatanTs(m[1], noteCreatedAt);
      if (!ts) { cur = null; continue; }
      const direction = m[2].toLowerCase() as "outbound" | "inbound";
      // ":" → el resto de la línea es la primera línea del mensaje; "-" → es el nombre del emisor.
      cur = { ts, direction, text: m[3] === ":" ? (m[4] ?? "") : "", fromName: m[3] === "-" ? (m[4] ?? "").trim() || null : null };
    } else if (cur) {
      cur.text = cur.text ? cur.text + "\n" + line : line;
    }
  }
  if (cur) { cur.text = cur.text.trim(); msgs.push(cur); }
  return msgs;
}

// Resuelve personas de Attio → (contact_id, company_id) de growth, con cache persistente
// en whatan_person_map. Prioridad: contactos_growth.attio_record_id → teléfono de la
// persona (fetch a Attio) → sin match (se descarta la nota: filtro de ruido/privacidad).
async function resolveWhatanPersons(personIds: string[]): Promise<Map<string, { contact_id: string | null; company_id: string | null }>> {
  const out = new Map<string, { contact_id: string | null; company_id: string | null }>();
  const unique = [...new Set(personIds)];
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await supabase.from("whatan_person_map").select("attio_person_id, contact_id, company_id").in("attio_person_id", unique.slice(i, i + 100));
    for (const r of (data ?? []) as Record<string, string | null>[]) out.set(r.attio_person_id as string, { contact_id: r.contact_id, company_id: r.company_id });
  }
  let missing = unique.filter((p) => !out.has(p));
  const nuevos: Record<string, unknown>[] = [];
  for (let i = 0; i < missing.length; i += 100) {
    const { data } = await supabase.from("contactos_growth").select("id, company_id, attio_record_id").in("attio_record_id", missing.slice(i, i + 100));
    for (const c of (data ?? []) as Record<string, string | null>[]) {
      const pid = c.attio_record_id as string;
      if (out.has(pid)) continue;
      out.set(pid, { contact_id: c.id, company_id: c.company_id });
      nuevos.push({ attio_person_id: pid, contact_id: c.id, company_id: c.company_id, matched: "attio_id" });
    }
  }
  missing = unique.filter((p) => !out.has(p));
  for (let i = 0; i < missing.length; i += 8) {
    const group = missing.slice(i, i + 8);
    const fetched = await Promise.all(group.map(async (pid): Promise<[string, string | null]> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/people/records/${pid}`, { headers: attioHeaders });
        if (!r.ok) return [pid, null];
        const j = await r.json();
        const vals = (j?.data?.values ?? {}) as Record<string, unknown[]>;
        return [pid, extractPhone(vals) ?? extractVal(vals, "whatsapp_phone_number")];
      } catch { return [pid, null]; }
    }));
    for (const [pid, phone] of fetched) {
      let contact: string | null = null, company: string | null = null;
      if (phone) {
        const { data } = await supabase.from("contactos_growth").select("id, company_id").eq("phone_e164", phone).limit(5);
        const rows = (data ?? []) as { id: string; company_id: string | null }[];
        const pick = rows.find((c) => c.company_id) ?? rows[0];
        if (pick) { contact = pick.id; company = pick.company_id; }
      }
      out.set(pid, { contact_id: contact, company_id: company });
      nuevos.push({ attio_person_id: pid, contact_id: contact, company_id: company, phone, matched: contact ? "phone" : "none" });
    }
  }
  for (let i = 0; i < nuevos.length; i += 100) {
    const { error } = await supabase.from("whatan_person_map").upsert(nuevos.slice(i, i + 100), { onConflict: "attio_person_id" });
    if (error) console.error("whatan_person_map upsert:", error);
  }
  return out;
}

async function syncWhatanNotes(startOffset = -1, maxPages = 20) {
  // ⚠️ Attio lista las notas en orden ASCENDENTE de creación (verificado 2026-08-19:
  // offset 0 devuelve las de febrero). El estado es un CURSOR de offset que avanza hacia
  // el presente; cada corrida arranca 2 páginas ANTES del cursor guardado (overlap) por si
  // un borrado de notas corrió posiciones — los inserts son idempotentes, re-leer es gratis.
  const { data: stRows } = await supabase.from("whatan_sync_state").select("*").eq("id", 1);
  const st = (stRows?.[0] ?? null) as { last_note_created_at: string | null; last_offset: number | null } | null;
  let offset = startOffset >= 0 ? startOffset : Math.max(0, (st?.last_offset ?? 0) - 100);
  const initialOffset = offset;
  let pages = 0, scanned = 0, notasWhatan = 0, bodiesFetched = 0;
  let newest: string | null = st?.last_note_created_at ?? null;
  let reachedEnd = false;
  type PendingRow = { contact_id: string | null; company_id: string | null; activity_type: string; source_id: string; activity_date: string; metadata: Record<string, unknown> };
  const parsed: { personId: string; noteId: string; msgs: WhatanMsg[] }[] = [];

  while (pages < maxPages && !reachedEnd) {
    const r = await fetch(`${ATTIO_BASE}/notes?limit=50&offset=${offset}`, { headers: attioHeaders });
    if (!r.ok) throw new Error(`Attio notes list: ${r.status} ${(await r.text()).substring(0, 200)}`);
    const j = await r.json();
    const notes = (j?.data ?? []) as Record<string, unknown>[];
    pages++; scanned += notes.length;
    if (!notes.length) { reachedEnd = true; break; }
    // El cursor solo avanza por páginas COMPLETAS: una página parcial se re-lee entera la
    // próxima corrida (las posiciones que faltan se llenan con notas nuevas).
    if (notes.length === 50) offset += 50; else reachedEnd = true;
    for (const n of notes) {
      const created = String(n.created_at ?? "");
      if (!newest || created > newest) newest = created;
      const actor = (n.created_by_actor ?? n.created_by) as Record<string, unknown> | undefined;
      if (actor?.type !== "app" || String(actor?.id ?? "") !== WHATAN_APP_ACTOR_ID) continue;
      if (!String(n.title ?? "").startsWith(WHATAN_TITLE_PREFIX)) continue;
      const personId = String(n.parent_record_id ?? "");
      if (!personId) continue;
      const noteId = String((n.id as Record<string, unknown>)?.note_id ?? n.id ?? "");
      let body = (n.content_plaintext ?? n.content_markdown ?? null) as string | null;
      if (body == null && noteId) {
        try {
          const nr = await fetch(`${ATTIO_BASE}/notes/${noteId}`, { headers: attioHeaders });
          if (nr.ok) { const nj = await nr.json(); body = (nj?.data?.content_plaintext ?? nj?.data?.content_markdown ?? null) as string | null; bodiesFetched++; }
        } catch { /* skip */ }
      }
      if (!body) continue;
      notasWhatan++;
      const msgs = parseWhatanBody(body, new Date(created));
      if (msgs.length) parsed.push({ personId, noteId, msgs });
    }
  }

  const resolved = await resolveWhatanPersons(parsed.map((p) => p.personId));
  const rows: PendingRow[] = [];
  let sinContacto = 0;
  for (const p of parsed) {
    const link = resolved.get(p.personId);
    if (!link?.contact_id) { sinContacto++; continue; } // sin contacto no hay dedup ni circuito: se descarta
    for (const m of p.msgs) {
      rows.push({
        contact_id: link.contact_id,
        company_id: link.company_id,
        activity_type: m.direction === "outbound" ? "whatsapp_sent" : "whatsapp_replied",
        // dedup por mensaje (no por nota): persona + minuto + dirección + hash del texto
        source_id: `${p.personId}|${m.ts}|${m.direction}|${whatanHash(m.text)}`,
        activity_date: m.ts,
        metadata: {
          source: "whatan", sender: m.direction === "outbound" ? "AGENT" : "CLIENT",
          direction: m.direction, text: m.text.substring(0, 2000),
          reply_text: m.direction === "inbound" ? m.text.substring(0, 2000) : null,
          note_id: p.noteId, attio_person_id: p.personId, from_name: m.fromName,
        },
      });
    }
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase.rpc("whatan_insert_activities", { payload: rows.slice(i, i + 200) });
    if (error) console.error(`whatan_insert_activities i=${i}:`, error);
    else inserted += Number(data ?? 0);
  }
  // El cursor solo se persiste en corridas normales (sin offset explícito): una corrida
  // manual de backfill con offset no debe pisar el estado del cron.
  if (startOffset < 0) {
    const { error } = await supabase.from("whatan_sync_state").update({ last_offset: offset, last_note_created_at: newest, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) console.error("whatan_sync_state update:", error);
  }
  return { pages, scanned, from_offset: initialOffset, cursor: offset, notas_whatan: notasWhatan, mensajes: rows.length, inserted, sin_contacto: sinContacto, bodies_fetched: bodiesFetched, reached_end: reachedEnd, next_offset: reachedEnd ? null : offset };
}

// Jose 2026-07-08: trae EMPRESAS por el tag Campaña/Evento del objeto Company (no solo las
// que estan en la list events_companies). Alimenta fm_tagged_companies -> fm_qm_by_event.
// QM FM se ancla en este tag (source of truth de ventas), igual que Jose filtra en Attio.
async function syncTaggedCompanies() {
  const optsRes = await fetch(`${ATTIO_BASE}/objects/companies/attributes/campana_evento/options`, { headers: attioHeaders });
  if (!optsRes.ok) {
    const t = await optsRes.text();
    throw new Error(`Attio company options list: ${optsRes.status} ${t.substring(0,200)}`);
  }
  const optsJson = await optsRes.json();
  const optionSlugs = ((optsJson?.data ?? []) as Record<string, unknown>[])
    .filter((o) => o.is_archived !== true)
    .map((o) => o.title as string)
    .filter(Boolean);

  // v33: BDR asignado (actor-reference) + fecha (active_from). Nombres via workspace members.
  const members = await fetchWorkspaceMembers();
  // v54 (2026-08-18): lista de exclusión del dashboard — AtomChat/Atom (registros propios)
  // estaban taggeados como empresas de evento y sus actividades internas contaban como
  // prospección. Los tags de Attio no se tocan; se saltean acá y todas las vistas quedan
  // limpias porque leen fm_tagged_companies.
  const { data: excl } = await supabase.from("fm_excluded_companies").select("attio_company_id");
  const excluidas = new Set(((excl ?? []) as { attio_company_id: string }[]).map((r) => r.attio_company_id));
  const allRows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const slug of optionSlugs) {
    let offset = 0;
    while (true) {
      const res = await attioPost("/objects/companies/records/query", { limit: 500, offset, filter: { campana_evento: { "$eq": slug } } });
      const records = (res.data ?? []) as Record<string, unknown>[];
      if (!records.length) break;
      for (const c of records) {
        const vals = (c.values ?? {}) as Record<string, unknown[]>;
        const idObj = c.id as Record<string, unknown>;
        const cid = String(idObj?.record_id ?? idObj);
        if (excluidas.has(cid)) continue;
        const key = `${cid}|${slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const bdr = extractActor(vals, "assigned_bdr");
        allRows.push({
          attio_company_id: cid,
          campana_evento: slug,
          company_name: extractVal(vals, "name"),
          outbound_stage: extractVal(vals, "outbound_stage") ?? "",
          // v34: lifecycle para descartar clientes del funnel de Seguimiento (Jose).
          lifecycle_stage: extractVal(vals, "lifecycle_stage"),
          assigned_bdr_id: bdr.id,
          assigned_bdr_name: bdr.id ? (members.get(bdr.id) ?? bdr.id) : null,
          bdr_assigned_at: bdr.since,
          synced_at: new Date().toISOString(),
        });
      }
      if (records.length < 500) break;
      offset += 500;
    }
  }
  // Reemplazo total: borro todo y reinserto el set fresco (ventana vacia de ms; ok para dashboard interno).
  await supabase.from("fm_tagged_companies").delete().neq("attio_company_id", "");
  let upserted = 0;
  for (let i = 0; i < allRows.length; i += 100) {
    const { error } = await supabase.from("fm_tagged_companies").upsert(allRows.slice(i, i + 100), { onConflict: "attio_company_id,campana_evento" });
    if (error) console.error(`Upsert tagged_companies i=${i}:`, error);
    else upserted += allRows.slice(i, i + 100).length;
  }
  return { options: optionSlugs.length, rows: allRows.length, upserted };
}

async function refreshDeals(offset = 0, limit = 200) {
  const { data: rows } = await supabase.from("fm_attio_deals").select("attio_deal_id").order("attio_deal_id");
  if (!rows?.length) return { total: 0, processed: 0, updated: 0, errors: 0, next_offset: null };
  const total = rows.length;
  const batch = rows.slice(offset, offset + limit).map(r => r.attio_deal_id as string);
  let updated = 0, errors = 0;
  const updates: Array<Record<string, unknown>> = [];
  for (let i = 0; i < batch.length; i += 8) {
    const group = batch.slice(i, i + 8);
    const results = await Promise.all(group.map(async (deal_id): Promise<Record<string, unknown> | null> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/deals/records/${deal_id}`, { headers: attioHeaders });
        if (!r.ok) return null;
        const j = await r.json();
        return dealRowFromValues(j?.data?.id as Record<string, unknown>, (j?.data?.values ?? {}) as Record<string, unknown[]>);
      } catch { return null; }
    }));
    for (const row of results) { if (row) updates.push(row); else errors++; }
  }
  for (let i = 0; i < updates.length; i += 100) {
    const { error } = await supabase.from("fm_attio_deals").upsert(updates.slice(i, i + 100), { onConflict: "attio_deal_id" });
    if (error) { console.error(`Upsert refresh i=${i}:`, error); errors++; } else { updated += updates.slice(i, i + 100).length; }
  }
  const nextOffset = offset + batch.length >= total ? null : offset + batch.length;
  return { total, processed: batch.length, updated, errors, next_offset: nextOffset };
}

async function syncPartners(offset = 0, limit = 300) {
  const { data: rows } = await supabase.from("fm_attio_companies").select("attio_company_id");
  if (!rows?.length) return { total: 0, processed: 0, with_partner: 0, updated: 0, next_offset: null };
  const uniqueIds = [...new Set(rows.map((r) => r.attio_company_id as string))];
  const total = uniqueIds.length;
  const batch = uniqueIds.slice(offset, offset + limit);
  const companyToPartner = new Map<string, string | null>();
  const partnerIds = new Set<string>();
  for (let i = 0; i < batch.length; i += 8) {
    const group = batch.slice(i, i + 8);
    const results = await Promise.all(group.map(async (cid): Promise<[string, string | null]> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/companies/records/${cid}`, { headers: attioHeaders });
        if (!r.ok) return [cid, null];
        const j = await r.json();
        const vals = (j.data?.values ?? {}) as Record<string, unknown[]>;
        const ref = vals.partner_name?.[0] as Record<string, unknown> | undefined;
        return [cid, (ref?.target_record_id as string) ?? null];
      } catch { return [cid, null]; }
    }));
    for (const [cid, pid] of results) { companyToPartner.set(cid, pid); if (pid) partnerIds.add(pid); }
  }
  const partnerNames = new Map<string, string | null>();
  const pidArr = [...partnerIds];
  for (let i = 0; i < pidArr.length; i += 8) {
    const group = pidArr.slice(i, i + 8);
    const results = await Promise.all(group.map(async (pid): Promise<[string, string | null]> => {
      try {
        const r = await fetch(`${ATTIO_BASE}/objects/companies/records/${pid}`, { headers: attioHeaders });
        if (!r.ok) return [pid, null];
        const j = await r.json();
        return [pid, extractVal((j.data?.values ?? {}) as Record<string, unknown[]>, "name")];
      } catch { return [pid, null]; }
    }));
    for (const [pid, name] of results) partnerNames.set(pid, name);
  }
  const updates = [...companyToPartner.entries()].map(([cid, pid]) => ({ company_id: cid, partner_id: pid, partner_text: pid ? (partnerNames.get(pid) ?? null) : null }));
  const { error } = await supabase.rpc("apply_partner_asociado", { payload: updates });
  if (error) throw new Error(`RPC apply_partner_asociado: ${error.message}`);
  const withPartner = updates.filter((u) => u.partner_id).length;
  const nextOffset = offset + batch.length >= total ? null : offset + batch.length;
  return { total, processed: batch.length, with_partner: withPartner, updated: updates.length, next_offset: nextOffset };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const phase = url.searchParams.get("phase") ?? "all";
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 300);
  const since = url.searchParams.get("since");
  try {
    // v35: reasignación en bulk del BDR (escritura a Attio). Solo POST + key privilegiada.
    if (phase === "reassign") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ success: false, error: "method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
      }
      const adminKey = req.headers.get("x-admin-key");
      if (!(await isPrivilegedKey(adminKey))) {
        return new Response(JSON.stringify({ success: false, error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const body = await req.json().catch(() => null) as { company_ids?: unknown; bdr_id?: unknown } | null;
      const ids = Array.isArray(body?.company_ids) ? (body!.company_ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : [];
      const bdrId = typeof body?.bdr_id === "string" ? body.bdr_id : null;
      if (!ids.length || !bdrId) {
        return new Response(JSON.stringify({ success: false, error: "company_ids y bdr_id requeridos" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const result = await reassignBdr(ids, bdrId);
      return new Response(JSON.stringify({ success: true, phase, ...result, synced_at: new Date().toISOString() }), { headers: { "Content-Type": "application/json" } });
    }

    // v48: descarte en bulk desde el dashboard. Solo POST + key privilegiada.
    if (phase === "descartar") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ success: false, error: "method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
      }
      const adminKey = req.headers.get("x-admin-key");
      if (!(await isPrivilegedKey(adminKey))) {
        return new Response(JSON.stringify({ success: false, error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const body = await req.json().catch(() => null) as { company_ids?: unknown } | null;
      const ids = Array.isArray(body?.company_ids) ? (body!.company_ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : [];
      if (!ids.length) {
        return new Response(JSON.stringify({ success: false, error: "company_ids requeridos" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const result = await descartarCompanies(ids);
      return new Response(JSON.stringify({ success: true, phase, ...result, synced_at: new Date().toISOString() }), { headers: { "Content-Type": "application/json" } });
    }

    // v55: atribuir campana_evento a deals desde la cola de revisión. Solo POST + key privilegiada.
    if (phase === "atribuir") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ success: false, error: "method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
      }
      const adminKey = req.headers.get("x-admin-key");
      if (!(await isPrivilegedKey(adminKey))) {
        return new Response(JSON.stringify({ success: false, error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const body = await req.json().catch(() => null) as { deal_ids?: unknown; slug?: unknown } | null;
      const ids = Array.isArray(body?.deal_ids) ? (body!.deal_ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : [];
      const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
      if (!ids.length || !slug) {
        return new Response(JSON.stringify({ success: false, error: "deal_ids y slug requeridos" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const result = await atribuirDeals(ids, slug);
      return new Response(JSON.stringify({ success: true, phase, ...result, synced_at: new Date().toISOString() }), { headers: { "Content-Type": "application/json" } });
    }

    const result: Record<string, unknown> = {};
    if (phase === "1" || phase === "all") result.list_entries = await syncListEntries();
    if (phase === "2" || phase === "all") result.enriched_companies = await enrichCompanies();
    if (phase === "2b" || phase === "refresh_companies") result.refreshed_companies = await refreshCompanies(offset, Number(url.searchParams.get("limit") ?? 400));
    if (phase === "3" || phase === "all") result.deals = await syncDeals(since);
    if (phase === "3b" || phase === "refresh") result.refresh = await refreshDeals(offset, Number(url.searchParams.get("limit") ?? 200));
    if (phase === "tagged" || phase === "all") result.tagged = await syncTaggedDeals();
    // texto y origen NO corren dentro de tagged: el botón Sync del dashboard llama
    // phase=tagged y sumarle ~40s lo empuja al timeout del gateway (pasó el 2026-08-18).
    // Las tres las dispara el cron horario fm-sync-deals (fm_cron_sync_deals) por separado.
    if (phase === "texto" || phase === "all") result.texto = await syncTextoDeals();
    if (phase === "origen" || phase === "all") result.origen = await syncOrigenDeals();
    // v58: refresca los deals de la cola de revisión (José 2026-08-20: mostraba Lost viejos).
    if (phase === "refresh_cola") result.refresh_cola = await refreshColaSinAtribuir();
    // v56: whatan NO corre en "all" a propósito — "all" lo dispara el botón Sync y el scan
    // de notas le sumaría requests; tiene su propio cron (fm-whatan-sync). Sin ?offset
    // explícito arranca del cursor guardado (whatan_sync_state.last_offset).
    if (phase === "whatan") result.whatan = await syncWhatanNotes(url.searchParams.has("offset") ? offset : -1, Number(url.searchParams.get("pages") ?? 20));
    if (phase === "tc" || phase === "tagged_companies" || phase === "all") result.tagged_companies = await syncTaggedCompanies();
    if (phase === "tp" || phase === "third_party" || phase === "all") result.third_party_people = await syncThirdPartyPeople();
    if (phase === "4" || phase === "partners" || phase === "all") result.partners = await syncPartners(offset, limit);
    return new Response(JSON.stringify({ success: true, phase, offset, limit, since, ...result, synced_at: new Date().toISOString() }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
