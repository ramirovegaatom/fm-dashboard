const SYNC_URL = "https://xwjjvocsnznikeyeqioc.supabase.co/functions/v1/fm-attio-sync";

export async function POST() {
  const [r1, r3] = await Promise.all([
    fetch(`${SYNC_URL}?phase=1`),
    fetch(`${SYNC_URL}?phase=3`),
  ]);

  if (!r1.ok || !r3.ok) {
    return Response.json(
      { error: "Sync failed", phase1: r1.status, phase3: r3.status },
      { status: 502 }
    );
  }

  const [d1, d3] = await Promise.all([r1.json(), r3.json()]);

  return Response.json({
    list_entries: d1.list_entries ?? 0,
    deals: d3.deals ?? 0,
  });
}
