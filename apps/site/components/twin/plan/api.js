// components/twin/plan/api.js
//
// LA PAGE DE L'ATHLÈTE PARLE À L'API AVEC LA CLÉ DE SON LIEN, et rien d'autre.
//
// Pas de jeton, pas de compte : la clé (`k`) est dans l'adresse que l'athlète a reçue.
// Elle voyage vers l'API en paramètre, comme dans le lien — c'est le contrat des routes
// /twin/plans/* (récapitulatif §4.2). La page, elle, est servie avec
// `Referrer-Policy: no-referrer` : son adresse, clé comprise, ne part nulle part ailleurs.

export const API = process.env.NEXT_PUBLIC_TWIN_API || "https://api.thelocomotionlab.com";

export class ErreurPage extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

function adresse(ref, chemin, cle) {
  const base = `${API}/twin/plans/${encodeURIComponent(ref)}${chemin}`;
  return `${base}?k=${encodeURIComponent(cle)}`;
}

async function appeler(ref, cle, chemin = "", { methode = "GET", corps } = {}) {
  const options = { method: methode, referrerPolicy: "no-referrer" };
  if (corps !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(corps);
  }
  let reponse;
  try {
    reponse = await fetch(adresse(ref, chemin, cle), options);
  } catch {
    throw new ErreurPage(0, "La page ne joint pas le laboratoire. Vérifie ta connexion, puis réessaie.");
  }
  const charge = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const detail = typeof charge?.detail === "string" && charge.detail !== "not_found" ? charge.detail : "";
    throw new ErreurPage(
      reponse.status,
      reponse.status === 404
        ? "Ce lien ne mène à aucun plan. Vérifie qu'il est complet, clé comprise."
        : detail || `Le laboratoire a répondu ${reponse.status}.`,
    );
  }
  return charge;
}

export const lirePage = (ref, cle) => appeler(ref, cle);

export const amender = (ref, cle, amendements) =>
  appeler(ref, cle, "/amend", { methode: "POST", corps: amendements });

export const lireLAmendement = (ref, cle, jobId) =>
  appeler(ref, cle, `/jobs/${encodeURIComponent(jobId)}`);

export const demander = (ref, cle, demande) =>
  appeler(ref, cle, "/requests", { methode: "POST", corps: demande });

export const saisirLeResultat = (ref, cle, resultat) =>
  appeler(ref, cle, "/result", { methode: "PUT", corps: resultat });

/** L'adresse d'un document : un lien simple suffit, la clé est dedans. */
export const lienDuDocument = (ref, cle, nom) => adresse(ref, `/${nom}`, cle);
