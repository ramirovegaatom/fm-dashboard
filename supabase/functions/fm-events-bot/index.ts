// FM Events Calendar — bot de recordatorios (Fase 3).
// ?phase=avisos  → manda el aviso "evento en X días + tus accionables" a cada responsable
//                  cuando llega la fecha_aviso de su accionable.
// ?phase=status  → pide update de avance (select 0-100%) a los accionables en curso, cada
//                  frecuencia_status_dias. La respuesta la procesa fm-slack-interact.
// ?phase=preview&user=U… → PRUEBA: arma los mismos digests que mandaría avisos, pero los
//                  manda TODOS a ese usuario y NO registra nada en fm_slack_notifications.
// ?phase=diag    → verifica el token y lista los miembros del workspace (mapear IDs).
// ?phase=test&user=U… → mensaje suelto de prueba.
//
// v2 (2026-08-07, Ramiro): DIGEST. Antes se mandaba 1 DM por accionable — a Martín le
// habrían entrado 12 mensajes de golpe, que parece spam y no un sistema. Ahora se agrupa
// por PERSONA: un solo mensaje con sus accionables ordenados por urgencia y agrupados por
// evento, cada uno con su desplegable de avance. Los value de los selects no cambian
// (`${accionable_id}|${valor}`), así que fm-slack-interact sigue funcionando igual.
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

// Cuántos días faltan para el evento, en texto corto y humano.
function urgencia(iso: string): string {
  const dias = Math.round((new Date(iso + "T12:00:00Z").getTime() - new Date(hoy() + "T12:00:00Z").getTime()) / 86_400_000);
  if (dias < 0) return `fue hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "es HOY";
  if (dias === 1) return "es MAÑANA";
  return `en ${dias} días`;
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

// slack_user_id admite varios destinatarios separados por coma (ej: Jorge y Gustavo).
function destinatarios(ids: string | null): string[] {
  return (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Agrupa accionables por destinatario individual: un accionable con 2 IDs entra en los dos.
// La clave del digest: cada persona recibe UN mensaje con todo lo suyo.
function porDestinatario(accionables: Accionable[]): Map<string, Accionable[]> {
  const map = new Map<string, Accionable[]>();
  for (const a of accionables) {
    for (const d of destinatarios(a.slack_user_id)) {
      const arr = map.get(d) ?? [];
      arr.push(a);
      map.set(d, arr);
    }
  }
  // Dentro de cada persona: primero lo más urgente (evento más cercano).
  for (const arr of map.values()) {
    arr.sort((x, y) => x.fm_upcoming_events.fecha.localeCompare(y.fm_upcoming_events.fecha));
  }
  return map;
}

function selectAvance(a: Accionable) {
  return {
    type: "static_select",
    action_id: "fm_progreso",
    placeholder: { type: "plain_text", text: a.progreso > 0 ? `${a.progreso}%` : "Marcá tu avance" },
    options: Array.from({ length: 11 }, (_, i) => i * 10).map((v) => ({
      text: { type: "plain_text", text: v === 100 ? "✅ 100% — listo" : `${v}%` },
      value: `${a.id}|${v}`,
    })),
  };
}

// Digest de UNA persona: encabezado + sus accionables agrupados por evento, cada uno con
// su desplegable. Devuelve varios mensajes si no entra en el límite de bloques de Slack.
function armarDigest(items: Accionable[], intro: string): { text: string; blocks: unknown[] }[] {
  const eventos = new Map<string, Accionable[]>();
  for (const a of items) {
    const arr = eventos.get(a.event_id) ?? [];
    arr.push(a);
    eventos.set(a.event_id, arr);
  }

  const bloquesEvento: unknown[][] = [];
  for (const arr of eventos.values()) {
    const e = arr[0].fm_upcoming_events;
    const lugar = [e.ciudad, e.pais].filter(Boolean).join(", ") || "online";
    const grupo: unknown[] = [
      { type: "divider" },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `:calendar: *${e.nombre}* · ${fmtFecha(e.fecha)} — *${urgencia(e.fecha)}* · ${lugar}`,
        }],
      },
    ];
    for (const a of arr) {
      grupo.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${a.nombre}*\n_${a.progreso > 0 ? `avance actual: ${a.progreso}%` : "sin arrancar"}_` },
        accessory: selectAvance(a),
      });
    }
    bloquesEvento.push(grupo);
  }

  // Slack corta en 50 bloques por mensaje: partimos por grupos de evento completos.
  const MAX = 40;
  const mensajes: { text: string; blocks: unknown[] }[] = [];
  let actual: unknown[] = [];
  const cabecera = (parte: number, total: number) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: total > 1 ? `${intro}\n_(parte ${parte} de ${total})_` : intro,
    },
  });

  const tandas: unknown[][] = [];
  for (const grupo of bloquesEvento) {
    if (actual.length + grupo.length > MAX && actual.length > 0) {
      tandas.push(actual);
      actual = [];
    }
    actual.push(...grupo);
  }
  if (actual.length) tandas.push(actual);

  tandas.forEach((t, i) => {
    mensajes.push({
      text: `Tenés ${items.length} accionable${items.length === 1 ? "" : "s"} de eventos próximos`,
      blocks: [cabecera(i + 1, tandas.length), ...t, {
        type: "context",
        elements: [{ type: "mrkdwn", text: "También podés actualizar todo desde el dashboard: <https://fm-dashboard-psi.vercel.app/calendario|Calendario de eventos>" }],
      }],
    });
  });
  return mensajes;
}

// Diagnóstico: verifica el token y lista los miembros humanos del workspace (id + nombre)
// para mapear responsables → slack_user_id. No expone el token.
async function faseDiag() {
  if (!SLACK_TOKEN) return { ok: false, nota: "SLACK_BOT_TOKEN no configurado" };
  const auth = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  }).then((r) => r.json());
  if (!auth.ok) return { ok: false, auth_error: auth.error };

  const members: { id: string; name: string; real_name: string }[] = [];
  let cursor = "";
  do {
    const res = await fetch(`https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ""}`, {
      headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
    }).then((r) => r.json());
    if (!res.ok) return { ok: false, users_error: res.error };
    for (const m of res.members ?? []) {
      if (!m.deleted && !m.is_bot && m.id !== "USLACKBOT") {
        members.push({ id: m.id, name: m.name, real_name: m.profile?.real_name ?? "" });
      }
    }
    cursor = res.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return { ok: true, team: auth.team, bot_user: auth.user, miembros: members };
}

// Mensaje de prueba a un usuario puntual (?phase=test&user=U012345).
async function faseTest(userId: string) {
  if (!SLACK_TOKEN) return { ok: false, nota: "SLACK_BOT_TOKEN no configurado" };
  const r = await slackPost(
    userId,
    ":wave: *Prueba del bot de eventos de Field Marketing.*\nSi ves este mensaje, el bot quedó conectado — los avisos de eventos y pedidos de status van a llegar por acá."
  );
  return { ok: r.ok, detalle: r.detalle };
}

// Accionables que hoy corresponde avisar (sin aviso previo registrado).
async function pendientesDeAviso(): Promise<Accionable[]> {
  const { data } = await supabase
    .from("fm_event_accionables")
    .select("*, fm_upcoming_events!inner(nombre, fecha, industria, territorio, pais, ciudad, estado)")
    .lte("fecha_aviso", hoy())
    // BUG encontrado en el preview del 2026-08-07: .neq("aplica", false) traduce a
    // `aplica <> false`, que da NULL para los condicionales sin marcar → quedaban FUERA.
    // Hans (pauta) y Nata (contenido) no habrían recibido nunca su aviso. `not.is.false`
    // incluye NULL y true, que es la intención: el DM sirve para que marquen si aplica.
    .not("aplica", "is", false)
    .lt("progreso", 100);
  const candidatos = ((data ?? []) as Accionable[]).filter(
    (a) => a.fm_upcoming_events.estado !== "Cancelado"
  );
  const { data: enviados } = await supabase
    .from("fm_slack_notifications")
    .select("accionable_id")
    .eq("tipo", "aviso_evento");
  const ya = new Set((enviados ?? []).map((n: { accionable_id: string }) => n.accionable_id));
  return candidatos.filter((a) => !ya.has(a.id));
}

// Aviso inicial: UN digest por persona con todos sus accionables nuevos.
async function faseAvisos() {
  const pendientes = await pendientesDeAviso();
  const grupos = porDestinatario(pendientes);

  if (!SLACK_TOKEN) {
    return { fase: "avisos", enviados: 0, personas: grupos.size, accionables: pendientes.length, nota: "SLACK_BOT_TOKEN no configurado" };
  }

  // Un accionable puede tener 2 destinatarios: se registra una sola vez, ok = todos ok.
  const resultado = new Map<string, { ok: boolean; detalle: string | null }>();
  for (const [slackId, items] of grupos) {
    const intro = `:calendar: *Tenés ${items.length} accionable${items.length === 1 ? "" : "s"} de eventos que se vienen*\nMarcá tu avance en cada uno con el desplegable. Si alguno no aplica a ese evento, avisá por acá.`;
    const mensajes = armarDigest(items, intro);
    let okPersona = true;
    let detalle: string | null = null;
    for (const m of mensajes) {
      const r = await slackPost(slackId, m.text, m.blocks);
      if (!r.ok) { okPersona = false; detalle = r.detalle; }
    }
    for (const a of items) {
      const prev = resultado.get(a.id);
      resultado.set(a.id, { ok: (prev?.ok ?? true) && okPersona, detalle: detalle ?? prev?.detalle ?? null });
    }
  }

  // Los que no tienen ningún destinatario quedan registrados como fallidos (visible en el log).
  for (const a of pendientes) {
    if (destinatarios(a.slack_user_id).length === 0) {
      resultado.set(a.id, { ok: false, detalle: "sin slack_user_id" });
    }
  }

  const filas = [...resultado.entries()].map(([accionable_id, r]) => {
    const a = pendientes.find((x) => x.id === accionable_id)!;
    return {
      event_id: a.event_id, accionable_id, tipo: "aviso_evento",
      destinatario: a.responsable, ok: r.ok, detalle: r.detalle,
    };
  });
  if (filas.length) await supabase.from("fm_slack_notifications").insert(filas);

  return {
    fase: "avisos",
    personas: grupos.size,
    accionables: pendientes.length,
    enviados: filas.filter((f) => f.ok).length,
    fallidos: filas.filter((f) => !f.ok).length,
  };
}

// Pedido de status: accionables ya avisados, en curso, cuyo último pedido fue hace >= frecuencia
// días. También agrupado: un digest por persona.
async function faseStatus() {
  const { data: templates } = await supabase.from("fm_accionables_template").select("clave, frecuencia_status_dias");
  const frec = new Map((templates ?? []).map((t: { clave: string; frecuencia_status_dias: number }) => [t.clave, t.frecuencia_status_dias]));

  const { data } = await supabase
    .from("fm_event_accionables")
    .select("*, fm_upcoming_events!inner(nombre, fecha, industria, territorio, pais, ciudad, estado)")
    .lte("fecha_aviso", hoy())
    // BUG encontrado en el preview del 2026-08-07: .neq("aplica", false) traduce a
    // `aplica <> false`, que da NULL para los condicionales sin marcar → quedaban FUERA.
    // Hans (pauta) y Nata (contenido) no habrían recibido nunca su aviso. `not.is.false`
    // incluye NULL y true, que es la intención: el DM sirve para que marquen si aplica.
    .not("aplica", "is", false)
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

  const grupos = porDestinatario(pendientes);
  if (!SLACK_TOKEN) {
    return { fase: "status", enviados: 0, personas: grupos.size, accionables: pendientes.length, nota: "SLACK_BOT_TOKEN no configurado" };
  }

  const resultado = new Map<string, { ok: boolean; detalle: string | null }>();
  for (const [slackId, items] of grupos) {
    const intro = `:bar_chart: *¿Cómo venís con estos ${items.length} accionable${items.length === 1 ? "" : "s"}?*\nActualizá el avance de cada uno con el desplegable — así el equipo ve el estado real sin tener que preguntarte.`;
    const mensajes = armarDigest(items, intro);
    let okPersona = true;
    let detalle: string | null = null;
    for (const m of mensajes) {
      const r = await slackPost(slackId, m.text, m.blocks);
      if (!r.ok) { okPersona = false; detalle = r.detalle; }
    }
    for (const a of items) {
      const prev = resultado.get(a.id);
      resultado.set(a.id, { ok: (prev?.ok ?? true) && okPersona, detalle: detalle ?? prev?.detalle ?? null });
    }
  }

  const filas = [...resultado.entries()].map(([accionable_id, r]) => {
    const a = pendientes.find((x) => x.id === accionable_id)!;
    return {
      event_id: a.event_id, accionable_id, tipo: "pedido_status",
      destinatario: a.responsable, ok: r.ok, detalle: r.detalle,
    };
  });
  if (filas.length) await supabase.from("fm_slack_notifications").insert(filas);

  return {
    fase: "status",
    personas: grupos.size,
    accionables: pendientes.length,
    enviados: filas.filter((f) => f.ok).length,
    fallidos: filas.filter((f) => !f.ok).length,
  };
}

// PRUEBA (2026-08-07, Ramiro): manda a UNA persona los digests que recibiría cada
// responsable, tal cual saldrían. No registra nada en fm_slack_notifications, así que el
// arranque real queda intacto. Los desplegables SÍ son funcionales (sirve de prueba
// end-to-end): tocarlos actualiza el progreso real de ese accionable.
async function fasePreview(target: string) {
  if (!SLACK_TOKEN) return { ok: false, nota: "SLACK_BOT_TOKEN no configurado" };
  const pendientes = await pendientesDeAviso();
  const grupos = porDestinatario(pendientes);

  const resumen = [...grupos.entries()]
    .map(([id, items]) => `• <@${id}> — ${items.length} accionable${items.length === 1 ? "" : "s"}`)
    .join("\n");
  await slackPost(
    target,
    "Preview de los avisos del bot de eventos",
    [{
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:mag: *PREVIEW — así arrancarían los avisos*\nAbajo va, uno por uno, el mensaje que recibiría cada persona. *Nadie más recibe nada*: todo esto te llega solo a vos y no queda registrado como enviado.\n\n*${grupos.size} personas · ${pendientes.length} accionables:*\n${resumen}\n\n:warning: Los desplegables son reales: si tocás uno, se actualiza el avance de ese accionable en el dashboard.`,
      },
    }]
  );

  const enviados: { slack_id: string; responsable: string | null; accionables: number; mensajes: number; ok: boolean }[] = [];
  for (const [slackId, items] of grupos) {
    const intro = `:calendar: *Tenés ${items.length} accionable${items.length === 1 ? "" : "s"} de eventos que se vienen*\nMarcá tu avance en cada uno con el desplegable. Si alguno no aplica a ese evento, avisá por acá.`;
    const mensajes = armarDigest(items, intro);
    await slackPost(target, "Preview", [{
      type: "context",
      elements: [{ type: "mrkdwn", text: `:arrow_down: *Esto le llegaría a <@${slackId}>* (${items[0].responsable ?? "?"}) — ${mensajes.length} mensaje${mensajes.length === 1 ? "" : "s"}` }],
    }]);
    let ok = true;
    for (const m of mensajes) {
      const r = await slackPost(target, m.text, m.blocks);
      if (!r.ok) ok = false;
    }
    enviados.push({ slack_id: slackId, responsable: items[0].responsable, accionables: items.length, mensajes: mensajes.length, ok });
  }
  return { ok: true, fase: "preview", target, personas: grupos.size, accionables: pendientes.length, detalle: enviados };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const phase = url.searchParams.get("phase") ?? "avisos";
  const user = url.searchParams.get("user") ?? "";
  try {
    let out: unknown;
    if (phase === "diag") out = await faseDiag();
    else if (phase === "test") out = user ? await faseTest(user) : { ok: false, error: "falta ?user=U…" };
    else if (phase === "preview") out = user ? await fasePreview(user) : { ok: false, error: "falta ?user=U…" };
    else if (phase === "status") out = await faseStatus();
    else out = await faseAvisos();
    return new Response(JSON.stringify({ success: true, ...(out as Record<string, unknown>) }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fm-events-bot:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
