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

  // Nota: el refresh de outbound_stage/qm_type de empresas existentes (phase=2b) NO se
  // corre acá — hacerlo sincrónicamente excedía el maxDuration de Vercel y daba 504.
  // Lo cubre el cron `fm-refresh-companies` (pg_cron, cada 10 min). El botón solo corre
  // las fases livianas: list entries (1), deals nuevos (3), tagueados (tagged) y personas
  // third-party (tp).
  return Response.json({
    list_entries: d1.list_entries ?? 0,
    deals: d3.deals ?? 0,
    tagged: dt.tagged ?? 0,
    third_party_people: dtp.third_party_people ?? 0,
    since,
  });
}
