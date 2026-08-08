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
  creme: "#FEFBF6",
  /** Composantes du voile, à composer avec l'opacité voulue. */
  ombre: "16, 18, 14",
};

/**
 * L'aire du profil est PLUS TRANSPARENTE ici que sur les cartes de partage
 * (0,46 là-bas, relevé sur la maquette). Le fond n'est pas le même : une carte
 * topo voilée supporte un aplat ; une photo, non — elle porte le sujet, et le
 * profil doit se lire par-dessus sans l'effacer. La ligne de crête reste
 * presque pleine : c'est elle qui donne la forme, l'aire ne fait que l'asseoir.
 */
export const PROFIL_OPACITE = { aire: 0.3, crete: 0.92 };

export const GABARIT = {
  pad: 72,
  /** Le voile part bien au-dessus du texte : une coupure franche se verrait. */
  voileDebut: 980,
  // PLEINE LARGEUR, sans marge : le profil fait partie de l'image, il n'est pas
  // un encart posé dessus. C'est la silhouette de l'ancien habillage Coros.
  profil: { x: 0, y: 1205, width: STORY.width, height: 215 },
  /**
   * Le remplissage s'efface sur le dernier tiers, au lieu de s'arrêter net sur
   * une base plate. Chez Coros la base tombait hors du cadre, donc invisible ;
   * ici elle doit rester dans la zone sûre — un aplat s'y terminerait par une
   * barre horizontale en travers de la photo, exactement le trait dont on ne
   * veut pas.
   */
  fondu: 0.34,
  stats: { taille: 44, baseline: 1505 },
  // Le bloc descend jusqu'à la limite basse de la zone sûre : plus haut, il
  // laissait 380 px de photo vide sous lui à l'export.
  //
  // `logo` : la marque du labo, à GAUCHE du nom, en verrou avec lui.
  //   • taille — côté du carré. 38 px pour un nom à 21 px : la marque se
  //              remarque sans prendre le pas sur les chiffres, qui restent
  //              l'information de l'image.
  //   • ecart  — blanc entre la marque et la première lettre.
  marque: { taille: 21, baseline: 1566, espacement: 0.3, logo: { taille: 38, ecart: 16 } },
};

/**
 * Part de la taille du texte séparant la ligne de base du CENTRE OPTIQUE des
 * capitales. La hauteur de capitale d'Ubuntu vaut ~0,70 em ; son milieu est
 * donc à ~0,35 em au-dessus de la ligne de base. Aligner la marque sur la
 * ligne de base elle-même la ferait pendre sous le nom.
 */
export const CENTRE_CAPITALES = 0.35;

/** Le logo est teinté à la couleur du nom : même encre, même présence. */
export const MARQUE_OPACITE = 0.68;

// La fonte Ubuntu n'a pas l'espace fine insécable (U+202F) que produit Intl
// fr-FR : le canvas dessinerait un carré blanc. Même normalisation que les
// cartes de partage.
const sansFines = (s) => String(s).replace(/[\u202F\u00A0\u2009\u2007]/g, " ");
const kmFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entierFmt = new Intl.NumberFormat("fr-FR");

export const formatKm = (n) => sansFines(kmFmt.format(Number.isFinite(n) ? n : 0));
export const formatEntier = (n) => sansFines(entierFmt.format(Math.round(Number.isFinite(n) ? n : 0)));

export const SEPARATEUR = "  ·  ";

/**
 * La ligne de chiffres, DÉCOUPÉE : chaque morceau porte son texte et, pour le
 * dénivelé, le sens de sa flèche.
 *
 * Les flèches sont DESSINÉES, pas écrites : les fontes du site sont des
 * sous-ensembles latins (packages/ui/src/fonts.ts) et ne contiennent pas
 * U+2191/U+2193 — un caractère de flèche sortirait en carré blanc.
 */
export function segmentsDeStats({ distanceKm, dPlusM, dMinusM }) {
  const out = [];
  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    out.push({ texte: `${formatKm(distanceKm)} km`, fleche: null });
  }
  if (Number.isFinite(dPlusM) && dPlusM > 0) {
    out.push({ texte: `${formatEntier(dPlusM)} m D+`, fleche: "haut" });
  }
  if (Number.isFinite(dMinusM) && dMinusM > 0) {
    out.push({ texte: `${formatEntier(dMinusM)} m D−`, fleche: "bas" });
  }
  return out;
}

/** « 24,3 km · 2 400 m D+ · 2 509 m D− » — le texte seul, flèches exclues. */
export function ligneDeStats(valeurs) {
  return segmentsDeStats(valeurs)
    .map((s) => s.texte)
    .join(SEPARATEUR);
}

/**
 * Petite flèche verticale, tracée à la main. `x` est son bord gauche, `baseline`
 * la ligne de base du texte qu'elle accompagne.
 */
export function dessinerFleche(ctx, x, baseline, taille, sens) {
  const h = taille * 0.78;
  const l = taille * 0.34;
  const cx = x + l / 2;
  const haut = baseline - h;
  const bas = baseline - taille * 0.06;
  const pointe = sens === "bas" ? bas : haut;
  const talon = sens === "bas" ? haut : bas;

  ctx.beginPath();
  ctx.moveTo(cx, talon);
  ctx.lineTo(cx, pointe);
  ctx.moveTo(cx - l / 2, pointe + (sens === "bas" ? -l / 2 : l / 2));
  ctx.lineTo(cx, pointe);
  ctx.lineTo(cx + l / 2, pointe + (sens === "bas" ? -l / 2 : l / 2));
  ctx.lineWidth = Math.max(2, taille * 0.075);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  return l;
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
 * Points du profil PROJETÉS dans une boîte, plus l'ordonnée de base. L'altitude
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
 * Boîte du carré du logo, pour une ligne de base de nom donnée. Isolée pour
 * être vérifiable sans canvas : c'est elle qui garantit que la marque ne
 * déborde pas sous l'interface d'Instagram.
 */
export function boiteDuLogo(x = GABARIT.pad) {
  const { taille } = GABARIT.marque.logo;
  const centre = GABARIT.marque.baseline - GABARIT.marque.taille * CENTRE_CAPITALES;
  return { x, y: centre - taille / 2, taille };
}

/**
 * Compose l'habillage sur un contexte 2D déjà dimensionné en 1080×1920.
 * `police` est la famille CSS à utiliser (celle de next/font, lue sur le DOM).
 * `logo` est la marque DÉJÀ TEINTÉE (cf. HabillagePhoto) ; absente, le nom
 * seul est dessiné, comme avant — l'habillage ne dépend pas de son chargement.
 */
export function dessinerHabillage(ctx, options) {
  const {
    image,
    profil,
    distanceKm,
    dPlusM,
    dMinusM,
    ancrage = 0.5,
    police = "sans-serif",
    logo = null,
  } = options;
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
    // Remplissage qui s'efface vers le bas : aucune barre horizontale ne vient
    // fermer la silhouette (cf. GABARIT.fondu).
    const degrade = ctx.createLinearGradient(0, g.profil.y, 0, chemin.base);
    degrade.addColorStop(0, `rgba(239, 177, 89, ${PROFIL_OPACITE.aire})`);
    degrade.addColorStop(1 - g.fondu, `rgba(239, 177, 89, ${PROFIL_OPACITE.aire})`);
    degrade.addColorStop(1, "rgba(239, 177, 89, 0)");
    ctx.fillStyle = degrade;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(chemin.points[0][0], chemin.points[0][1]);
    for (const [x, y] of chemin.points) ctx.lineTo(x, y);
    ctx.strokeStyle = COULEURS.ambre;
    ctx.globalAlpha = PROFIL_OPACITE.crete;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.font = `500 ${g.stats.taille}px ${police}`;
  ctx.fillStyle = COULEURS.creme;
  ctx.strokeStyle = COULEURS.creme;
  let curseur = g.pad;
  for (const [i, seg] of segmentsDeStats({ distanceKm, dPlusM, dMinusM }).entries()) {
    if (i > 0) {
      ctx.fillText(SEPARATEUR, curseur, g.stats.baseline);
      curseur += ctx.measureText(SEPARATEUR).width;
    }
    ctx.fillText(seg.texte, curseur, g.stats.baseline);
    curseur += ctx.measureText(seg.texte).width;
    if (seg.fleche) {
      // La flèche respire : collée au « + », elle se lisait comme un caractère
      // de plus dans le nombre.
      curseur += g.stats.taille * 0.26;
      curseur += dessinerFleche(ctx, curseur, g.stats.baseline, g.stats.taille, seg.fleche);
    }
  }

  // Signature : la marque puis le nom, en verrou. Le logo est posé à la même
  // opacité que le texte — une empreinte plus contrastée que son propre nom
  // tirerait l'œil vers le coin de l'image au lieu des chiffres.
  let marqueX = g.pad;
  if (logo) {
    const boite = boiteDuLogo(g.pad);
    ctx.globalAlpha = MARQUE_OPACITE;
    ctx.drawImage(logo, boite.x, boite.y, boite.taille, boite.taille);
    ctx.globalAlpha = 1;
    marqueX = boite.x + boite.taille + g.marque.logo.ecart;
  }

  ctx.font = `500 ${g.marque.taille}px ${police}`;
  ctx.fillStyle = `rgba(254, 251, 246, ${MARQUE_OPACITE})`;
  dessinerTexteEspace(
    ctx,
    "THE LOCOMOTION LAB",
    marqueX,
    g.marque.baseline,
    g.marque.taille,
    g.marque.espacement,
  );
}
