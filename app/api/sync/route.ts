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

  const [r1, r3] = await Promise.all([
    fetch(`${SYNC_URL}?phase=1`),
    fetch(`${SYNC_URL}?phase=3&since=${encodeURIComponent(since)}`),
  ]);

  if (!r1.ok || !r3.ok) {
    const [t1, t3] = await Promise.all([r1.text().catch(() => ""), r3.text().catch(() => "")]);
    return Response.json(
      {
        error: "Sync failed",
        phase1: { status: r1.status, body: t1.slice(0, 300) },
        phase3: { status: r3.status, body: t3.slice(0, 300), since },
      },
      { status: 502 }
    );
  }

  const [d1, d3] = await Promise.all([r1.json(), r3.json()]);

  return Response.json({
    list_entries: d1.list_entries ?? 0,
    deals: d3.deals ?? 0,
    since,
  });
}
