// lib/twinDepot.mjs
//
// L'ADRESSE DU SERVICE DE DÉPÔT, et ce qu'on dit quand il refuse.
//
// Elle vit ICI, en clair, pour la même raison que SITE_HOST dans lib/site.mjs :
// ce n'est pas un secret, c'est une adresse publique, et une adresse publique
// qui n'existe que dans une variable d'environnement finit par manquer au build.
// C'est ce qui est arrivé : `NEXT_PUBLIC_TWIN_DEPOT_API` n'était posée ni dans
// le workflow de déploiement ni dans les variables de build documentées, donc
// le bundle partait avec une base vide et le formulaire refusait tout envoi en
// renvoyant vers /contact — le service, lui, tournait.
//
// La variable reste lue : elle SURCHARGE le défaut (développement local,
// staging, bascule d'urgence vers un autre hôte).

/** Le service de dépôt en production (services/twin-depot, derrière Caddy sur
 *  un sous-domaine DNS-only : le proxy Cloudflare plafonne les corps à ~100 Mo). */
export const DEPOT_API_DEFAUT = "https://depot.thelocomotionlab.com/twin";

/** Base de l'API de dépôt : la variable d'environnement si elle est posée, sinon
 *  la production. Une base vide explicite (`NEXT_PUBLIC_TWIN_DEPOT_API=" "`)
 *  désactive le dépôt — c'est la seule façon de revenir au repli /contact. */
export function depotApiBase(env = process.env) {
  const brut = env?.NEXT_PUBLIC_TWIN_DEPOT_API;
  if (brut === undefined || brut === null) return DEPOT_API_DEFAUT;
  const propre = String(brut).trim().replace(/\/+$/, "");
  return propre || "";
}

/** L'URL du POST de dépôt, ou null quand le dépôt est désactivé. */
export function urlDepots(env = process.env) {
  const base = depotApiBase(env);
  return base ? `${base}/depots` : null;
}

/** Ce que le service répond quand il refuse, dit à l'athlète. La clé est le
 *  champ `error` du JSON (services/twin-depot/src/server.ts). */
const MESSAGES = {
  archive_requise: "L'archive n'est pas arrivée — reprends l'étape 2 et redépose ton fichier.",
  archive_trop_grosse:
    "Ton archive dépasse la taille maximale acceptée — écris-moi via la page contact et on s'organise.",
  prenom_invalide: "Ton prénom n'a pas été accepté (80 caractères au maximum).",
  nom_invalide: "Ton nom n'a pas été accepté (80 caractères au maximum).",
  email_invalide: "Cet email n'a pas été accepté — vérifie-le et réessaie.",
  montre_invalide: "Cette montre n'est pas reconnue par le service — reprends l'étape 1.",
  objectifs_trop_longs: "Ton texte d'objectifs est trop long — raccourcis-le et réessaie.",
  objectif_invalide:
    "Ton objectif chiffré n'a pas été compris — écris-le « 31h », « 31h30 » ou « 31:00:00 ».",
  consentement_requis: "Il manque la case de consentement.",
  trop_de_requetes: "Trop d'envois rapprochés — patiente quelques minutes et réessaie.",
  multipart_requis: "L'envoi a été refusé par le service (format inattendu).",
  envoi_invalide: "L'envoi s'est interrompu en route — réessaie, et préviens-moi si ça recommence.",
};

/**
 * Message d'erreur affiché et faut-il pointer vers /contact.
 *
 * `statut` 0 = la requête n'est jamais arrivée (réseau coupé, service
 * injoignable, origine refusée) : on le DIT, au lieu du « vérifie ta connexion »
 * qui envoyait tout le monde chercher au mauvais endroit. Le code technique est
 * affiché en fin de message : c'est lui qu'on me recopie quand ça coince.
 */
export function messageDErreur(statut, corps) {
  let code = null;
  try {
    const json = typeof corps === "string" ? JSON.parse(corps) : corps;
    if (json && typeof json.error === "string") code = json.error;
  } catch {
    code = null;
  }
  if (statut === 0) {
    return {
      message:
        "Le service de dépôt n'a pas répondu. Vérifie ta connexion ; si le problème persiste, " +
        "écris-moi via la page contact et je prends ton archive autrement.",
      contact: true,
      code: "injoignable",
    };
  }
  if (code && MESSAGES[code]) {
    return { message: MESSAGES[code], contact: code === "archive_trop_grosse", code };
  }
  if (statut === 413) {
    return { message: MESSAGES.archive_trop_grosse, contact: true, code: "archive_trop_grosse" };
  }
  if (statut === 429) {
    return { message: MESSAGES.trop_de_requetes, contact: false, code: "trop_de_requetes" };
  }
  if (statut >= 500) {
    return {
      message:
        "Le service de dépôt est tombé pendant l'envoi. Réessaie dans quelques minutes, " +
        "et préviens-moi via la page contact si ça recommence.",
      contact: true,
      code: `http_${statut}`,
    };
  }
  return {
    message: "L'envoi a été refusé par le service. Réessaie, et préviens-moi si ça recommence.",
    contact: true,
    code: code || `http_${statut}`,
  };
}
