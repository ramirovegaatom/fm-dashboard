import { supabase } from "@/lib/supabase";

const SYNC_URL = "https://xwjjvocsnznikeyeqioc.supabase.co/functions/v1/fm-attio-sync";
const DEFAULT_LOOKBACK_DAYS = 60;

export const maxDuration = 120;

async function getDealsSince(): Promise<string> {
  const { data } = await supabase
    .from("fm_attio_deals")
    .select("created_at_attio")
    .order("created_at_attio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.created_at_attio) {
    return new Date(data.created_at_attio as string).toISOString();
  }
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  return fallback.toISOString();
}

export async function POST() {
  const since = await getDealsSince();

  // phase=tagged trae deals con campana_evento mapeado en fm_event_mapping
  // (aunque su empresa no esté en la list events_companies). Jose 2026-05-27.
  const [r1, r3, rt, rtp] = await Promise.all([
    fetch(`${SYNC_URL}?phase=1`),
    fetch(`${SYNC_URL}?phase=3&since=${encodeURIComponent(since)}`),
    fetch(`${SYNC_URL}?phase=tagged`),
    fetch(`${SYNC_URL}?phase=tp`), // personas third-party (Origen de invitación = Thirdparty)
  ]);

  if (!r1.ok || !r3.ok || !rt.ok || !rtp.ok) {
    const [t1, t3, tt, ttp] = await Promise.all([
      r1.text().catch(() => ""),
      r3.text().catch(() => ""),
      rt.text().catch(() => ""),
      rtp.text().catch(() => ""),
    ]);
    return Response.json(
      {
        error: "Sync failed",
        phase1: { status: r1.status, body: t1.slice(0, 300) },
        phase3: { status: r3.status, body: t3.slice(0, 300), since },
        tagged: { status: rt.status, body: tt.slice(0, 300) },
        third_party: { status: rtp.status, body: ttp.slice(0, 300) },
      },
      { status: 502 }
    );
  }

  const [d1, d3, dt, dtp] = await Promise.all([r1.json(), r3.json(), rt.json(), rtp.json()]);

  // v27 (2026-07-06): refrescar outbound_stage/qm_type de empresas EXISTENTES.
  // Antes enrichCompanies solo tocaba empresas nuevas (company_name null) → cuando
  // Jose movía una empresa a QM SHOW en Attio, el dashboard nunca lo reflejaba.
  // Loop paginado (phase=2b) con guarda de tiempo para no exceder maxDuration;
  // los updates son idempotentes, si queda a medias se completa en el próximo Sync.
  const refreshStart = Date.now();
  let companyOffset = 0;
  let companiesRefreshed = 0;
  let companiesRefreshComplete = false;
  while (Date.now() - refreshStart < 80_000) {
    const rr = await fetch(`${SYNC_URL}?phase=2b&offset=${companyOffset}&limit=200`);
    if (!rr.ok) break;
    const jr = await rr.json();
    const rc = jr.refreshed_companies ?? {};
    companiesRefreshed += rc.updated ?? 0;
    if (rc.next_offset == null) {
      companiesRefreshComplete = true;
      break;
    }
    companyOffset = rc.next_offset;
  }

  return Response.json({
    list_entries: d1.list_entries ?? 0,
    deals: d3.deals ?? 0,
    tagged: dt.tagged ?? 0,
    third_party_people: dtp.third_party_people ?? 0,
    companies_refreshed: companiesRefreshed,
    companies_refresh_complete: companiesRefreshComplete,
    since,
  });
}
