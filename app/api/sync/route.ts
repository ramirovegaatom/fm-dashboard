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
  //
  // El botón solo corre fases que NO cubre ningún cron: list entries (1), deals nuevos (3)
  // y deals tagueados (tagged) — el caso de uso interactivo de José: taguear un deal en
  // Attio y verlo aparecer. Las fases pesadas quedaron fuera igual que phase=2b en su
  // momento: phase=tc (~96s) y phase=tp (~85s) las corren sus crons cada 30 min
  // (fm-sync-tagged-companies / fm-sync-third-party); en paralelo acá excedían los 120s
  // de maxDuration → 504 (2026-08-03).
  const [r1, r3, rt] = await Promise.all([
    fetch(`${SYNC_URL}?phase=1`),
    fetch(`${SYNC_URL}?phase=3&since=${encodeURIComponent(since)}`),
    fetch(`${SYNC_URL}?phase=tagged`),
  ]);

  if (!r1.ok || !r3.ok || !rt.ok) {
    const [t1, t3, tt] = await Promise.all([
      r1.text().catch(() => ""),
      r3.text().catch(() => ""),
      rt.text().catch(() => ""),
    ]);
    return Response.json(
      {
        error: "Sync failed",
        phase1: { status: r1.status, body: t1.slice(0, 300) },
        phase3: { status: r3.status, body: t3.slice(0, 300), since },
        tagged: { status: rt.status, body: tt.slice(0, 300) },
      },
      { status: 502 }
    );
  }

  const [d1, d3, dt] = await Promise.all([r1.json(), r3.json(), rt.json()]);

  return Response.json({
    list_entries: d1.list_entries ?? 0,
    deals: d3.deals ?? 0,
    tagged: dt.tagged ?? 0,
    since,
  });
}
