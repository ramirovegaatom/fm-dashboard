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
//
// v3 (2026-08-12, Ramiro): VENTANA DE EVENTOS ELEGIBLES (ver eventoElegible). Dos cosas que
// habrían salido mal al encender los crons: (a) faseAvisos no filtraba eventos pasados y
// habría mandado DMs de eventos ya sucedidos, y (b) la política de arranque de Camilo no se
// podía implementar sembrando fm_slack_notifications, porque eso silencia el aviso pero
// arma el pedido de status 7 días después. Se resuelve con un corte por FECHA DE EVENTO.
//
// v4 (2026-08-13, Ramiro): BLOQUES POR CERCANÍA (ver BLOQUES). El digest de v2 mandaba un
// solo mensaje por persona ordenado por fecha, así que "el evento es mañana" y "el evento es
// en 21 días" pedían lo mismo con el mismo tono. Ahora cada horizonte sale como un DM aparte
// (esta semana / la que viene / en dos / más adelante) y los eventos lejanos además se
// preguntan más espaciado.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SLACK_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";

// Política de arranque (1:1 Camilo 2026-08-10): "los DMs arrancan desde la semana del 18,
// nada retroactivo — ni los eventos anteriores ni los de la semana del 12". El corte va por
// FECHA DE EVENTO (no por fecha_aviso): un evento del 18 en adelante entra completo, con
// todos sus accionables; los eventos anteriores no reciben nada nunca, ni aviso ni status.
// Editable por env var sin redeploy (FM_BOT_CUTOVER=YYYY-MM-DD).
//
// ⚠️ Por qué NO se sembró fm_slack_notifications para silenciar el backlog: faseStatus elige
// por "última notificación registrada", así que el seed habría re-armado el pedido de status
// a los 7 días y a Tincho le llegaba igual el digest de 12 eventos que se quiso evitar.
const CUTOVER_EVENTOS = Deno.env.get("FM_BOT_CUTOVER") ?? "2026-08-18";

// Días de gracia DESPUÉS del evento en los que el evento sigue en el circuito. Hace falta
// porque post_listas tiene dias_antes = -1: su fecha_aviso cae el día DESPUÉS del evento, y
// con un corte seco en "fecha >= hoy" ese accionable no se avisaría nunca.
const GRACIA_POST_EVENTO_DIAS = 14;

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

function diasHasta(iso: string): number {
  return Math.round((new Date(iso + "T12:00:00Z").getTime() - new Date(hoy() + "T12:00:00Z").getTime()) / 86_400_000);
}

// Cuántos días faltan para el evento, en texto corto y humano.
function urgencia(iso: string): string {
  const dias = diasHasta(iso);
  if (dias < 0) return `fue hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "es HOY";
  if (dias === 1) return "es MAÑANA";
  return `en ${dias} días`;
}

// BLOQUES POR CERCANÍA (pedido Ramiro 2026-08-13). Antes cada persona recibía UN mensaje con
// todos sus accionables ordenados por fecha: al mismo nivel "el evento es mañana" y "el
// evento es en 21 días". Ahora cada horizonte sale como un DM aparte, con su encabezado y su
// tono. Se mandan del más lejano al más urgente, para que el que quede arriba de todo en
// Slack (el último) sea el que corre.
//
// frecuenciaMin = piso de días entre pedidos de status para ese horizonte. Solo puede ESPACIAR
// respecto de fm_accionables_template.frecuencia_status_dias (7), nunca apretar: un evento a
// 6 semanas no necesita que le pregunten todas las semanas. Para volver al comportamiento
// anterior, poner los cuatro frecuenciaMin en 0.
type Bloque = {
  clave: string;
  orden: number;
  emoji: string;
  titulo: string;
  nota: string;
  frecuenciaMin: number;
};

const BLOQUES: Bloque[] = [
  { clave: "esta_semana", orden: 0, emoji: ":red_circle:", titulo: "Esta semana", nota: "Esto es lo que corre.", frecuenciaMin: 0 },
  { clave: "semana_que_viene", orden: 1, emoji: ":large_orange_circle:", titulo: "La semana que viene", nota: "Entra en zona de preparación.", frecuenciaMin: 0 },
  { clave: "en_dos_semanas", orden: 2, emoji: ":large_yellow_circle:", titulo: "En dos semanas", nota: "Buen momento para arrancar.", frecuenciaMin: 10 },
  { clave: "mas_adelante", orden: 3, emoji: ":white_circle:", titulo: "Más adelante", nota: "Sin apuro: es para tenerlo en el radar.", frecuenciaMin: 14 },
];

function bloqueDe(fechaEvento: string): Bloque {
  const semana = Math.floor(Math.max(diasHasta(fechaEvento), 0) / 7);
  return BLOQUES[Math.min(semana, BLOQUES.length - 1)];
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

function isoMenosDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// Único lugar donde se decide si un evento entra al circuito de DMs. Lo usan avisos y status
// para que nadie reciba un pedido de status de algo que nunca se le avisó (y al revés).
function eventoElegible(a: Accionable): boolean {
  const e = a.fm_upcoming_events;
  if (e.estado === "Cancelado") return false;
  if (e.fecha < CUTOVER_EVENTOS) return false; // política de arranque, ver arriba
  if (e.fecha < isoMenosDias(hoy(), GRACIA_POST_EVENTO_DIAS)) return false; // evento viejo
  return true;
}

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

// Claves de accionables condicionales (pauta, contenido): son los únicos que pueden "no
// aplicar" a un evento. El resto es obligatorio siempre.
async function clavesCondicionales(): Promise<Set<string>> {
  const { data } = await supabase.from("fm_accionables_template").select("clave, condicional");
  return new Set(((data ?? []) as { clave: string; condicional: boolean }[])
    .filter((t) => t.condicional).map((t) => t.clave));
}

function selectAvance(a: Accionable, condicional: boolean) {
  const opciones = Array.from({ length: 11 }, (_, i) => i * 10).map((v) => ({
    text: { type: "plain_text", text: v === 100 ? "✅ 100% — listo" : `${v}%` },
    value: `${a.id}|${v}`,
  }));
  // En Slack los usuarios NO pueden escribirle al bot (mensajes deshabilitados en la app),
  // así que "no aplica" tiene que resolverse desde el propio desplegable. 2026-08-07.
  if (condicional) {
    opciones.push({
      text: { type: "plain_text", text: "🚫 No aplica a este evento" },
      value: `${a.id}|na`,
    });
  }
  return {
    type: "static_select",
    action_id: "fm_progreso",
    placeholder: { type: "plain_text", text: a.progreso > 0 ? `${a.progreso}%` : "Marcá tu avance" },
    options: opciones,
  };
}

// Digest de UNA persona: encabezado + sus accionables agrupados por evento, cada uno con
// su desplegable. Devuelve varios mensajes si no entra en el límite de bloques de Slack.
function armarDigest(items: Accionable[], intro: string, condicionales: Set<string>): { text: string; blocks: unknown[] }[] {
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
        accessory: selectAvance(a, condicionales.has(a.template_clave ?? "")),
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
      text: `${bloqueDe(items[0].fm_upcoming_events.fecha).titulo}: ${items.length} accionable${items.length === 1 ? "" : "s"} de eventos`,
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
  const candidatos = ((data ?? []) as Accionable[]).filter(eventoElegible);
  const { data: enviados } = await supabase
    .from("fm_slack_notifications")
    .select("accionable_id")
    .eq("tipo", "aviso_evento");
  const ya = new Set((enviados ?? []).map((n: { accionable_id: string }) => n.accionable_id));
  return candidatos.filter((a) => !ya.has(a.id));
}

// Texto de encabezado. NO invita a responderle al bot: en Slack los mensajes a la app están
// deshabilitados (2026-08-07). La salida para "no aplica" es la opción del desplegable, y
// para todo lo demás está el link al dashboard que va al pie del digest.
function introDigest(items: Accionable[], condicionales: Set<string>, tipo: "aviso" | "status", bloque: Bloque) {
  const n = items.length;
  const plural = n === 1 ? "" : "s";
  const tieneCondicionales = items.some((a) => condicionales.has(a.template_clave ?? ""));
  const notaCond = tieneCondicionales
    ? " Si alguno no corresponde a ese evento, elegí *🚫 No aplica* y no te lo vuelvo a pedir."
    : "";
  const accion = tipo === "aviso"
    ? "Marcá tu avance en cada uno con el desplegable."
    : "Actualizá el avance con el desplegable — así el equipo ve el estado real sin tener que preguntarte.";
  return `${bloque.emoji} *${bloque.titulo}* · ${n} accionable${plural}\n${bloque.nota} ${accion}${notaCond}`;
}

// Manda a UNA persona sus accionables, partidos en un DM por bloque de cercanía. Devuelve
// ok=false si falló algún envío. `enviar` se inyecta para que el preview redirija todo al
// mismo destinatario sin duplicar la lógica de armado.
async function enviarPorBloque(
  items: Accionable[],
  condicionales: Set<string>,
  tipo: "aviso" | "status",
  enviar: (text: string, blocks: unknown[]) => Promise<{ ok: boolean; detalle: string | null }>
): Promise<{ ok: boolean; detalle: string | null; mensajes: number }> {
  const porBloque = new Map<string, { bloque: Bloque; items: Accionable[] }>();
  for (const a of items) {
    const b = bloqueDe(a.fm_upcoming_events.fecha);
    const slot = porBloque.get(b.clave) ?? { bloque: b, items: [] };
    slot.items.push(a);
    porBloque.set(b.clave, slot);
  }

  // Del más lejano al más urgente: en Slack el último mensaje queda arriba de todo.
  const ordenados = [...porBloque.values()].sort((x, y) => y.bloque.orden - x.bloque.orden);

  let ok = true;
  let detalle: string | null = null;
  let mensajes = 0;
  for (const { bloque, items: delBloque } of ordenados) {
    for (const m of armarDigest(delBloque, introDigest(delBloque, condicionales, tipo, bloque), condicionales)) {
      const r = await enviar(m.text, m.blocks);
      mensajes++;
      if (!r.ok) { ok = false; detalle = r.detalle; }
    }
  }
  return { ok, detalle, mensajes };
}

// Aviso inicial: UN digest por persona con todos sus accionables nuevos.
async function faseAvisos() {
  const pendientes = await pendientesDeAviso();
  const grupos = porDestinatario(pendientes);
  const condicionales = await clavesCondicionales();

  if (!SLACK_TOKEN) {
    return { fase: "avisos", enviados: 0, personas: grupos.size, accionables: pendientes.length, nota: "SLACK_BOT_TOKEN no configurado" };
  }

  // Un accionable puede tener 2 destinatarios: se registra una sola vez, ok = todos ok.
  const resultado = new Map<string, { ok: boolean; detalle: string | null }>();
  for (const [slackId, items] of grupos) {
    const { ok: okPersona, detalle } = await enviarPorBloque(
      items, condicionales, "aviso", (text, blocks) => slackPost(slackId, text, blocks)
    );
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
    cutover: CUTOVER_EVENTOS,
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
  // El callback devolvía un array y no una tupla, así que el Map quedaba tipado como
  // Map<{}, {}> y frec.get() no era un number. Sin efecto en runtime (esbuild borra los
  // tipos), pero rompía el chequeo al usarlo en un Math.max.
  const frec = new Map<string, number>(
    ((templates ?? []) as { clave: string; frecuencia_status_dias: number }[])
      .map((t) => [t.clave, t.frecuencia_status_dias] as [string, number])
  );

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
  // Misma ventana que los avisos: antes acá había un `fecha >= hoy()` propio que dejaba
  // afuera a post_listas (avisa el día después del evento). Ahora manda eventoElegible.
  const candidatos = ((data ?? []) as Accionable[]).filter(eventoElegible);

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
    // La frecuencia del template es el piso; los eventos lejanos se espacian (ver BLOQUES).
    const cada = Math.max(frec.get(a.template_clave ?? "") ?? 7, bloqueDe(a.fm_upcoming_events.fecha).frecuenciaMin);
    return dias >= cada;
  });

  const grupos = porDestinatario(pendientes);
  const condicionales = await clavesCondicionales();
  if (!SLACK_TOKEN) {
    return { fase: "status", enviados: 0, personas: grupos.size, accionables: pendientes.length, nota: "SLACK_BOT_TOKEN no configurado" };
  }

  const resultado = new Map<string, { ok: boolean; detalle: string | null }>();
  for (const [slackId, items] of grupos) {
    const { ok: okPersona, detalle } = await enviarPorBloque(
      items, condicionales, "status", (text, blocks) => slackPost(slackId, text, blocks)
    );
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
    cutover: CUTOVER_EVENTOS,
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
  const condicionales = await clavesCondicionales();

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
        text: `:mag: *PREVIEW — así arrancarían los avisos*\nAbajo va, uno por uno, el mensaje que recibiría cada persona. *Nadie más recibe nada*: todo esto te llega solo a vos y no queda registrado como enviado.\n\nSolo entran eventos con fecha *>= ${CUTOVER_EVENTOS}* (política de arranque: nada retroactivo).\n\n*${grupos.size} personas · ${pendientes.length} accionables:*\n${resumen}\n\n:warning: Los desplegables son reales: si tocás uno, se actualiza el avance de ese accionable en el dashboard.`,
      },
    }]
  );

  const enviados: { slack_id: string; responsable: string | null; accionables: number; mensajes: number; ok: boolean }[] = [];
  for (const [slackId, items] of grupos) {
    const bloques = new Set(items.map((a) => bloqueDe(a.fm_upcoming_events.fecha).titulo));
    await slackPost(target, "Preview", [{
      type: "context",
      elements: [{ type: "mrkdwn", text: `:arrow_down: *Esto le llegaría a <@${slackId}>* (${items[0].responsable ?? "?"}) — ${items.length} accionables en ${bloques.size} bloque${bloques.size === 1 ? "" : "s"}: ${[...bloques].join(" · ")}` }],
    }]);
    const r = await enviarPorBloque(items, condicionales, "aviso", (text, blocks) => slackPost(target, text, blocks));
    enviados.push({ slack_id: slackId, responsable: items[0].responsable, accionables: items.length, mensajes: r.mensajes, ok: r.ok });
  }
  return { ok: true, fase: "preview", cutover: CUTOVER_EVENTOS, target, personas: grupos.size, accionables: pendientes.length, detalle: enviados };
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
