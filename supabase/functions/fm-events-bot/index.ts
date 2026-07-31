// FM Events Calendar — bot de recordatorios (Fase 3).
// ?phase=avisos  → manda el aviso "evento en X semanas + tus accionables" a cada responsable
//                  cuando llega la fecha_aviso de su accionable.
// ?phase=status  → pide update de avance (select 0-100%) a los accionables en curso, cada
//                  frecuencia_status_dias. La respuesta la procesa fm-slack-interact.
// Inerte sin SLACK_BOT_TOKEN: reporta qué mandaría sin loggear (así se envía cuando haya token).
// Los responsables se resuelven por fm_event_accionables.slack_user_id (a completar cuando
// el equipo confirme sus IDs de Slack).
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SLACK_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";

async function slackPost(channel: string, text: string, blocks?: unknown[]) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SLACK_TOKEN}` },
    body: JSON.stringify({ channel, text, blocks }),
  });
  const json = await res.json();
  return { ok: !!json.ok, detalle: json.ok ? null : JSON.stringify(json.error) };
}

function fmtFecha(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-AR", { day: "2-digit", month: "long", timeZone: "UTC" });
}

type Accionable = {
  id: string; event_id: string; template_clave: string | null; nombre: string;
  responsable: string | null; slack_user_id: string | null; fecha_aviso: string | null;
  aplica: boolean | null; progreso: number;
  fm_upcoming_events: {
    nombre: string; fecha: string; industria: string | null; territorio: string | null;
    pais: string | null; ciudad: string | null; estado: string;
  };
};

const hoy = () => new Date().toISOString().slice(0, 10);

// Aviso inicial: accionables cuya fecha_aviso ya llegó, de eventos vigentes, sin aviso previo.
async function faseAvisos() {
  const { data } = await supabase
    .from("fm_event_accionables")
    .select("*, fm_upcoming_events!inner(nombre, fecha, industria, territorio, pais, ciudad, estado)")
    .lte("fecha_aviso", hoy())
    .neq("aplica", false)
    .lt("progreso", 100);
  const candidatos = ((data ?? []) as Accionable[]).filter(
    (a) => a.fm_upcoming_events.estado !== "Cancelado"
  );

  const { data: enviados } = await supabase
    .from("fm_slack_notifications")
    .select("accionable_id")
    .eq("tipo", "aviso_evento");
  const ya = new Set((enviados ?? []).map((n: { accionable_id: string }) => n.accionable_id));
  const pendientes = candidatos.filter((a) => !ya.has(a.id));

  if (!SLACK_TOKEN) {
    return { fase: "avisos", enviados: 0, pendientes: pendientes.length, nota: "SLACK_BOT_TOKEN no configurado" };
  }

  let enviadosOk = 0;
  for (const a of pendientes) {
    if (!a.slack_user_id) {
      await supabase.from("fm_slack_notifications").insert({
        event_id: a.event_id, accionable_id: a.id, tipo: "aviso_evento",
        destinatario: a.responsable, ok: false, detalle: "sin slack_user_id",
      });
      continue;
    }
    const e = a.fm_upcoming_events;
    const lugar = [e.ciudad, e.pais].filter(Boolean).join(", ") || "online";
    const texto =
      `:calendar: *Se acerca un evento y tenés un accionable*\n` +
      `*${e.nombre}* — ${fmtFecha(e.fecha)} · ${e.industria ?? "multisector"} · ${e.territorio ?? ""} (${lugar})\n\n` +
      `Tu accionable: *${a.nombre}*\n` +
      `Cuando avances, actualizá el estado desde el mensaje de seguimiento o en el dashboard.`;
    const r = await slackPost(a.slack_user_id, texto);
    await supabase.from("fm_slack_notifications").insert({
      event_id: a.event_id, accionable_id: a.id, tipo: "aviso_evento",
      destinatario: a.responsable, ok: r.ok, detalle: r.detalle,
    });
    if (r.ok) enviadosOk++;
  }
  return { fase: "avisos", enviados: enviadosOk, pendientes: pendientes.length };
}

// Pedido de status: accionables ya avisados, en curso, cuyo último pedido fue hace >= frecuencia días.
async function faseStatus() {
  const { data: templates } = await supabase.from("fm_accionables_template").select("clave, frecuencia_status_dias");
  const frec = new Map((templates ?? []).map((t: { clave: string; frecuencia_status_dias: number }) => [t.clave, t.frecuencia_status_dias]));

  const { data } = await supabase
    .from("fm_event_accionables")
    .select("*, fm_upcoming_events!inner(nombre, fecha, industria, territorio, pais, ciudad, estado)")
    .lte("fecha_aviso", hoy())
    .neq("aplica", false)
    .lt("progreso", 100);
  const candidatos = ((data ?? []) as Accionable[]).filter(
    (a) => a.fm_upcoming_events.estado !== "Cancelado" && a.fm_upcoming_events.fecha >= hoy()
  );

  const { data: pedidos } = await supabase
    .from("fm_slack_notifications")
    .select("accionable_id, enviado_at, tipo")
    .in("tipo", ["aviso_evento", "pedido_status"])
    .order("enviado_at", { ascending: false });
  const ultimo = new Map<string, string>();
  for (const p of pedidos ?? []) {
    if (!ultimo.has(p.accionable_id)) ultimo.set(p.accionable_id, p.enviado_at);
  }

  const ahora = Date.now();
  const pendientes = candidatos.filter((a) => {
    const u = ultimo.get(a.id);
    if (!u) return false; // sin aviso inicial todavía → lo cubre faseAvisos
    const dias = (ahora - new Date(u).getTime()) / 86_400_000;
    return dias >= (frec.get(a.template_clave ?? "") ?? 7);
  });

  if (!SLACK_TOKEN) {
    return { fase: "status", enviados: 0, pendientes: pendientes.length, nota: "SLACK_BOT_TOKEN no configurado" };
  }

  let enviadosOk = 0;
  for (const a of pendientes) {
    if (!a.slack_user_id) continue;
    const e = a.fm_upcoming_events;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:bar_chart: *¿Qué tan avanzado vas con tu accionable?*\n*${a.nombre}* — evento *${e.nombre}* (${fmtFecha(e.fecha)})\nÚltimo estado: ${a.progreso}%`,
        },
        accessory: {
          type: "static_select",
          action_id: "fm_progreso",
          placeholder: { type: "plain_text", text: "Elegí tu avance" },
          options: Array.from({ length: 11 }, (_, i) => i * 10).map((v) => ({
            text: { type: "plain_text", text: v === 100 ? "✅ 100% — listo" : `${v}%` },
            value: `${a.id}|${v}`,
          })),
        },
      },
    ];
    const r = await slackPost(a.slack_user_id, `¿Cómo vas con "${a.nombre}" para ${e.nombre}?`, blocks);
    await supabase.from("fm_slack_notifications").insert({
      event_id: a.event_id, accionable_id: a.id, tipo: "pedido_status",
      destinatario: a.responsable, ok: r.ok, detalle: r.detalle,
    });
    if (r.ok) enviadosOk++;
  }
  return { fase: "status", enviados: enviadosOk, pendientes: pendientes.length };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const phase = url.searchParams.get("phase") ?? "avisos";
  try {
    const result = phase === "status" ? await faseStatus() : await faseAvisos();
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
