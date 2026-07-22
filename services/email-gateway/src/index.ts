// services/email-gateway — Worker Cloudflare de capture email.
//
// POST /subscribe { email, source } → crée le contact dans Listmonk
// (auto-hébergé) sur la liste « Le Lab » avec l'attribut `source`, en
// laissant Listmonk envoyer l'email de confirmation (double opt-in).
//
// Garde-fous :
//   - validation basique de l'email et de la source ;
//   - CORS restreint aux origines du site (+ localhost en dev) ;
//   - honeypot : le champ `website` (invisible pour un humain) doit être
//     vide — un robot qui le remplit reçoit un faux succès ;
//   - limite de débit best-effort en mémoire (par isolat Worker : suffisant
//     contre les rafales naïves, pas contre une attaque distribuée) ;
//   - réponse identique que l'adresse soit nouvelle ou déjà inscrite
//     (pas d'énumération d'emails).

export interface Env {
  LISTMONK_URL: string;
  LISTMONK_LIST_ID: string;
  ALLOWED_ORIGINS: string;
  // Secrets (wrangler secret put …)
  LISTMONK_API_USER: string;
  LISTMONK_API_TOKEN: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (hits.size > 10_000) hits.clear(); // borne mémoire grossière
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/subscribe") {
      return json({ ok: false, error: "not_found" }, 404, cors);
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (rateLimited(ip)) {
      return json({ ok: false, error: "trop_de_requetes" }, 429, cors);
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "corps_invalide" }, 400, cors);
    }

    // Honeypot : un humain ne voit pas ce champ ; un robot qui le remplit
    // reçoit un faux succès (et on n'appelle pas Listmonk).
    if (typeof payload.website === "string" && payload.website.trim() !== "") {
      return json({ ok: true }, 200, cors);
    }

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!EMAIL_REGEX.test(email) || email.length > 254) {
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
  },
} satisfies ExportedHandler<Env>;
