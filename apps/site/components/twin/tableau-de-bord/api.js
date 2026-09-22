// components/twin/tableau-de-bord/api.js
//
// LE CLIENT DE L'API, et le jeton qui l'ouvre.
//
// Le jeton se colle UNE FOIS et reste : il vit en `localStorage`, donc il survit à la
// fermeture de l'onglet et du navigateur. Ce choix se paie et s'assume — c'est
// Cloudflare Access qui le rend tenable. Sans Access, garder un jeton
// d'administration sur la machine serait imprudent : quiconque ouvre ce navigateur
// entrerait. Avec Access devant la page, il faut d'abord passer l'identité.
//
// Ce qu'on ne fera jamais, en revanche : le mettre dans l'URL. Il y finirait dans
// l'historique, dans les journaux du proxy, et dans le `Referer` du premier appel
// sortant de la page.
//
// Et il faut bien DEUX serrures, pas une : Access garde la PAGE — qui ne contient
// aucune donnée — et le jeton garde l'API, qui les contient toutes. L'API vit sur un
// autre domaine (`api.thelocomotionlab.com`) qu'Access ne couvre pas et ne peut pas
// couvrir : il intercepterait le préflight CORS, que le navigateur envoie sans cookie,
// et plus rien ne se lirait. Retirer le jeton laisserait donc l'API entièrement
// ouverte, à tout l'internet.

export const CLE_JETON = "twin.tableau-de-bord.jeton";

/** L'adresse de l'API. Surchargée en développement pour viser un moteur local. */
export const API =
  process.env.NEXT_PUBLIC_TWIN_API || "https://api.thelocomotionlab.com";

export function lireLeJeton() {
  try {
    return localStorage.getItem(CLE_JETON) || "";
  } catch {
    // Navigation privée verrouillée, stockage bloqué : la page demande le jeton à
    // chaque fois plutôt que de tomber.
    return "";
  }
}

export function poserLeJeton(jeton) {
  try {
    localStorage.setItem(CLE_JETON, jeton);
  } catch {
    /* rien à faire : le jeton vivra le temps de la page */
  }
}

/** Oublier le jeton sur cette machine. C'est ce que fait « Tableau de bord Twin ·
 *  privé » en haut à droite — le geste à faire sur un ordinateur qui n'est pas le
 *  tien, ou quand on régénère le jeton sur le VPS. */
export function oublierLeJeton() {
  try {
    localStorage.removeItem(CLE_JETON);
    // Un jeton posé par une version antérieure vivait là : on le balaie aussi, sinon
    // il ressusciterait au prochain onglet.
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
