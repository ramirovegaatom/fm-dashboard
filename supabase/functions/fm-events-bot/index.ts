// FM Events Calendar — bot de recordatorios (Fase 3).
// ?phase=avisos  → manda el aviso "evento en X días + tus accionables" a cada responsable
//                  cuando llega la fecha_aviso de su accionable.
// ?phase=status  → pide update de avance (select 0-100%) a los accionables en curso, cada
//                  frecuencia_status_dias. La respuesta la procesa fm-slack-interact.
// ?phase=preview&user=U…[&persona=U…] → PRUEBA: arma los mismos digests que mandaría
//                  avisos, pero los manda TODOS a ese usuario y NO registra nada en
//                  fm_slack_notifications. Con &persona=U… manda solo la tanda de esa
//                  persona, para probar el circuito de respuesta con un mensaje suelto.
// ?phase=asana[&dry=1][&event=<uuid>] → matchea las tareas del proyecto de Asana del
//                  evento contra nuestros accionables y guarda el asana_task_gid. Solo LEE
//                  de Asana. Con &dry=1 muestra el mapeo sin escribir nada.
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
//
// v5 (2026-08-13, Ramiro): ETIQUETA DE COMPARTIDOS (ver compartidoCon). Al sumar a Bruno en
// base_datos, casi todos los accionables de Martín pasaron a tener dos destinatarios con un
// único progreso compartido. Cada accionable multi-destinatario ahora dice con quién se
// comparte, para que no lo hagan dos veces — o ninguno.
//
// v6 (2026-08-13, Ramiro): DATOS DEL EVENTO EN EL DM. Respuesta de Steph: lo primero que
// necesita para arrancar a invitar es el link de registro (Luma) y el partner. No existían
// como campos, así que el bot no los podía mandar. Ahora viajan en el bloque del evento, y
// si el link falta el DM lo dice en vez de pedirle a alguien que invite sin dónde registrar.
//
// v7 (2026-08-14, Ramiro): ?persona= en el preview. La URL de interactividad de la app de
// Slack no estaba configurada (se cayó al desactivarle el modo asistente), así que ningún
// desplegable registraba nada. Para probarlo sin recibir las 9 tandas de golpe, el preview
// acepta filtrar por una sola persona.
//
// v8 (2026-08-18, Ramiro): ASANA FASE A — matching read-only (ver faseAsana). Guarda el
// gid de la tarea de Asana en cada accionable, matcheando por SECCIÓN y no por nombre de
// tarea (los nombres traen el evento adentro y ya tienen un typo de plantilla). No escribe
// nada en Asana. La Fase B (comentar avance y cerrar tareas) espera el OK de Mario.
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
    link_registro: string | null; partner: string | null;
  };
};

// Claves de accionables que no se pueden arrancar sin el link de registro. Steph lo puso
// primero en su lista del 2026-08-13 (*"base / empresa / BDR / link de luma / ciudad…"*) y
// ventas invita con el mismo link. Si falta, el DM lo dice en vez de pedir algo imposible.
const NECESITAN_REGISTRO = new Set(["invitaciones", "inv_ventas"]);

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

// Un accionable puede tener más de un destinatario (base_datos: Martín genera y Bruno
// enriquece; handoff: Martín y Cande). El progreso es UNO solo y compartido, así que quien
// lo recibe tiene que saber que no depende solo de él — si no, o lo hacen dos veces o
// ninguno. Se usa la sintaxis <@ID>: el nombre lo resuelve Slack (no hay diccionario que
// mantener) y no le llega notificación a la persona mencionada. 2026-08-13.
function compartidoCon(a: Accionable, paraQuien: string): string {
  const otros = destinatarios(a.slack_user_id).filter((d) => d !== paraQuien);
  if (otros.length === 0) return "";
  return ` · compartido con ${otros.map((d) => `<@${d}>`).join(", ")}`;
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
function armarDigest(items: Accionable[], intro: string, condicionales: Set<string>, paraQuien: string): { text: string; blocks: unknown[] }[] {
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

    // Datos del evento que hacen falta para ejecutar, no solo para saber que existe.
    const datos: string[] = [];
    if (e.link_registro) datos.push(`:tickets: <${e.link_registro}|Link de registro>`);
    if (e.partner) datos.push(`:handshake: Partner: *${e.partner}*`);
    if (!e.link_registro && arr.some((a) => NECESITAN_REGISTRO.has(a.template_clave ?? ""))) {
      datos.push(":warning: _Todavía no hay link de registro cargado en el calendario._");
    }
    if (datos.length) {
      grupo.push({ type: "context", elements: [{ type: "mrkdwn", text: datos.join("  ·  ") }] });
    }
    for (const a of arr) {
      grupo.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${a.nombre}*\n_${a.progreso > 0 ? `avance actual: ${a.progreso}%` : "sin arrancar"}_${compartidoCon(a, paraQuien)}` },
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
    .select("*, fm_upcoming_events!inner(nombre, fecha, industria, territorio, pais, ciudad, estado, link_registro, partner)")
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
  enviar: (text: string, blocks: unknown[]) => Promise<{ ok: boolean; detalle: string | null }>,
  // De quién es el digest. En el preview NO coincide con el destinatario real del envío
  // (todo va a Ramiro), y tiene que ser el original para que la etiqueta de compartidos
  // diga lo mismo que vería esa persona.
  paraQuien: string
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
    for (const m of armarDigest(delBloque, introDigest(delBloque, condicionales, tipo, bloque), condicionales, paraQuien)) {
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
      items, condicionales, "aviso", (text, blocks) => slackPost(slackId, text, blocks), slackId
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
    .select("*, fm_upcoming_events!inner(nombre, fecha, industria, territorio, pais, ciudad, estado, link_registro, partner)")
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
      items, condicionales, "status", (text, blocks) => slackPost(slackId, text, blocks), slackId
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
async function fasePreview(target: string, soloPersona?: string) {
  if (!SLACK_TOKEN) return { ok: false, nota: "SLACK_BOT_TOKEN no configurado" };
  const pendientes = await pendientesDeAviso();
  const grupos = porDestinatario(pendientes);
  const condicionales = await clavesCondicionales();

  // ?persona=U… deja solo la tanda de esa persona. Sirve para probar el circuito de
  // respuesta (click en el desplegable) sin recibir los ~30 mensajes de todas las tandas.
  if (soloPersona) {
    for (const k of [...grupos.keys()]) if (k !== soloPersona) grupos.delete(k);
  }

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
    const r = await enviarPorBloque(items, condicionales, "aviso", (text, blocks) => slackPost(target, text, blocks), slackId);
    enviados.push({ slack_id: slackId, responsable: items[0].responsable, accionables: items.length, mensajes: r.mensajes, ok: r.ok });
  }
  return { ok: true, fase: "preview", cutover: CUTOVER_EVENTOS, target, personas: grupos.size, accionables: pendientes.length, detalle: enviados };
}

// ─── Asana, Fase A: matching de tareas ──────────────────────────────────────────────
// Lee las tareas del proyecto de Asana de cada evento y guarda el gid de la tarea en el
// accionable que le corresponde. NO escribe nada en Asana: lo único que se toca es la
// columna asana_task_gid de nuestra base. Fase B (comentar avance y cerrar la tarea)
// espera el OK de Mario, porque cerrarle una tarea a alguien sin avisar rompe la
// confianza en Asana.
//
// Se matchea por SECCIÓN, no por nombre de tarea. Los nombres llevan el nombre del evento
// adentro y ya traen un typo de plantilla ("de acuerda al BRIEF"): si alguien lo corrige,
// un match por string se rompe en silencio. Las 4 secciones, en cambio, son el esqueleto
// de la plantilla y son las 4 áreas que anunció Mario.
const ASANA_PAT = Deno.env.get("ASANA_PAT") ?? "";

// Sección normalizada (ver normalizarSeccion) → clave de accionable. Se compara por
// prefijo, así que "ATOM STUDIO DESIGN" entra por "ATOM STUDIO".
const SECCION_A_CLAVE: [string, string][] = [
  ["GROWTH", "base_datos"],
  ["PAUTA", "pauta"],
  ["ATOM STUDIO", "contenido"],
  ["FIELD MARKETING", "invitaciones"],
];

// FIELD MARKETING tiene DOS tareas: el brief de Mario (due el día del evento, no mapea a
// ningún accionable nuestro) y la de José, que es la que se parece a `invitaciones`.
// El desempate va por nombre porque es lo único que las distingue dentro de la sección.
const FM_ES_BRIEF = ["BRIEF", "COSTOS", "PPT"];
const FM_ES_INVITACIONES = ["VENUE", "INVITACIONES", "LANDING", "LUMA", "REGISTROS", "DEMO"];

// Accionables sin contraparte en Asana, a propósito: la plantilla nueva es toda pre-evento
// y estos tres son internos nuestros. Se listan para que "no matcheó" no se lea como bug.
const SIN_CONTRAPARTE_ASANA = ["inv_ventas", "handoff_cande", "post_listas"];

// Marcas de acento, como rango de codepoints y no como caracteres literales: escritos
// literalmente son combining chars invisibles en el editor y cualquier herramienta que
// toque el archivo los puede comer sin que se note.
const ACENTOS = new RegExp("[\\u0300-\\u036f]", "g");

// Mayúsculas, sin acentos y sin la puntuación con la que vienen las secciones ("PAUTA -",
// "GROWTH -"). Deja solo letras, números y espacios simples.
function normalizarSeccion(s: string): string {
  return s
    .normalize("NFD").replace(ACENTOS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type TareaAsana = {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  due_on: string | null;
  assignee: { gid: string; name: string } | null;
  memberships: { project: { gid: string }; section: { gid: string; name: string } }[];
};

async function asanaTareasDelProyecto(projectGid: string): Promise<TareaAsana[]> {
  const campos = "name,notes,completed,due_on,assignee.name,memberships.section.name,memberships.project.gid";
  const tareas: TareaAsana[] = [];
  let offset = "";
  do {
    const url = `https://app.asana.com/api/1.0/projects/${projectGid}/tasks?opt_fields=${campos}&limit=100${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ASANA_PAT}` } });
    const json = await res.json();
    if (!res.ok) {
      // 403/404 acá casi siempre es falta de acceso, no un bug: el bot lee con el PAT de
      // Ramiro, así que solo ve los proyectos que Ramiro ve.
      throw new Error(`Asana ${res.status} en proyecto ${projectGid}: ${JSON.stringify(json.errors ?? json)}`);
    }
    tareas.push(...((json.data ?? []) as TareaAsana[]));
    offset = json.next_page?.offset ?? "";
  } while (offset);
  return tareas;
}

// La sección de una tarea DENTRO de este proyecto (una tarea puede estar en varios).
function seccionDe(t: TareaAsana, projectGid: string): string {
  const m = t.memberships.find((x) => x.project?.gid === projectGid) ?? t.memberships[0];
  return m?.section?.name ?? "";
}

// Elige, entre las tareas de una sección, la que corresponde a la clave. Devuelve null y el
// motivo cuando hay ambigüedad: preferimos NO guardar un gid antes que guardar el
// equivocado. Ya nos pasó dos veces con los Slack IDs que un match silencioso salga mal y
// no haya forma de verlo desde el preview.
function elegirTarea(clave: string, candidatas: TareaAsana[]): { tarea: TareaAsana | null; motivo: string } {
  if (candidatas.length === 0) return { tarea: null, motivo: "sin tareas en la sección" };
  if (clave !== "invitaciones") {
    if (candidatas.length === 1) return { tarea: candidatas[0], motivo: "única en la sección" };
    return { tarea: null, motivo: `${candidatas.length} tareas en la sección, no hay regla de desempate` };
  }
  // invitaciones: descartar el brief de Mario y quedarse con la de José.
  const puntaje = (t: TareaAsana) => {
    const n = normalizarSeccion(t.name);
    if (FM_ES_BRIEF.every((k) => n.includes(k))) return -1;
    return FM_ES_INVITACIONES.filter((k) => n.includes(k)).length;
  };
  const rankeadas = candidatas.map((t) => ({ t, p: puntaje(t) })).sort((a, b) => b.p - a.p);
  if (rankeadas[0].p <= 0) return { tarea: null, motivo: "ninguna tarea de FIELD MARKETING parece la de invitaciones" };
  if (rankeadas[1] && rankeadas[1].p === rankeadas[0].p) {
    return { tarea: null, motivo: "empate entre dos tareas de FIELD MARKETING" };
  }
  return { tarea: rankeadas[0].t, motivo: `desempate por nombre (${rankeadas[0].p} señales de invitaciones)` };
}

// El Word del evento viaja en el campo notes de las tareas de Atom Studio, Pauta y Growth
// (no en comentarios, como en la plantilla vieja). Se reporta para el paso siguiente:
// meter el link del brief en el DM de Hans, Nata y Martín.
function linkDeBrief(tareas: TareaAsana[]): string | null {
  for (const t of tareas) {
    const m = (t.notes ?? "").match(/https:\/\/docs\.google\.com\/\S+/);
    if (m) return m[0].replace(/[)>,.]+$/, "");
  }
  return null;
}

// ?phase=asana[&dry=1][&event=<uuid>] → matchea y guarda los gid.
// Con &dry=1 no escribe nada: sirve para revisar el mapeo antes de aplicarlo.
async function faseAsana(dry: boolean, soloEvento?: string) {
  if (!ASANA_PAT) return { ok: false, nota: "ASANA_PAT no configurado" };

  let q = supabase
    .from("fm_upcoming_events")
    .select("id, nombre, fecha, asana_project_gid")
    .not("asana_project_gid", "is", null);
  if (soloEvento) q = q.eq("id", soloEvento);
  const { data: eventos } = await q;

  const resultado: Record<string, unknown>[] = [];
  let guardados = 0;

  for (const e of (eventos ?? []) as { id: string; nombre: string; fecha: string; asana_project_gid: string }[]) {
    let tareas: TareaAsana[];
    try {
      tareas = await asanaTareasDelProyecto(e.asana_project_gid);
    } catch (err) {
      resultado.push({ evento: e.nombre, project_gid: e.asana_project_gid, error: String(err) });
      continue;
    }

    const { data: accionables } = await supabase
      .from("fm_event_accionables")
      .select("id, template_clave, responsable, asana_task_gid")
      .eq("event_id", e.id);

    // Sección normalizada → tareas de esa sección.
    const porSeccion = new Map<string, TareaAsana[]>();
    for (const t of tareas) {
      const norm = normalizarSeccion(seccionDe(t, e.asana_project_gid));
      const arr = porSeccion.get(norm) ?? [];
      arr.push(t);
      porSeccion.set(norm, arr);
    }

    const matches: Record<string, unknown>[] = [];
    const gidsUsados = new Set<string>();

    for (const [seccionEsperada, clave] of SECCION_A_CLAVE) {
      const candidatas = [...porSeccion.entries()]
        .filter(([norm]) => norm.startsWith(seccionEsperada))
        .flatMap(([, ts]) => ts);
      const { tarea, motivo } = elegirTarea(clave, candidatas);
      const accionable = ((accionables ?? []) as { id: string; template_clave: string | null; responsable: string | null; asana_task_gid: string | null }[])
        .find((a) => a.template_clave === clave);

      if (!accionable) {
        matches.push({ clave, seccion: seccionEsperada, estado: "el evento no tiene ese accionable" });
        continue;
      }
      if (!tarea) {
        matches.push({ clave, seccion: seccionEsperada, estado: "sin match", motivo });
        continue;
      }
      gidsUsados.add(tarea.gid);
      const yaEstaba = accionable.asana_task_gid === tarea.gid;
      let estado = dry ? "matcheado (dry-run, no se guardó)" : yaEstaba ? "ya estaba guardado" : "guardado";
      if (!dry && !yaEstaba) {
        const { error } = await supabase
          .from("fm_event_accionables")
          .update({ asana_task_gid: tarea.gid })
          .eq("id", accionable.id);
        if (error) estado = `error al guardar: ${error.message}`;
        else guardados++;
      }
      matches.push({
        clave,
        seccion: seccionEsperada,
        estado,
        motivo,
        tarea: tarea.name.trim(),
        task_gid: tarea.gid,
        assignee_asana: tarea.assignee?.name ?? null,
        responsable_nuestro: accionable.responsable,
        completed_en_asana: tarea.completed,
        ya_tenia_gid: accionable.asana_task_gid,
      });
    }

    resultado.push({
      evento: e.nombre,
      fecha: e.fecha,
      project_gid: e.asana_project_gid,
      tareas_en_asana: tareas.length,
      matches,
      sin_contraparte_por_diseno: SIN_CONTRAPARTE_ASANA,
      // Tareas de Asana que no quedaron mapeadas: normalmente el brief de Mario y las
      // secciones que la plantilla trae vacías. Si acá aparece algo inesperado, cambió
      // la plantilla.
      tareas_sin_mapear: tareas.filter((t) => !gidsUsados.has(t.gid))
        .map((t) => ({ seccion: seccionDe(t, e.asana_project_gid), tarea: t.name.trim(), assignee: t.assignee?.name ?? null })),
      link_brief: linkDeBrief(tareas),
    });
  }

  return { ok: true, fase: "asana", dry, eventos_con_proyecto: (eventos ?? []).length, gids_guardados: guardados, detalle: resultado };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const phase = url.searchParams.get("phase") ?? "avisos";
  const user = url.searchParams.get("user") ?? "";
  try {
    let out: unknown;
    if (phase === "diag") out = await faseDiag();
    else if (phase === "test") out = user ? await faseTest(user) : { ok: false, error: "falta ?user=U…" };
    else if (phase === "preview") out = user ? await fasePreview(user, url.searchParams.get("persona") || undefined) : { ok: false, error: "falta ?user=U…" };
    else if (phase === "asana") out = await faseAsana(url.searchParams.get("dry") === "1", url.searchParams.get("event") || undefined);
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
