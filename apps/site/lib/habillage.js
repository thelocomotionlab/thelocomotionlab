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
//
// DEUX HABILLAGES, DEUX FORMATS. « Silhouette » (le relief en bandeau) et
// « Chiffres » (la distance en très grand, la grammaire des écrans de montre),
// chacun en story ou en publication. La géométrie est ANCRÉE sur la zone sûre :
// changer de format ne redécide rien, il déplace le point d'ancrage.

import { dessinerIcone, iconeConnue } from "./carrouselIcones";

/**
 * LES DEUX FORMATS.
 *
 * `zoneSure` est la bande qu'Instagram NE RECOUVRE PAS. En story, son interface
 * mange le haut et le bas — les valeurs sont volontairement PRUDENTES (la
 * hauteur réelle varie avec le modèle de téléphone et l'encoche) : mieux vaut
 * 60 px de marge perdue qu'un D+ coupé. Une PUBLICATION, elle, n'est recouverte
 * de rien : le cadre entier est utilisable, et ce serait du gâchis d'y garder
 * les marges de la story.
 *
 * C'est tout ce qui change entre les deux : la mise en page est ANCRÉE sur le
 * bas de la zone sûre (cf. `gabaritDe`), donc elle se replace toute seule.
 */
export const FORMATS_HABILLAGE = {
  story: {
    cle: "story",
    label: "Story · 1080×1920",
    width: 1080,
    height: 1920,
    zoneSure: { top: 250, bottom: 1600 },
  },
  publication: {
    cle: "publication",
    label: "Publication · 1080×1350",
    width: 1080,
    height: 1350,
    zoneSure: { top: 0, bottom: 1350 },
  },
};

/** Les deux habillages. */
export const STYLES_HABILLAGE = [
  {
    cle: "silhouette",
    label: "Silhouette",
    aide: "Le relief en bandeau pleine largeur, les chiffres dessous.",
  },
  {
    cle: "chiffres",
    label: "Chiffres",
    aide: "La distance en très grand et les temps en ligne — l'habillage de montre, à la charte du labo.",
  },
];

export const STORY = FORMATS_HABILLAGE.story;
export const ZONE_SURE = FORMATS_HABILLAGE.story.zoneSure;

/** Le format demandé, qu'on l'ait passé par sa clé ou en entier. */
export function formatHabillage(f) {
  if (f && typeof f === "object" && f.width > 0) return f;
  return FORMATS_HABILLAGE[f] ?? FORMATS_HABILLAGE.story;
}

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

/**
 * LE GABARIT « SILHOUETTE », ancré sur le BAS de la zone sûre.
 *
 * Tout se compte à partir de là, jamais depuis le haut de l'image : c'est la
 * limite basse qui commande (le bloc descend jusqu'à elle — plus haut, il
 * laissait 380 px de photo vide sous lui à l'export), et c'est la seule chose
 * qui change d'un format à l'autre. Les écarts, eux, sont ceux relevés sur la
 * story : le même habillage se replace en 1080×1350 sans rien redécider.
 */
export function gabaritDe(format) {
  const f = formatHabillage(format);
  const bas = f.zoneSure?.bottom ?? f.height;
  const haut = f.zoneSure?.top ?? 0;
  const profilY = bas - 395;
  return {
    pad: 72,
    haut,
    bas,
    /** Le voile part bien au-dessus du texte : une coupure franche se verrait. */
    voileDebut: profilY - 225,
    // PLEINE LARGEUR, sans marge : le profil fait partie de l'image, il n'est pas
    // un encart posé dessus. C'est la silhouette de l'ancien habillage Coros.
    profil: { x: 0, y: profilY, width: f.width, height: 215 },
    /**
     * Le remplissage s'efface sur le dernier tiers, au lieu de s'arrêter net sur
     * une base plate. Chez Coros la base tombait hors du cadre, donc invisible ;
     * ici elle doit rester dans la zone sûre — un aplat s'y terminerait par une
     * barre horizontale en travers de la photo, exactement le trait dont on ne
     * veut pas.
     */
    fondu: 0.34,
    stats: { taille: 44, baseline: bas - 95 },
    // `logo` : la marque du labo, à GAUCHE du nom, en verrou avec lui.
    //   • taille — côté du carré. 38 px pour un nom à 21 px : la marque se
    //              remarque sans prendre le pas sur les chiffres, qui restent
    //              l'information de l'image.
    //   • ecart  — blanc entre la marque et la première lettre.
    marque: { taille: 21, baseline: bas - 34, espacement: 0.3, logo: { taille: 38, ecart: 16 } },
  };
}

/** Le gabarit de la story — celui d'origine, et la référence des tests. */
export const GABARIT = gabaritDe(FORMATS_HABILLAGE.story);

/**
 * LE GABARIT « CHIFFRES ».
 *
 * La grammaire des écrans de montre : la date en haut à gauche, la marque en
 * haut à droite, la distance en très grand en bas, et une ligne de mesures
 * dessous. Ce qui change ici, c'est qu'on la met à la charte du labo — mêmes
 * fontes, même crème, même ambre — et qu'on y ajoute le D+, qui est la mesure
 * qui compte en montagne et que les montres relèguent toujours en second écran.
 */
export function gabaritChiffres(format) {
  const f = formatHabillage(format);
  const bas = f.zoneSure?.bottom ?? f.height;
  const haut = f.zoneSure?.top ?? 0;
  return {
    pad: 72,
    haut,
    bas,
    entete: { taille: 34, baseline: haut + 88, icone: 40, espacement: 0.06 },
    marque: { taille: 22, espacement: 0.28, logo: { taille: 36, ecart: 14 } },
    distance: { taille: 118, unite: 46, baseline: bas - 186 },
    mesures: { taille: 40, icone: 42, baseline: bas - 70, ecart: 56 },
    voileDebut: bas - 500,
    voileHaut: haut + 300,
  };
}

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
export function boiteDuLogo(x = GABARIT.pad, g = GABARIT) {
  const { taille } = g.marque.logo;
  const centre = g.marque.baseline - g.marque.taille * CENTRE_CAPITALES;
  return { x, y: centre - taille / 2, taille };
}

/** La signature du labo : la marque puis le nom, en verrou. Rend sa largeur. */
function signature(ctx, g, x, baseline, police, logo, { aDroite = false } = {}) {
  const mq = g.marque;
  ctx.font = `500 ${mq.taille}px ${police}`;
  const largeurNom = largeurEspaceeHab(ctx, "THE LOCOMOTION LAB", mq.taille, mq.espacement);
  const largeur = largeurNom + (logo ? mq.logo.taille + mq.logo.ecart : 0);
  const gauche = aDroite ? x - largeur : x;

  if (logo) {
    const centre = baseline - mq.taille * CENTRE_CAPITALES;
    ctx.globalAlpha = MARQUE_OPACITE;
    ctx.drawImage(logo, gauche, centre - mq.logo.taille / 2, mq.logo.taille, mq.logo.taille);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = `rgba(254, 251, 246, ${MARQUE_OPACITE})`;
  dessinerTexteEspace(
    ctx,
    "THE LOCOMOTION LAB",
    gauche + (logo ? mq.logo.taille + mq.logo.ecart : 0),
    baseline,
    mq.taille,
    mq.espacement,
  );
  return largeur;
}

/** Largeur d'un texte à interlettrage imposé (cf. `dessinerTexteEspace`). */
function largeurEspaceeHab(ctx, texte, taille, espacementEm) {
  let largeur = 0;
  for (const lettre of texte) largeur += ctx.measureText(lettre).width + espacementEm * taille;
  return Math.max(0, largeur - espacementEm * taille);
}

/** Le voile du bas, commun aux deux habillages. */
function voileBas(ctx, format, depuis, densite = 0.72) {
  const voile = ctx.createLinearGradient(0, depuis, 0, format.height);
  voile.addColorStop(0, `rgba(${COULEURS.ombre}, 0)`);
  voile.addColorStop(0.35, `rgba(${COULEURS.ombre}, ${(densite * 0.42).toFixed(3)})`);
  voile.addColorStop(0.6, `rgba(${COULEURS.ombre}, ${(densite * 0.8).toFixed(3)})`);
  voile.addColorStop(0.85, `rgba(${COULEURS.ombre}, ${densite.toFixed(3)})`);
  voile.addColorStop(1, `rgba(${COULEURS.ombre}, ${densite.toFixed(3)})`);
  ctx.fillStyle = voile;
  ctx.fillRect(0, depuis, format.width, format.height - depuis);
}

/**
 * L'HABILLAGE « SILHOUETTE » — celui d'origine, désormais valable aux deux
 * formats parce que sa géométrie est ancrée sur la zone sûre.
 */
function dessinerSilhouette(ctx, format, o) {
  const { profil, distanceKm, dPlusM, dMinusM, police, logo } = o;
  const g = gabaritDe(format);

  voileBas(ctx, format, g.voileDebut);

  const chemin = cheminDuProfil(profil, g.profil);
  if (chemin) {
    ctx.beginPath();
    ctx.moveTo(chemin.points[0][0], chemin.base);
    for (const [x, y] of chemin.points) ctx.lineTo(x, y);
    ctx.lineTo(chemin.points[chemin.points.length - 1][0], chemin.base);
    ctx.closePath();
    // Remplissage qui s'efface vers le bas : aucune barre horizontale ne vient
    // fermer la silhouette (cf. `fondu`).
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

  // Signature : le logo est posé à la même opacité que le texte — une empreinte
  // plus contrastée que son propre nom tirerait l'œil vers le coin de l'image
  // au lieu des chiffres.
  signature(ctx, g, g.pad, g.marque.baseline, police, logo);
}

/**
 * L'HABILLAGE « CHIFFRES ».
 *
 * La distance est le SUJET : elle occupe la ligne, tout le reste la commente.
 * Le D+ se pose juste à côté d'elle, dans un corps intermédiaire — assez gros
 * pour compter, assez petit pour ne pas se disputer la première lecture. C'est
 * l'écart qu'on ne trouve sur aucune montre : elles mettent le dénivelé sur la
 * même ligne que la fréquence cardiaque, comme si c'était une donnée parmi
 * d'autres.
 */
function dessinerChiffres(ctx, format, o) {
  const { distanceKm, dPlusM, police, logo, entete, activite, mesures = [] } = o;
  const g = gabaritChiffres(format);

  // Deux voiles : l'en-tête et le bloc du bas ont chacun besoin du leur, et la
  // bande centrale — le sujet de la photo — reste intacte entre les deux.
  voileBas(ctx, format, g.voileDebut, 0.74);
  const haut = ctx.createLinearGradient(0, 0, 0, g.voileHaut);
  haut.addColorStop(0, `rgba(${COULEURS.ombre}, 0.6)`);
  haut.addColorStop(1, `rgba(${COULEURS.ombre}, 0)`);
  ctx.fillStyle = haut;
  ctx.fillRect(0, 0, format.width, g.voileHaut);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  /* ---- en-tête : l'activité et la date à gauche, la marque à droite ---- */
  let x = g.pad;
  const cle = activite || "sentier";
  if (iconeConnue(cle)) {
    const cote = g.entete.icone;
    const centre = g.entete.baseline - g.entete.taille * CENTRE_CAPITALES;
    dessinerIcone(ctx, cle, x, centre - cote / 2, cote, `rgba(254, 251, 246, ${MARQUE_OPACITE})`);
    x += cote + 18;
  }
  if (entete) {
    ctx.font = `400 ${g.entete.taille}px ${police}`;
    ctx.fillStyle = `rgba(254, 251, 246, ${MARQUE_OPACITE})`;
    ctx.fillText(String(entete), x, g.entete.baseline);
  }
  signature(ctx, g, format.width - g.pad, g.entete.baseline, police, logo, { aDroite: true });

  /* ---- la distance, en très grand, et le D+ à côté ---- */
  const d = g.distance;
  const nombre = Number.isFinite(distanceKm) && distanceKm > 0 ? formatKm(distanceKm) : "";
  const dplus = Number.isFinite(dPlusM) && dPlusM > 0 ? formatEntier(dPlusM) : "";
  if (nombre || dplus) {
    // On MESURE avant d'écrire : une distance à quatre chiffres plus un D+ à
    // quatre chiffres dépassent la largeur du cadre, et un habillage qui déborde
    // ne se rattrape pas après l'export.
    const mesurer = (taille, poids, texte) => {
      ctx.font = `${poids} ${taille}px ${police}`;
      return ctx.measureText(texte).width;
    };
    const dispo = format.width - g.pad * 2;
    let echelle = 1;
    for (let essai = 0; essai < 12; essai += 1) {
      const grand = d.taille * echelle;
      const petit = d.unite * echelle;
      const total =
        (nombre ? mesurer(grand, 700, nombre) + mesurer(petit, 500, " km") : 0) +
        (nombre && dplus ? petit * 1.4 : 0) +
        (dplus ? mesurer(grand * 0.55, 700, dplus) + mesurer(petit, 500, " m D+") + petit : 0);
      if (total <= dispo) break;
      echelle *= 0.94;
    }
    const grand = d.taille * echelle;
    const petit = d.unite * echelle;
    let cur = g.pad;
    ctx.fillStyle = COULEURS.creme;
    ctx.strokeStyle = COULEURS.creme;
    if (nombre) {
      ctx.font = `700 ${grand}px ${police}`;
      ctx.fillText(nombre, cur, d.baseline);
      cur += ctx.measureText(nombre).width;
      ctx.font = `500 ${petit}px ${police}`;
      ctx.fillStyle = `rgba(254, 251, 246, 0.8)`;
      ctx.fillText(" km", cur, d.baseline);
      cur += ctx.measureText(" km").width;
    }
    if (dplus) {
      if (nombre) cur += petit * 1.4;
      // Le D+ est en AMBRE : c'est la couleur de la charte pour le relief, et
      // c'est aussi ce qui le distingue au premier coup d'œil de la distance.
      ctx.fillStyle = COULEURS.ambre;
      ctx.strokeStyle = COULEURS.ambre;
      ctx.font = `700 ${grand * 0.55}px ${police}`;
      ctx.fillText(dplus, cur, d.baseline);
      cur += ctx.measureText(dplus).width;
      ctx.font = `500 ${petit}px ${police}`;
      ctx.fillText(" m", cur, d.baseline);
      cur += ctx.measureText(" m").width + petit * 0.24;
      dessinerFleche(ctx, cur, d.baseline, petit * 1.1, "haut");
    }
  }

  /* ---- la ligne des mesures ---- */
  const mz = g.mesures;
  ctx.font = `500 ${mz.taille}px ${police}`;
  let cur = g.pad;
  for (const mesure of mesures) {
    const texte = String(mesure?.texte ?? "").trim();
    if (!texte) continue;
    ctx.fillStyle = `rgba(254, 251, 246, 0.9)`;
    if (mesure.icone && iconeConnue(mesure.icone)) {
      const centre = mz.baseline - mz.taille * CENTRE_CAPITALES;
      dessinerIcone(ctx, mesure.icone, cur, centre - mz.icone / 2, mz.icone, COULEURS.ambre);
      cur += mz.icone + 14;
    }
    ctx.font = `500 ${mz.taille}px ${police}`;
    ctx.fillText(texte, cur, mz.baseline);
    cur += ctx.measureText(texte).width + mz.ecart;
  }
}

/**
 * Compose l'habillage sur un contexte 2D déjà dimensionné au format demandé.
 *
 * `police` est la famille CSS à utiliser (celle de next/font, lue sur le DOM).
 * `logo` est la marque DÉJÀ TEINTÉE (cf. HabillagePhoto) ; absente, le nom seul
 * est dessiné — l'habillage ne dépend pas de son chargement.
 */
export function dessinerHabillage(ctx, options) {
  const format = formatHabillage(options.format);
  const { image, ancrage = 0.5, police = "sans-serif", style = "silhouette" } = options;

  ctx.clearRect(0, 0, format.width, format.height);
  ctx.fillStyle = "#22241E";
  ctx.fillRect(0, 0, format.width, format.height);

  if (image) {
    const c = cadrageCouverture({ width: image.width, height: image.height }, format, ancrage);
    if (c) ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const o = { ...options, police };
  if (style === "chiffres") dessinerChiffres(ctx, format, o);
  else dessinerSilhouette(ctx, format, o);
}
