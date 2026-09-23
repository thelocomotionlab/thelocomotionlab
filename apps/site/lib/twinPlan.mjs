// lib/twinPlan.mjs
//
// LA PAGE DE L'ATHLÈTE, sans l'écran : les heures, la nuit, ce qu'il a changé, et où son
// temps est tombé. Tout part de ce que le moteur a rendu (l'annexe de la version publiée) ;
// rien ici ne prédit quoi que ce soit.

/** Le décalage horaire d'un instant ISO, en minutes (« +02:00 » → 120). */
function decalageMinutes(iso) {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(String(iso || ""));
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** L'heure de passage `heures` après le départ, dans le fuseau de la course :
 *  « sam. 20h33 ». */
export function heureApres(isoDepart, heures) {
  if (!isoDepart || heures === null || heures === undefined) return "";
  const depart = new Date(isoDepart);
  if (Number.isNaN(depart.getTime())) return "";
  const local = new Date(depart.getTime() + (Number(heures) * 60 + decalageMinutes(isoDepart)) * 60_000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return `${JOURS[local.getUTCDay()]} ${hh}h${mm}`;
}

/** « 19h24 » → 1164 minutes depuis minuit. */
function minutesDe(horloge) {
  const m = /^(\d{1,2})\s*h\s*(\d{2})$/.exec(String(horloge || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Les nuits de la course, en kilomètres : là où la trame bleu-vert se pose sur le profil.
 *
 * Le moteur rend l'heure du coucher et du lever (`plan.sun`) et, pour chaque segment, le
 * temps cumulé à son arrivée. Une nuit va du coucher au lever du lendemain ; ses bornes
 * en heures depuis le départ se ramènent en kilomètres en suivant le plan central.
 */
export function nuitsEnKm({ depart, sun, segments, totalH }) {
  const coucher = minutesDe(sun?.sunset);
  const lever = minutesDe(sun?.sunrise);
  if (!depart || coucher === null || lever === null || !segments?.length) return [];
  const debut = new Date(depart);
  if (Number.isNaN(debut.getTime())) return [];
  // minutes locales du départ depuis le minuit de son jour
  const local = new Date(debut.getTime() + decalageMinutes(depart) * 60_000);
  const departMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const fin = (totalH ?? segments[segments.length - 1].cum_clock_h) * 60;

  // points (minutes depuis le départ → km), du départ à l'arrivée
  const points = [[0, 0], ...segments.map((s) => [s.cum_clock_h * 60, s.off1])];
  const kmA = (minutes) => {
    for (let i = 1; i < points.length; i += 1) {
      const [t1, k1] = points[i];
      if (t1 >= minutes) {
        const [t0, k0] = points[i - 1];
        return t1 === t0 ? k1 : k0 + ((k1 - k0) * (minutes - t0)) / (t1 - t0);
      }
    }
    return points[points.length - 1][1];
  };

  const nuits = [];
  // la nuit qui précède le départ (départ avant le lever), puis une par jour de course
  for (let jour = -1; jour * 1440 < fin + departMin; jour += 1) {
    const du = jour * 1440 + coucher - departMin;
    const au = (jour + 1) * 1440 + lever - departMin;
    const a = Math.max(du, 0);
    const b = Math.min(au, fin);
    if (b > a) nuits.push({ du_km: kmA(a), au_km: kmA(b) });
  }
  return nuits;
}

/**
 * Ce que l'athlète a VRAIMENT changé, prêt à partir au moteur.
 *
 * `affiche` : ce que la page montrait à l'ouverture ; `saisi` : ce qu'il y a dans les
 * champs ; `precedents` : ses amendements déjà enregistrés. Un amendement ne se crée que
 * sur un champ modifié — sans quoi ouvrir la page et renvoyer figerait toutes les valeurs
 * du plan comme les siennes. Un champ vidé retire l'amendement : la valeur du plan revient.
 */
export function amendementsDuFormulaire(affiche, saisi, precedents = {}) {
  const fusion = (champ, lire) => {
    const sortie = {};
    const cles = new Set([...Object.keys(saisi[champ] ?? {}), ...Object.keys(precedents[champ] ?? {})]);
    for (const cle of cles) {
      const valeur = (saisi[champ] ?? {})[cle];
      const avant = (affiche[champ] ?? {})[cle];
      const vide = valeur === undefined || valeur === null || String(valeur).trim() === "";
      if (vide) continue; // vidé : on rend la main au plan
      const lu = lire(valeur);
      if (lu === null) continue;
      const change = String(valeur).trim() !== String(avant ?? "").trim();
      if (change || cle in (precedents[champ] ?? {})) sortie[cle] = lu;
    }
    return sortie;
  };
  const nombreOuNul = (v) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const eau = saisi.nutrition?.eau_l_h;
  const glucides = saisi.nutrition?.glucides_g_h;
  return {
    arrets: fusion("arrets", nombreOuNul),
    notes: fusion("notes", (v) => String(v).trim()),
    nutrition: {
      eau_l_h: eau === "" || eau === undefined || eau === null ? null : nombreOuNul(eau),
      glucides_g_h:
        glucides === "" || glucides === undefined || glucides === null ? null : nombreOuNul(glucides),
    },
  };
}

/** Où le réel est tombé, en mots : dans la fourchette, dans les bornes, ou dehors. */
export function placeDuReel(reelH, fourchette, bornes) {
  if (reelH === null || reelH === undefined) return "";
  const [f1, f2] = fourchette ?? [];
  const [b1, b2] = bornes ?? [];
  if (f1 !== undefined && reelH >= f1 && reelH <= f2) return "dans la fourchette de course";
  if (b1 !== undefined && reelH >= b1 && reelH <= b2) {
    return reelH < f1 ? "plus rapide que la fourchette, dans les bornes" : "plus lent que la fourchette, dans les bornes";
  }
  return reelH < (b1 ?? reelH) ? "plus rapide que les bornes de sécurité" : "au-delà des bornes de sécurité";
}

/**
 * Une fenêtre d'objectif « entre 29 h et 31 h » : la cible au milieu, la tolérance en
 * demi-largeur relative — ce que le moteur lit (30 h, ±3,33 % du temps cumulé).
 */
export function cibleDeLaFenetre(debutH, finH) {
  if (!(debutH > 0) || !(finH > debutH)) return null;
  return { cible_h: (debutH + finH) / 2, tolerance_pct: (100 * (finH - debutH)) / (finH + debutH) };
}

/** Et l'inverse : l'arrivée au plus tôt et au plus tard qu'une cible et sa tolérance donnent. */
export function fenetreDeLaCible(cibleH, tolerancePct) {
  if (!(cibleH > 0) || tolerancePct === null || tolerancePct === undefined) return null;
  return { debut_h: cibleH * (1 - tolerancePct / 100), fin_h: cibleH * (1 + tolerancePct / 100) };
}
