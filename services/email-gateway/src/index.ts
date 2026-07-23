// services/email-gateway — Worker Cloudflare des formulaires email du site.
//
// Deux endpoints :
//   POST /subscribe { email, source, website } → crée le contact dans Listmonk
//     (auto-hébergé) sur la liste « Le Lab » avec l'attribut `source`, en
//     laissant Listmonk envoyer l'email de confirmation (double opt-in).
//   POST /contact { name, email, message, website } → relaie le message du
//     formulaire de contact vers CONTACT_TO via l'API transactionnelle Brevo
//     (un Worker ne parle pas SMTP), avec Reply-To = le visiteur : répondre
//     dans Gmail répond directement à la personne.
//
// Garde-fous (communs) :
//   - validation basique des champs (longueur AVANT regex) ;
//   - CORS restreint aux origines du site (+ staging + localhost en dev) ;
//   - honeypot : le champ `website` (invisible pour un humain) doit être
//     vide — un robot qui le remplit reçoit un faux succès ;
//   - limite de débit best-effort en mémoire (par isolat Worker : suffisant
//     contre les rafales naïves, pas contre une attaque distribuée) ;
//   - /subscribe : réponse identique que l'adresse soit nouvelle ou déjà
//     inscrite (pas d'énumération d'emails).

export interface Env {
  LISTMONK_URL: string;
  LISTMONK_LIST_ID: string;
  ALLOWED_ORIGINS: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
  // Secrets (wrangler secret put …)
  LISTMONK_API_USER: string;
  LISTMONK_API_TOKEN: string;
  BREVO_API_KEY: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 5000;

// Provenances acceptées — doit couvrir tous les formulaires du site.
// Émises aujourd'hui : quete, comprendre, twin, live, home, pratiquer
// (bande email + formulaire d'inscription des ateliers en repli),
// soutenir (page Soutenir, via EmailCapture).
// « pratiquer-trail » est réservé au teaser accompagnement trail 2027.
// « manifeste » (ex-nom de /quete, 308) et « footer » sont gardés par
// tolérance pour d'éventuelles pages en cache navigateur.
const SOURCES = new Set([
  "quete",
  "comprendre",
  "twin",
  "live",
  "home",
  "pratiquer",
  "pratiquer-trail",
  "soutenir",
  "footer",
  "manifeste",
]);

// Limite de débit best-effort : N requêtes / fenêtre / IP, dans la mémoire
// de l'isolat (remise à zéro quand Cloudflare recycle l'isolat — assumé).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    // Borne mémoire : appliquée là où la Map GRANDIT (nouvelle entrée).
    if (hits.size > 10_000) hits.clear();
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/** Corps JSON → objet, ou null si illisible / pas un objet (un body `null`
 *  littéral passait request.json() puis explosait plus loin — revue C086). */
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

/** true si le honeypot est rempli → robot : répondre un faux succès. */
function isRobot(payload: Record<string, unknown>): boolean {
  return typeof payload.website === "string" && payload.website.trim() !== "";
}

/**
 * Crée le contact dans Listmonk. `preconfirm_subscriptions: false` →
 * l'inscription reste « non confirmée » et Listmonk envoie l'email de
 * double opt-in pour les listes configurées ainsi.
 */
async function subscribeToListmonk(
  env: Env,
  email: string,
  source: string
): Promise<"ok" | "exists" | "upstream_error"> {
  let res: Response;
  try {
    res = await fetch(`${env.LISTMONK_URL}/api/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${env.LISTMONK_API_USER}:${env.LISTMONK_API_TOKEN}`,
      },
      body: JSON.stringify({
        email,
        name: "",
        status: "enabled",
        lists: [Number(env.LISTMONK_LIST_ID)],
        attribs: { source },
        preconfirm_subscriptions: false,
      }),
    });
  } catch (err) {
    console.error(`Listmonk injoignable: ${String(err)}`);
    return "upstream_error";
  }

  if (res.ok) return "ok";

  // Adresse déjà inscrite : Listmonk répond en erreur avec un message
  // explicite — on traite ça comme un succès (pas d'énumération d'emails).
  const text = await res.text();
  if (res.status === 409 || /exist/i.test(text)) return "exists";

  console.error(`Listmonk ${res.status}: ${text.slice(0, 300)}`);
  return "upstream_error";
}

async function handleSubscribe(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const payload = await readJson(request);
  if (payload === null) {
    return json({ ok: false, error: "corps_invalide" }, 400, cors);
  }
  if (isRobot(payload)) return json({ ok: true }, 200, cors);

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
    return json({ ok: false, error: "email_invalide" }, 400, cors);
  }

  const source = typeof payload.source === "string" ? payload.source : "";
  if (!SOURCES.has(source)) {
    return json({ ok: false, error: "source_invalide" }, 400, cors);
  }

  const result = await subscribeToListmonk(env, email, source);
  if (result === "upstream_error") {
    return json({ ok: false, error: "service_indisponible" }, 502, cors);
  }

  // « ok » comme « exists » → même réponse.
  return json({ ok: true }, 200, cors);
}

/**
 * Relaie un message du formulaire de contact vers CONTACT_TO via l'API
 * transactionnelle Brevo (https://developers.brevo.com/reference/sendtransacemail).
 * Texte brut (pas de HTML → rien à échapper) ; Reply-To = le visiteur.
 */
async function handleContact(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const payload = await readJson(request);
  if (payload === null) {
    return json({ ok: false, error: "corps_invalide" }, 400, cors);
  }
  if (isRobot(payload)) return json({ ok: true }, 200, cors);

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    return json({ ok: false, error: "nom_invalide" }, 400, cors);
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
    return json({ ok: false, error: "email_invalide" }, 400, cors);
  }
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return json({ ok: false, error: "message_invalide" }, 400, cors);
  }

  if (!env.BREVO_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error("Contact non configuré (BREVO_API_KEY / CONTACT_TO / CONTACT_FROM)");
    return json({ ok: false, error: "service_indisponible" }, 502, cors);
  }

  const texte = [
    "Nouveau message depuis le formulaire de contact du site.",
    "",
    `Nom   : ${name}`,
    `Email : ${email}`,
    "",
    message,
    "",
    "— Répondre à cet email écrit directement à la personne (Reply-To).",
  ].join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "The Locomotion Lab", email: env.CONTACT_FROM },
        to: [{ email: env.CONTACT_TO }],
        replyTo: { email, name },
        subject: `Contact site — ${name}`,
        textContent: texte,
      }),
    });
  } catch (err) {
    console.error(`Brevo injoignable: ${String(err)}`);
    return json({ ok: false, error: "service_indisponible" }, 502, cors);
  }

  if (!res.ok) {
    console.error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return json({ ok: false, error: "service_indisponible" }, 502, cors);
  }

  return json({ ok: true }, 200, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const route =
      request.method === "POST" && url.pathname === "/subscribe"
        ? handleSubscribe
        : request.method === "POST" && url.pathname === "/contact"
          ? handleContact
          : null;
    if (!route) {
      return json({ ok: false, error: "not_found" }, 404, cors);
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (rateLimited(ip)) {
      return json({ ok: false, error: "trop_de_requetes" }, 429, cors);
    }

    return route(request, env, cors);
  },
} satisfies ExportedHandler<Env>;
