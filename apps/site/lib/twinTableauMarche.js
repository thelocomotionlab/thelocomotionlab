// lib/twinTableauMarche.js
//
// LE TABLEAU DE MARCHE RECALCULÉ, côté navigateur.
//
// La page d'annexe est prérendue : quand on personnalise ses arrêts, personne ne peut
// relancer le moteur. Ce module rejoue donc EXACTEMENT la règle d'arrêts de
// `build_pacing` (services/twin-engine, pacing/plan.py), pour que les heures affichées
// soient celles du prochain PDF et pas une approximation qui s'en écarte.
//
// La règle dépend du modèle d'arrêts du rapport (`plan.stops_model`) :
//
//   · « spec »     — le mouvement prédit ne bouge pas, les arrêts s'ajoutent : allonger
//                    un arrêt recule l'arrivée d'autant ;
//   · « personal » — le mouvement ET le budget d'arrêts viennent de la prédiction. Un
//                    arrêt écrit est retenu tel quel, le reste du budget se répartit sur
//                    les autres points au prorata. L'arrivée ne bouge que si les arrêts
//                    écrits dépassent le budget ;
//   · sinon        — l'horloge EST le temps prédit et les arrêts s'en retranchent :
//                    allonger un arrêt, c'est autant de moins en mouvement. L'arrivée ne
//                    bouge pas, l'allure demandée monte.
//
// Toutes les durées sont en minutes.

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Un nombre écrit à la française (« 12,5 ») ou rien. */
export function nombre(valeur) {
  const v = Number.parseFloat(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Minutes → « 3 h 07 ». */
export function duree(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/**
 * Le départ : l'instant et le décalage horaire déclarés par la spec de course. Les heures
 * affichées sont celles de la COURSE — pas celles du fuseau du navigateur qui ouvre la page.
 */
export function depart(iso) {
  if (typeof iso !== "string" || !iso) return null;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  const dec = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const t = Date.parse(m || /[Zz]$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(t) ? { t, dec } : null;
}

/** Départ + minutes → « sam. 03h40 », le format du rapport. */
export function heure(dep, minutes) {
  if (!dep) return "—";
  const d = new Date(dep.t + (minutes + dep.dec) * 60000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${JOURS[d.getUTCDay()]} ${hh}h${mm}`;
}

/**
 * Le tableau recalculé.
 *
 * `segments` : ceux de l'annexe (`t_move_min`, `stop_min`). `arrets` : les minutes saisies,
 * une par segment. `figes` : les segments qui portent un arrêt ÉCRIT (ceux que le fragment
 * de spec renverra au moteur). `horlogeMin` : le temps que le rapport répartit — la
 * prédiction, ou l'objectif en mode cible (`plan.anchor_hours`).
 *
 * Rend une ligne par segment : mouvement, arrêt et cumul à l'ARRIVÉE du segment (l'arrêt
 * d'un ravitaillement se prend en y arrivant, il ne compte donc pas dans son propre cumul).
 */
export function recalcule({ segments = [], arrets = [], figes = [], modele = "carved", horlogeMin = 0 }) {
  const mouvement = segments.map((s) => Number(s?.t_move_min) || 0);
  const servis = segments.map((s) => Number(s?.stop_min) || 0);
  const saisis = segments.map((s, i) => Math.max(nombre(arrets[i]) ?? servis[i], 0));
  const fige = segments.map((_, i) => Boolean(figes[i]));
  const mouvementRapport = mouvement.reduce((t, m) => t + m, 0);

  let m = mouvement;
  let s = saisis;

  if (modele === "personal") {
    // le budget d'arrêts de la prédiction : ce que l'horloge laisse au-delà du mouvement
    const budget = Math.max(horlogeMin - mouvementRapport, 0);
    const ecrits = saisis.reduce((t, v, i) => t + (fige[i] ? v : 0), 0);
    const reste = Math.max(budget - ecrits, 0);
    const part = servis.reduce((t, v, i) => t + (fige[i] ? 0 : v), 0);
    s = saisis.map((v, i) => (fige[i] ? v : part > 0 ? (servis[i] / part) * reste : 0));
  } else if (modele !== "spec") {
    // horloge fixe : les arrêts se retranchent du mouvement (garde-fou du moteur à la moitié)
    const total = s.reduce((t, v) => t + v, 0);
    const bouge = Math.max(horlogeMin - total, 0.5 * horlogeMin);
    const facteur = mouvementRapport > 0 ? bouge / mouvementRapport : 1;
    m = mouvement.map((v) => v * facteur);
  }

  let cumul = 0;
  const lignes = segments.map((seg, i) => {
    cumul += m[i];
    const ligne = { ...seg, mouvement: m[i], arret: s[i], cumul };
    cumul += s[i];
    return ligne;
  });
  const mouvementTotal = m.reduce((t, v) => t + v, 0);
  const arretsTotal = s.reduce((t, v) => t + v, 0);
  return {
    lignes,
    mouvementTotal,
    arretsTotal,
    arrivee: lignes.length ? lignes[lignes.length - 1].cumul : 0,
    // ce que l'athlète a demandé en plus (ou en moins) par rapport au plan du rapport
    ecart: arretsTotal - servis.reduce((t, v) => t + v, 0),
  };
}
