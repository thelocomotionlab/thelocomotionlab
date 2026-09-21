// lib/twinRendu.mjs
//
// REFAIRE SES DOCUMENTS DEPUIS LA PAGE DE SON RAPPORT.
//
// L'athlète amende ses arrêts sur l'annexe ; ce module envoie ce qu'il a changé au moteur
// et récupère SES documents refaits — livret, feuille à emporter, fiches d'assistance,
// calendrier, trace. Pas un aperçu recalculé dans le navigateur : les documents, faits par
// le même code que le rapport d'origine.
//
// Le moteur ne garde rien : il reçoit une référence et un amendement, rend un ZIP, et
// oublie. La page n'a donc aucune mémoire à tenir — rouvrir l'annexe, c'est repartir du
// plan du rapport.
//
// L'adresse vit ICI en clair, pour la même raison que celle du dépôt (lib/twinDepot.mjs) :
// ce n'est pas un secret, c'est une adresse publique, et une adresse publique qui n'existe
// que dans une variable d'environnement finit par manquer au build.

/** Le moteur en production, derrière Caddy sur l'API du VPS (un seul chemin exposé). */
export const RENDU_API_DEFAUT = "https://api.thelocomotionlab.com/twin";

/**
 * Base de l'API de rendu : la variable d'environnement si elle est posée, sinon la
 * production. Une base vide explicite (`NEXT_PUBLIC_TWIN_RENDU_API=" "`) désactive le
 * bouton — la page retombe alors sur le téléchargement des réglages en JSON.
 */
export function renduApiBase(env = process.env) {
  const brut = env?.NEXT_PUBLIC_TWIN_RENDU_API;
  if (brut === undefined || brut === null) return RENDU_API_DEFAUT;
  const propre = String(brut).trim().replace(/\/+$/, "");
  return propre || "";
}

/** L'URL du POST de rendu, ou null quand le rendu en ligne est désactivé. */
export function urlRendu(env = process.env) {
  const base = renduApiBase(env);
  return base ? `${base}/rendu` : null;
}

/** Le nom du fichier téléchargé, dérivé de la référence du rapport. */
export function nomDuZip(ref) {
  const propre = String(ref ?? "").replace(/[^A-Za-z0-9_-]/g, "") || "rapport";
  return `locomotion-twin-${propre}.zip`;
}

/** Ce que le moteur répond quand il refuse, dit à l'athlète. */
const MESSAGES = {
  injoignable:
    "Le moteur n'a pas répondu. Vérifie ta connexion ; si ça persiste, tes réglages restent " +
    "téléchargeables en JSON juste en dessous.",
  introuvable:
    "Le moteur ne retrouve pas ce rapport. Écris-moi via la page contact avec la référence " +
    "affichée en bas de page.",
  refuse:
    "Le moteur a refusé ces réglages. Vérifie les minutes saisies ; si tout semble normal, " +
    "écris-moi via la page contact.",
  occupe: "Un autre rendu est en cours — attends une trentaine de secondes et réessaie.",
  panne:
    "Le moteur a échoué à refaire les documents. Réessaie dans un moment ; tes réglages " +
    "restent téléchargeables en JSON juste en dessous.",
};

/**
 * Message affiché pour un statut HTTP. `statut` 0 = la requête n'est jamais arrivée
 * (réseau coupé, service injoignable, origine refusée) : on le dit, plutôt que le
 * « vérifie ta connexion » qui envoie chercher au mauvais endroit.
 */
export function messageDeRendu(statut) {
  if (statut === 0) return { message: MESSAGES.injoignable, code: "injoignable" };
  if (statut === 404) return { message: MESSAGES.introuvable, code: "introuvable" };
  if (statut === 413 || statut === 422) return { message: MESSAGES.refuse, code: "refuse" };
  if (statut === 429) return { message: MESSAGES.occupe, code: "occupe" };
  return { message: MESSAGES.panne, code: `http_${statut}` };
}

/**
 * Demande les documents refaits. Rend `{ ok: true, blob }` ou `{ ok: false, message, code }`.
 *
 * `amendement` est le fragment que le formulaire produit : les trois champs que la page
 * offre (réglages, assistance, nutrition), et rien d'autre — le moteur refuse le reste.
 */
export async function refaireDocuments({ ref, amendement, env = process.env, fetcher = fetch }) {
  const url = urlRendu(env);
  if (!url) return { ok: false, ...messageDeRendu(0) };
  let reponse;
  try {
    reponse = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref, amendement: amendement ?? null }),
    });
  } catch {
    return { ok: false, ...messageDeRendu(0) };
  }
  if (!reponse.ok) return { ok: false, ...messageDeRendu(reponse.status) };
  return { ok: true, blob: await reponse.blob() };
}
