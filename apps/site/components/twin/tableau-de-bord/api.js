// components/twin/tableau-de-bord/api.js
//
// LE CLIENT DE L'API, et le jeton qui l'ouvre.
//
// Le jeton se colle une fois et vit en `sessionStorage` : il disparaît à la fermeture
// de l'onglet. Pas `localStorage`, qui le garderait des mois sur la machine ; pas
// l'URL, qui l'écrirait dans l'historique, les journaux du proxy et le `Referer` de la
// première image chargée.
//
// Deux serrures gardent ces pages, et il en faut deux : Cloudflare Access devant la
// PAGE (elle est servie avec le reste du site, donc publique sans lui), le jeton
// devant l'API (elle est sur un autre domaine, qu'Access ne couvre pas).

export const CLE_JETON = "twin.tableau-de-bord.jeton";

/** L'adresse de l'API. Surchargée en développement pour viser un moteur local. */
export const API =
  process.env.NEXT_PUBLIC_TWIN_API || "https://api.thelocomotionlab.com";

export function lireLeJeton() {
  try {
    return sessionStorage.getItem(CLE_JETON) || "";
  } catch {
    // Navigation privée verrouillée, stockage bloqué : la page demande le jeton à
    // chaque fois plutôt que de tomber.
    return "";
  }
}

export function poserLeJeton(jeton) {
  try {
    sessionStorage.setItem(CLE_JETON, jeton);
  } catch {
    /* rien à faire : le jeton vivra le temps de la page */
  }
}

export function oublierLeJeton() {
  try {
    sessionStorage.removeItem(CLE_JETON);
  } catch {
    /* déjà oublié */
  }
}

/** Ce que l'API a refusé, avec de quoi l'afficher. */
export class ErreurAPI extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

/**
 * Un appel au tableau de bord. Le jeton part en `Authorization`, jamais dans l'URL.
 *
 * Un 401 ne se rattrape pas ici : il remonte, et c'est l'écran qui redemande le jeton
 * — lui seul sait s'il peut se permettre d'interrompre ce que l'utilisateur faisait.
 */
export async function appeler(chemin, { methode = "GET", corps, fichiers, jeton } = {}) {
  const cle = jeton ?? lireLeJeton();
  const options = { method: methode, headers: { Authorization: `Bearer ${cle}` } };
  if (fichiers) {
    options.body = fichiers;
  } else if (corps !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(corps);
  }

  let reponse;
  try {
    reponse = await fetch(`${API}/twin/tableau-de-bord${chemin}`, options);
  } catch (erreur) {
    throw new ErreurAPI(0, "L'API ne répond pas. Vérifie ta connexion, puis réessaie.");
  }
  if (reponse.status === 204) return null;

  const charge = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    throw new ErreurAPI(reponse.status, messageDe(reponse.status, charge));
  }
  return charge;
}

/** L'état d'un job, que les écrans sondent pendant qu'il tourne. */
export async function lireLeJob(jobId) {
  const reponse = await fetch(`${API}/twin/jobs/${encodeURIComponent(jobId)}`);
  if (!reponse.ok) throw new ErreurAPI(reponse.status, "Ce travail est introuvable.");
  return reponse.json();
}

function messageDe(statut, charge) {
  const detail = typeof charge?.detail === "string" ? charge.detail : "";
  if (statut === 401) return "Jeton refusé.";
  if (statut === 404 && !detail) {
    return "Le tableau de bord n'est pas ouvert côté serveur (TWIN_ADMIN_TOKEN manquant).";
  }
  if (statut === 502) return detail || "Le service de dépôt ne répond pas.";
  return detail || `L'API a répondu ${statut}.`;
}
