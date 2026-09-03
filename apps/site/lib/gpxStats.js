// lib/gpxStats.js
//
// Lecture d'un GPX de MONTRE (export Coros, Garmin…) et statistiques de la
// sortie : distance, D+, D−, silhouette du profil. Sert à l'outil d'habillage
// de photos (/studio), entièrement côté navigateur.
//
// POURQUOI UN PARSEUR MAISON plutôt que `@tmcw/togeojson` (déjà dans le dépôt) :
// togeojson ne rend que la géométrie, or le fichier porte une donnée qu'on ne
// veut surtout pas jeter — `<gpxdata:distance>`, la distance CUMULÉE mesurée
// par la montre. Elle vaut mieux que tout ce qu'on peut recalculer : sur la
// Croix de Belledonne, la montre annonce 24,26 km quand la somme des segments
// de sa PROPRE trace n'en donne que 22,86. L'écart n'est pas une erreur, c'est
// la méthode de la montre (intégration à la seconde) ; c'est aussi le chiffre
// que Valentin voit, et donc celui qu'il veut publier.
//
// Le parseur travaille sur une CHAÎNE, sans DOM : le même code tourne dans le
// navigateur et sous les tests. 21 000 points lus en ~150 ms.

const R = 6_371_000;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const BLOC = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
const ATTR = (nom) => new RegExp(`\\b${nom}\\s*=\\s*["']([^"']+)["']`);
const ELE = /<ele>\s*([-\d.eE+]+)\s*<\/ele>/;
const TIME = /<time>\s*([^<\s]+)\s*<\/time>/;
// `gpxdata:distance` chez Coros, `distance` ailleurs : on accepte tout préfixe.
const DIST = /<(?:\w+:)?distance>\s*([\d.eE+]+)\s*<\/(?:\w+:)?distance>/;
const NOM = /<trk>[\s\S]*?<name>\s*([^<]*?)\s*<\/name>/;

/**
 * @param {string} xml
 * @returns {{ nom: string|null, points: Array<{lat:number,lon:number,alt:number|null,tMs:number|null,dist:number|null}> }}
 */
export function parseGpx(xml) {
  const texte = typeof xml === "string" ? xml : "";
  const points = [];
  BLOC.lastIndex = 0;
  let m;
  while ((m = BLOC.exec(texte)) !== null) {
    const attrs = m[1] ?? "";
    const corps = m[2] ?? "";
    const lat = Number.parseFloat(attrs.match(ATTR("lat"))?.[1] ?? "");
    const lon = Number.parseFloat(attrs.match(ATTR("lon"))?.[1] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const alt = Number.parseFloat(corps.match(ELE)?.[1] ?? "");
    const tMs = Date.parse(corps.match(TIME)?.[1] ?? "");
    const dist = Number.parseFloat(corps.match(DIST)?.[1] ?? "");
    points.push({
      lat,
      lon,
      alt: Number.isFinite(alt) ? alt : null,
      tMs: Number.isFinite(tMs) ? tMs : null,
      dist: Number.isFinite(dist) ? dist : null,
    });
  }
  return { nom: texte.match(NOM)?.[1] || null, points };
}

/** Moyenne glissante — écrête le tremblement de l'altimètre sans le décaler. */
export function moyenneGlissante(valeurs, fenetre) {
  if (!(fenetre > 1)) return valeurs.slice();
  const demi = Math.floor(fenetre / 2);
  const out = new Array(valeurs.length);
  for (let i = 0; i < valeurs.length; i += 1) {
    let somme = 0;
    let n = 0;
    for (let j = Math.max(0, i - demi); j <= Math.min(valeurs.length - 1, i + demi); j += 1) {
      somme += valeurs[j];
      n += 1;
    }
    out[i] = somme / n;
  }
  return out;
}

/**
 * D+ / D− par hystérésis : on n'accumule qu'au-delà de `seuil` mètres d'écart à
 * une référence mobile. Même principe que le back live-tracking
 * (services/tracking-cache/src/compute.ts) — duplication assumée : le site est
 * en JS/ESM, le service en TS/CJS, et toute évolution se fait des deux côtés.
 *
 * Le SEUIL est plus bas ici (3 m contre 5) parce que la source n'est pas la
 * même : une montre exporte une altitude BAROMÉTRIQUE, déjà stable, là où le
 * tracker envoie une altitude GNSS qui oscille en permanence. Filtrer aussi
 * fort mangerait du relief réel.
 */
export function denivele(altitudes, seuil = 3) {
  const { dPlus, dMinus } = deniveleCumule(altitudes, seuil);
  return { dPlus, dMinus };
}

/**
 * Même hystérésis, mais en gardant le CUMUL à chaque point : c'est ce que le
 * profil altimétrique affiche au survol (« D+ accumulé ici »). `cumul[i]` vaut
 * { dp, dm } au point i ; les totaux sont ceux du dernier point.
 */
export function deniveleCumule(altitudes, seuil = 3) {
  const cumul = new Array(altitudes.length);
  if (altitudes.length < 2) {
    cumul.fill({ dp: 0, dm: 0 });
    return { dPlus: 0, dMinus: 0, cumul };
  }
  let dPlus = 0;
  let dMinus = 0;
  let ref = altitudes[0];
  cumul[0] = { dp: 0, dm: 0 };
  for (let i = 1; i < altitudes.length; i += 1) {
    const ecart = altitudes[i] - ref;
    if (ecart >= seuil) {
      dPlus += ecart;
      ref = altitudes[i];
    } else if (ecart <= -seuil) {
      dMinus += -ecart;
      ref = altitudes[i];
    }
    cumul[i] = { dp: dPlus, dm: dMinus };
  }
  return { dPlus, dMinus, cumul };
}

/** Réduit la silhouette à ~`cible` points : au-delà, le tracé ne gagne rien. */
export function decimerProfil(profil, cible = 400) {
  if (profil.length <= cible) return profil;
  const pas = profil.length / cible;
  const out = [];
  for (let i = 0; i < cible; i += 1) out.push(profil[Math.floor(i * pas)]);
  out.push(profil[profil.length - 1]);
  return out;
}

/**
 * Statistiques prêtes à afficher.
 *
 * @returns {{
 *   nom: string|null, distanceKm: number, dPlusM: number, dMinusM: number,
 *   dureeSecondes: number|null, debutMs: number|null,
 *   profil: Array<{km:number,alt:number}>,
 *   distanceSource: "montre"|"geometrie"
 * } | null} — `null` si le fichier n'est pas une trace exploitable.
 */
export function statsDeGpx(xml, options = {}) {
  const { points, nom } = parseGpx(xml);
  if (points.length < 2) return null;

  // Distance : celle de la montre si le fichier la porte (elle fait foi), la
  // géométrie sinon. On garde la SOURCE pour pouvoir le dire à l'utilisateur.
  let cumule = new Array(points.length).fill(0);
  const dernierDuFichier = points[points.length - 1].dist;
  let distanceSource = "geometrie";
  if (Number.isFinite(dernierDuFichier) && dernierDuFichier > 0) {
    distanceSource = "montre";
    let precedent = 0;
    for (let i = 0; i < points.length; i += 1) {
      // Une distance qui recule est aberrante : on garde la dernière valide.
      const d = Number.isFinite(points[i].dist) ? points[i].dist : precedent;
      precedent = d >= precedent ? d : precedent;
      cumule[i] = precedent;
    }
  } else {
    for (let i = 1; i < points.length; i += 1) {
      cumule[i] = cumule[i - 1] + haversine(points[i - 1], points[i]);
    }
  }

  const avecAlt = points.filter((p) => p.alt !== null);
  const altitudes = avecAlt.map((p) => p.alt);
  const { dPlus, dMinus } =
    altitudes.length > 1
      ? denivele(moyenneGlissante(altitudes, options.lissage ?? 5), options.seuil ?? 3)
      : { dPlus: 0, dMinus: 0 };

  const totalM = cumule[cumule.length - 1];
  const profil = decimerProfil(
    points
      .map((p, i) => ({ km: cumule[i] / 1000, alt: p.alt }))
      .filter((p) => p.alt !== null),
  );

  const t0 = points.find((p) => p.tMs !== null)?.tMs ?? null;
  const t1 = [...points].reverse().find((p) => p.tMs !== null)?.tMs ?? null;

  return {
    nom,
    distanceKm: totalM / 1000,
    dPlusM: Math.round(dPlus),
    dMinusM: Math.round(dMinus),
    dureeSecondes: t0 !== null && t1 !== null && t1 > t0 ? Math.round((t1 - t0) / 1000) : null,
    // L'instant du DÉPART, pour l'en-tête de l'habillage « Chiffres » : c'est
    // la première chose qu'affiche une montre, et la seule qu'on ne peut pas
    // retrouver ailleurs une fois la photo choisie.
    debutMs: t0,
    profil,
    distanceSource,
  };
}

/**
 * La trace de référence d'une carte GPX posée dans un récit, calculée dans le
 * navigateur au format que le direct lit dans un .track.json : totaux, bornes,
 * et un profil de ~400 points portant km, altitude, lat/lng (pour le point
 * jumeau sur la carte au survol) et D+/D− accumulés. Même distance et même
 * dénivelé que statsDeGpx — c'est le même code.
 *
 * @returns {{ totalKm:number, dPlusM:number, dMinusM:number, elevMinM:number,
 *   elevMaxM:number, profile:Array<{km:number,alt:number,lat:number,lng:number,dp:number,dm:number}> } | null}
 */
export function profilDeGpx(xml, options = {}) {
  const { points } = parseGpx(xml);
  if (points.length < 2) return null;

  const cumule = new Array(points.length).fill(0);
  const dernierDuFichier = points[points.length - 1].dist;
  if (Number.isFinite(dernierDuFichier) && dernierDuFichier > 0) {
    let precedent = 0;
    for (let i = 0; i < points.length; i += 1) {
      const d = Number.isFinite(points[i].dist) ? points[i].dist : precedent;
      precedent = d >= precedent ? d : precedent;
      cumule[i] = precedent;
    }
  } else {
    for (let i = 1; i < points.length; i += 1) {
      cumule[i] = cumule[i - 1] + haversine(points[i - 1], points[i]);
    }
  }

  const avecAlt = [];
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].alt !== null) avecAlt.push({ p: points[i], km: cumule[i] / 1000 });
  }
  if (avecAlt.length < 2) return null;

  const lisses = moyenneGlissante(avecAlt.map((x) => x.p.alt), options.lissage ?? 5);
  const { dPlus, dMinus, cumul } = deniveleCumule(lisses, options.seuil ?? 3);

  let elevMin = Infinity;
  let elevMax = -Infinity;
  for (const a of lisses) {
    if (a < elevMin) elevMin = a;
    if (a > elevMax) elevMax = a;
  }

  const complet = avecAlt.map(({ p, km }, i) => ({
    km: Number(km.toFixed(2)),
    alt: Math.round(lisses[i]),
    lat: Number(p.lat.toFixed(5)),
    lng: Number(p.lon.toFixed(5)),
    dp: Math.round(cumul[i].dp),
    dm: Math.round(cumul[i].dm),
  }));

  return {
    totalKm: Number((cumule[cumule.length - 1] / 1000).toFixed(2)),
    dPlusM: Math.round(dPlus),
    dMinusM: Math.round(dMinus),
    elevMinM: Math.round(elevMin),
    elevMaxM: Math.round(elevMax),
    profile: decimerProfil(complet, options.points ?? 400),
  };
}
