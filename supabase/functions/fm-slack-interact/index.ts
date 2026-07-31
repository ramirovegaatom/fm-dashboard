// FM Events Calendar — endpoint de interactividad de Slack (Fase 3).
// Recibe los clicks del select de avance (action_id: fm_progreso, value "accionableId|pct")
// y actualiza fm_event_accionables + historial. Auth propia: verifica la FIRMA de Slack
// (x-slack-signature con SLACK_SIGNING_SECRET) — por eso verify_jwt va deshabilitado,
// Slack no manda JWT de Supabase. Sin SLACK_SIGNING_SECRET responde 503 (inerte).
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";

async function verifySlack(req: Request, body: string): Promise<boolean> {
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // anti-replay
  const base = `v0:${ts}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `v0=${hex}`;
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  if (!SIGNING_SECRET) return new Response("SLACK_SIGNING_SECRET no configurado", { status: 503 });

  const body = await req.text();
  if (!(await verifySlack(req, body))) return new Response("firma inválida", { status: 401 });

  // Slack manda application/x-www-form-urlencoded con payload=<json>
  const params = new URLSearchParams(body);
  const payload = JSON.parse(params.get("payload") ?? "{}");

  if (payload.type === "block_actions") {
    const action = (payload.actions ?? []).find((a: { action_id: string }) => a.action_id === "fm_progreso");
    if (action) {
      const [accionableId, pctStr] = String(action.selected_option?.value ?? "").split("|");
      const progreso = Number(pctStr);
      const autor = payload.user?.username ?? payload.user?.id ?? "slack";
      if (accionableId && progreso >= 0 && progreso <= 100) {
        await supabase.from("fm_event_accionables").update({
          progreso,
          ultimo_update_at: new Date().toISOString(),
          ultimo_update_por: autor,
        }).eq("id", accionableId);
        await supabase.from("fm_accionable_updates").insert({
          accionable_id: accionableId, progreso, fuente: "slack_boton", autor,
        });
        // Confirmación visible en el mensaje original.
        if (payload.response_url) {
          await fetch(payload.response_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              replace_original: false,
              text: progreso === 100
                ? `✅ Registrado: accionable completado. ¡Gracias!`
                : `📊 Registrado: ${progreso}% de avance. ¡Gracias!`,
            }),
          });
        }
      }
    }
  }
  return new Response("", { status: 200 });
});
