// lib/progression.js
//
// AVANCEMENT LE LONG DE LA TRACE, par projection.
//
// Le pourcentage de la page /live valait « distance parcourue / distance
// prévue ». C'est faux dès qu'on s'écarte du tracé : un aller-retour au
// ravitaillement, un col manqué qu'on remonte, une boucle d'échauffement — tout
// ça gonfle le numérateur sans faire avancer d'un mètre sur le parcours. On
// atteint 100 % avant l'arrivée (le clamp masquait le symptôme, pas la cause),
// et le curseur du profil altimétrique court devant le coureur.
//
// On mesure donc l'avancement RÉEL : on projette les positions vécues sur la
// polyligne de référence et on retient le point le plus loin atteint.
//
// Quatre garde-fous, chacun pour un piège de terrain :
//   • recherche vers l'AVANT seulement → sur un aller-retour, le retour ne se
//     recolle pas au début de la trace ;
//   • tolérance d'écart → hors du tracé (détour, erreur GPS), on n'avance plus
//     du tout plutôt que de s'accrocher à un point arbitraire ;
//   • plafond de VITESSE → entre deux positions, on ne peut pas avancer sur le
//     parcours plus vite qu'un humain ne court. Sans lui, sur un parcours EN
//     BOUCLE, un détour qui passe près d'une portion ultérieure du tracé y
//     téléporte le curseur (mesuré sur la trace de Chartreuse : un détour de
//     3 km faisait sauter l'avancement de 5 points). La borne est TEMPORELLE et
//     non kilométrique : une borne en distance décrochait après chaque trou de
//     données, parce qu'entre deux points espacés le tracé serpente bien plus
//     que la ligne droite. Le temps, lui, ne ment pas — et un retour de zone
//     blanche d'une heure ouvre naturellement le budget nécessaire ;
//   • maximum monotone → l'avancement ne redescend jamais.

const R = 6_371_000;
const toRad = (deg) => (deg * Math.PI) / 180;
const M_PAR_DEGRE = 111_320; // longueur d'un degré de latitude

function haversine([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Écart approché au carré, en degrés². Suffisant pour COMPARER des candidats
 * (on ne cherche pas une distance, seulement le plus proche) et bien moins cher
 * qu'un haversine : cette fonction tourne des centaines de milliers de fois.
 */
function ecart2(a, b) {
  const dLon = (a[0] - b[0]) * Math.cos(toRad(b[1]));
  const dLat = a[1] - b[1];
  return dLon * dLon + dLat * dLat;
}

/**
 * Accepte indifféremment des paires [lon, lat] et les points du profil
 * (`{ longitude, latitude, fixTime }`) : le second porte l'horodatage, qui
 * active le plafond de vitesse.
 */
function normaliser(p) {
  if (Array.isArray(p)) {
    return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { lonlat: p, tMs: NaN } : null;
  }
  if (!p || !Number.isFinite(p.longitude) || !Number.isFinite(p.latitude)) return null;
  return { lonlat: [p.longitude, p.latitude], tMs: Date.parse(p.fixTime ?? "") };
}

/** Distances cumulées le long d'une polyligne, en mètres. */
export function cumulDistances(coords) {
  const cum = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i += 1) {
    cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
  }
  return cum;
}

/**
 * Projette la trace vécue sur la trace prévue.
 *
 * @param {Array<[number,number]>} referenceCoords — polyligne prévue, [lon, lat].
 * @param {Array<[number,number]|{longitude:number,latitude:number,fixTime?:string}>} vecu
 *   — positions vécues, dans l'ordre chronologique.
 * @param {{ toleranceM?: number, lookahead?: number, maxPoints?: number,
 *           vitesseMaxKmH?: number, plancherAvanceM?: number }} options
 * @returns {{ metresParcourus: number, metresTotal: number, pourcent: number } | null}
 *   null si l'un des deux jeux manque — l'appelant retombe alors sur l'ancien
 *   calcul (distance parcourue), qui vaut mieux que rien.
 */
export function avancementSurTrace(referenceCoords, vecu, options = {}) {
  if (!Array.isArray(referenceCoords) || referenceCoords.length < 2) return null;

  // Le GPX peut avoir été enregistré dans l'autre sens que celui parcouru — sur
  // une BOUCLE, c'est même une chance sur deux. La recherche ne va que vers
  // l'avant : à contresens, le curseur ne trouve plus rien et reste au départ
  // (constaté aux Vouillands le 5 août 2026 : 1,4 % affichés pour une boucle
  // pourtant bouclée).
  //
  // On DÉTERMINE donc le sens avant de projeter, plutôt que d'essayer les deux
  // et de garder le meilleur score : sur un parcours qui repasse près de
  // lui-même, l'orientation inverse peut accrocher le départ à l'arrivée et
  // annoncer 100 % sans que personne n'ait bougé.
  const sens = sensDeParcours(referenceCoords, vecu);
  return projeter(sens < 0 ? [...referenceCoords].reverse() : referenceCoords, vecu, options);
}

/**
 * Sens de parcours du vécu par rapport au GPX : +1 dans le sens du fichier,
 * −1 à contresens.
 *
 * On projette un ÉCHANTILLON de positions sur le sommet le plus proche, sans
 * aucune contrainte, et on regarde si la suite des indices monte ou descend.
 * C'est la seule question à trancher ici, et elle se lit directement dans la
 * donnée. L'échantillonnage rend la recherche exhaustive abordable (quelques
 * dizaines de points × la longueur du tracé).
 */
function sensDeParcours(referenceCoords, vecu, echantillons = 60) {
  const pas = Math.max(1, Math.ceil(vecu.length / echantillons));
  const indices = [];
  for (let i = 0; i < vecu.length; i += pas) {
    const p = normaliser(vecu[i]);
    if (!p) continue;
    let meilleur = 0;
    let meilleurEcart = Infinity;
    for (let j = 0; j < referenceCoords.length; j += 1) {
      const e = ecart2(p.lonlat, referenceCoords[j]);
      if (e < meilleurEcart) {
        meilleurEcart = e;
        meilleur = j;
      }
    }
    indices.push(meilleur);
  }

  let montees = 0;
  let descentes = 0;
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] > indices[i - 1]) montees += 1;
    else if (indices[i] < indices[i - 1]) descentes += 1;
  }
  // Égalité ou données trop maigres : on garde le sens du fichier.
  return descentes > montees ? -1 : 1;
}

function projeter(referenceCoords, vecu, options = {}) {
  const {
    // 150 m : mesuré comme le meilleur compromis sur la trace de Chartreuse.
    // Au-dessus (400 m), un détour qui longe une portion ultérieure du tracé y
    // recolle le curseur ; en dessous (80 m), on frôle le décrochage sur une
    // erreur GPS de forêt ou de canyon, et sur le décalage propre au GPX de
    // référence. Vérifié sans perte sur une trace bruitée à ±25 m.
    toleranceM = 150,
    lookahead = 250,
    maxPoints = 3000,
    // Plafond d'allure : au-delà, ce n'est plus un coureur. Généreux exprès —
    // il ne sert qu'à interdire les sauts absurdes, pas à juger la performance.
    vitesseMaxKmH = 20,
    // Tolérance de base, pour que deux fix rapprochés puissent tout de même
    // progresser malgré le bruit GPS et la simplification de la polyligne.
    plancherAvanceM = 100,
  } = options;

  if (!Array.isArray(referenceCoords) || referenceCoords.length < 2) return null;
  if (!Array.isArray(vecu) || vecu.length === 0) return null;

  const cum = cumulDistances(referenceCoords);
  const metresTotal = cum[cum.length - 1];
  if (!(metresTotal > 0)) return null;

  const tolerance2 = (toleranceM / M_PAR_DEGRE) ** 2;
  const vitesseMaxMS = (vitesseMaxKmH * 1000) / 3600;

  // Sur une aventure de plusieurs jours, la trace vécue compte des dizaines de
  // milliers de points. Chercher le point LE PLUS LOIN atteint ne demande pas
  // de tous les projeter — mais le dernier est toujours examiné, c'est lui qui
  // porte l'avancement courant.
  const pas = Math.max(1, Math.ceil(vecu.length / maxPoints));

  let refIdx = 0;
  let metresParcourus = 0;
  let precedentTMs = NaN;
  let premier = true;

  const examiner = ({ lonlat, tMs }) => {
    // Budget d'avancement depuis le point précédent. Sans horodatage
    // exploitable, pas de plafond (on se repose sur la tolérance et le sens
    // unique de la recherche).
    let avanceMax = Infinity;
    if (!premier && Number.isFinite(tMs) && Number.isFinite(precedentTMs)) {
      const dtSec = Math.max(0, (tMs - precedentTMs) / 1000);
      avanceMax = cum[refIdx] + dtSec * vitesseMaxMS + plancherAvanceM;
    }
    premier = false;
    if (Number.isFinite(tMs)) precedentTMs = tMs;

    let meilleurIdx = refIdx;
    let meilleurEcart = ecart2(lonlat, referenceCoords[refIdx]);
    const limite = Math.min(referenceCoords.length - 1, refIdx + lookahead);
    for (let j = refIdx + 1; j <= limite; j += 1) {
      if (cum[j] > avanceMax) break; // au-delà, l'avancée serait impossible
      const e = ecart2(lonlat, referenceCoords[j]);
      if (e < meilleurEcart) {
        meilleurEcart = e;
        meilleurIdx = j;
      }
    }
    // Hors tolérance = hors trace : on ne bouge pas le curseur.
    if (meilleurEcart > tolerance2) return;
    refIdx = meilleurIdx;
    if (cum[meilleurIdx] > metresParcourus) metresParcourus = cum[meilleurIdx];
  };

  const dernierIdx = vecu.length - 1;
  for (let i = 0; i <= dernierIdx; i += 1) {
    if (i % pas !== 0 && i !== dernierIdx) continue;
    const p = normaliser(vecu[i]);
    if (p) examiner(p);
  }

  return {
    metresParcourus,
    metresTotal,
    pourcent: Math.min(100, Math.max(0, (metresParcourus / metresTotal) * 100)),
  };
}
