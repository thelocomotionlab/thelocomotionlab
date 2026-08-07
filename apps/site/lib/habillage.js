// lib/habillage.js
//
// L'habillage d'une photo de sortie au format STORY (1080×1920) : silhouette
// altimétrique ambrée, distance / D+ / D−, signature du labo.
//
// Tout ce qui se calcule sans canvas vit ici, et se teste : le cadrage de la
// photo, le tracé du profil, la ligne de chiffres. Le composant ne fait que
// poser ces résultats sur un contexte 2D.
//
// LA CONTRAINTE QUI COMMANDE LA MISE EN PAGE : Instagram recouvre le haut et le
// bas d'une story de sa propre interface (photo de profil et nom en haut ;
// légende, champ de réponse et flèches en bas). Tout ce qui compte doit tenir
// dans la bande centrale. C'est le défaut qui a fait abandonner l'habillage de
// Coros — profil et chiffres passaient sous l'interface.

export const STORY = { width: 1080, height: 1920 };

/**
 * Bande sûre : au-delà, Instagram pose son interface. Les valeurs sont
 * volontairement PRUDENTES (la hauteur réelle varie avec le modèle de
 * téléphone et l'encoche) — mieux vaut 60 px de marge perdue qu'un D+ coupé.
 */
export const ZONE_SURE = { top: 250, bottom: 1600 };

export const COULEURS = {
  ambre: "#EFB159",
  ambreSombre: "#D89A3D",
  creme: "#FEFBF6",
  /** Composantes du voile, à composer avec l'opacité voulue. */
  ombre: "16, 18, 14",
};

export const GABARIT = {
  pad: 72,
  /** Le voile part bien au-dessus du texte : une coupure franche se verrait. */
  voileDebut: 980,
  profil: { x: 72, y: 1275, width: 936, height: 175 },
  /** Filet qui sert de sol au profil — écho de la barre des cartes de partage. */
  sol: { hauteur: 4, ecart: 14 },
  stats: { taille: 44, baseline: 1538 },
  // Le bloc descend jusqu'à la limite basse de la zone sûre : plus haut, il
  // laissait 380 px de photo vide sous lui à l'export.
  marque: { taille: 21, baseline: 1596, espacement: 0.3 },
};

// La fonte Ubuntu n'a pas l'espace fine insécable (U+202F) que produit Intl
// fr-FR : le canvas dessinerait un carré blanc. Même normalisation que les
// cartes de partage.
const sansFines = (s) => String(s).replace(/[\u202F\u00A0\u2009\u2007]/g, " ");
const kmFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entierFmt = new Intl.NumberFormat("fr-FR");

export const formatKm = (n) => sansFines(kmFmt.format(Number.isFinite(n) ? n : 0));
export const formatEntier = (n) => sansFines(entierFmt.format(Math.round(Number.isFinite(n) ? n : 0)));

/** « 24,3 km · 2 400 m D+ · 2 509 m D− » — un séparateur seulement si utile. */
export function ligneDeStats({ distanceKm, dPlusM, dMinusM }) {
  const morceaux = [];
  if (Number.isFinite(distanceKm) && distanceKm > 0) morceaux.push(`${formatKm(distanceKm)} km`);
  if (Number.isFinite(dPlusM) && dPlusM > 0) morceaux.push(`${formatEntier(dPlusM)} m D+`);
  if (Number.isFinite(dMinusM) && dMinusM > 0) morceaux.push(`${formatEntier(dMinusM)} m D−`);
  return morceaux.join("  ·  ");
}

/**
 * Cadrage « couverture » : la photo remplit le cadre sans se déformer, et on
 * choisit QUELLE part garder quand elle déborde.
 *
 * `ancrage` ∈ [0,1] s'applique aux DEUX axes, et un seul bouge : celui qui a du
 * mou. En story (9:16), une photo horizontale est limitée par sa hauteur — il
 * n'y a rien à faire glisser verticalement, tout le débordement est latéral ;
 * une photo verticale, c'est l'inverse. Ne l'appliquer qu'à la verticale
 * rendait le curseur SANS EFFET sur une photo 4000×3000, cas le plus courant.
 */
export function cadrageCouverture(source, cadre, ancrage = 0.5) {
  const { width: sw, height: sh } = source;
  const { width: dw, height: dh } = cadre;
  if (!(sw > 0) || !(sh > 0) || !(dw > 0) || !(dh > 0)) return null;

  const a = Math.min(1, Math.max(0, Number.isFinite(ancrage) ? ancrage : 0.5));
  const echelle = Math.max(dw / sw, dh / sh);
  const visibleW = dw / echelle;
  const visibleH = dh / echelle;
  return {
    sx: (sw - visibleW) * a,
    sy: (sh - visibleH) * a,
    sw: visibleW,
    sh: visibleH,
    dx: 0,
    dy: 0,
    dw,
    dh,
  };
}

/**
 * Points du profil PROJETÉS dans une boîte, plus la ligne de sol. L'altitude
 * est étirée sur toute la hauteur : ce n'est pas une échelle, c'est une
 * silhouette — la même convention que le profil des cartes de partage.
 */
export function cheminDuProfil(profil, boite) {
  const points = (Array.isArray(profil) ? profil : []).filter(
    (p) => Number.isFinite(p?.km) && Number.isFinite(p?.alt),
  );
  if (points.length < 2) return null;

  const totalKm = points[points.length - 1].km;
  if (!(totalKm > 0)) return null;

  const alts = points.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const amplitude = Math.max(1, max - min);
  const base = boite.y + boite.height;

  return {
    base,
    min,
    max,
    points: points.map((p) => [
      boite.x + (Math.min(totalKm, Math.max(0, p.km)) / totalKm) * boite.width,
      boite.y + (1 - (p.alt - min) / amplitude) * boite.height,
    ]),
  };
}

/**
 * Texte à interlettrage imposé — `ctx.letterSpacing` n'existe pas partout
 * (Safari ne l'a que depuis 17.4).
 *
 * La TAILLE est passée en argument, jamais relue dans `ctx.font` : le
 * navigateur y renormalise la chaîne en « 500 21px … », et `parseFloat` en
 * tire **500** (la graisse). L'écart valait 150 px par lettre, le nom du labo
 * débordait de la story.
 */
export function dessinerTexteEspace(ctx, texte, x, y, taille, espacementEm) {
  const ecart = espacementEm * taille;
  let curseur = x;
  for (const lettre of texte) {
    ctx.fillText(lettre, curseur, y);
    curseur += ctx.measureText(lettre).width + ecart;
  }
  return curseur - x - ecart;
}

/**
 * Compose l'habillage sur un contexte 2D déjà dimensionné en 1080×1920.
 * `police` est la famille CSS à utiliser (celle de next/font, lue sur le DOM).
 */
export function dessinerHabillage(ctx, options) {
  const { image, profil, distanceKm, dPlusM, dMinusM, ancrage = 0.5, police = "sans-serif" } = options;
  const g = GABARIT;

  ctx.clearRect(0, 0, STORY.width, STORY.height);
  ctx.fillStyle = "#22241E";
  ctx.fillRect(0, 0, STORY.width, STORY.height);

  if (image) {
    const c = cadrageCouverture({ width: image.width, height: image.height }, STORY, ancrage);
    if (c) ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
  }

  // Voile : le texte doit rester lisible sur une photo de névé comme sur une
  // photo de sous-bois. Dégradé long, pour qu'aucune limite ne se devine.
  const voile = ctx.createLinearGradient(0, g.voileDebut, 0, STORY.height);
  voile.addColorStop(0, `rgba(${COULEURS.ombre}, 0)`);
  voile.addColorStop(0.35, `rgba(${COULEURS.ombre}, 0.30)`);
  voile.addColorStop(0.6, `rgba(${COULEURS.ombre}, 0.58)`);
  voile.addColorStop(0.85, `rgba(${COULEURS.ombre}, 0.72)`);
  voile.addColorStop(1, `rgba(${COULEURS.ombre}, 0.72)`);
  ctx.fillStyle = voile;
  ctx.fillRect(0, g.voileDebut, STORY.width, STORY.height - g.voileDebut);

  const chemin = cheminDuProfil(profil, g.profil);
  if (chemin) {
    ctx.beginPath();
    ctx.moveTo(chemin.points[0][0], chemin.base);
    for (const [x, y] of chemin.points) ctx.lineTo(x, y);
    ctx.lineTo(chemin.points[chemin.points.length - 1][0], chemin.base);
    ctx.closePath();
    ctx.fillStyle = "rgba(239, 177, 89, 0.85)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(chemin.points[0][0], chemin.points[0][1]);
    for (const [x, y] of chemin.points) ctx.lineTo(x, y);
    ctx.strokeStyle = COULEURS.ambreSombre;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Le sol : filet plein sous la silhouette, comme la barre des cartes.
    ctx.fillStyle = COULEURS.ambre;
    ctx.beginPath();
    ctx.roundRect(g.profil.x, chemin.base + g.sol.ecart, g.profil.width, g.sol.hauteur, g.sol.hauteur);
    ctx.fill();
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.font = `500 ${g.stats.taille}px ${police}`;
  ctx.fillStyle = COULEURS.creme;
  ctx.fillText(ligneDeStats({ distanceKm, dPlusM, dMinusM }), g.pad, g.stats.baseline);

  ctx.font = `500 ${g.marque.taille}px ${police}`;
  ctx.fillStyle = "rgba(254, 251, 246, 0.68)";
  dessinerTexteEspace(
    ctx,
    "THE LOCOMOTION LAB",
    g.pad,
    g.marque.baseline,
    g.marque.taille,
    g.marque.espacement,
  );
}
