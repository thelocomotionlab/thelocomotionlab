// lib/carrouselCartes.js
//
// LE RENDU DES CARTES DU CARROUSEL, sur un canvas 2D — donc dans le navigateur,
// donc sur le téléphone, hors ligne, sans rien envoyer nulle part.
//
// POURQUOI PAS satori (le moteur des cartes du live) : satori tourne dans Node,
// derrière un `pnpm build`, et son fond de carte est un fichier mis en cache sur
// le VPS. Ici on veut un aperçu qui se redessine à chaque frappe et des
// étiquettes qu'on attrape à la souris — c'est le terrain du canvas, et c'est
// déjà celui de `lib/habillage.js`, dont ce fichier reprend les primitives
// (couleurs, silhouette de profil, flèches dessinées, signature du labo).
//
// La conséquence assumée : DEUX moteurs coexistent, un par usage. Ce qu'ils
// doivent finir par partager, c'est le VOCABULAIRE (tokens, formateurs,
// géométrie), pas la composition — cf. l'en-tête de `carrouselGeo.js`.
//
// L'APERÇU EST L'IMAGE FINALE : le canvas est dimensionné en pixels de sortie
// et seulement réduit en CSS. Ce qu'on voit est ce qu'on exporte, au pixel près.

import {
  CENTRE_CAPITALES,
  COULEURS,
  MARQUE_OPACITE,
  cadrageCouverture,
  cheminDuProfil,
  dessinerFleche,
  dessinerTexteEspace,
  formatEntier,
  formatKm,
  segmentsDeStats,
} from "./habillage";
import { decimerPixels, fitView, tileWindow, TILE_SIZE } from "./carrouselGeo";
import { ancreDuSegment } from "./carrouselTrace";
import { traceColors } from "./liveTraceColors";

/**
 * Les formats de publication.
 *
 * `zoneSure` : la bande qu'Instagram NE RECOUVRE PAS de son interface. Elle
 * n'existe que pour la story — en carrousel (fil) et en carré, rien ne vient
 * par-dessus. C'est la contrainte qui a fait abandonner l'habillage Coros
 * (cf. lib/habillage.js) : on la porte ici dès le premier jet plutôt que de la
 * redécouvrir sur une vraie publication.
 */
export const FORMATS = {
  carrousel: { cle: "carrousel", label: "Carrousel · 1080×1350", width: 1080, height: 1350, zoneSure: null },
  story: { cle: "story", label: "Story · 1080×1920", width: 1080, height: 1920, zoneSure: { top: 250, bottom: 1600 } },
  carre: { cle: "carre", label: "Carré · 1080×1080", width: 1080, height: 1080, zoneSure: null },
};

export const GABARITS = [
  { cle: "carte", label: "Carte", aide: "L'itinéraire, découpé en journées." },
  { cle: "photo", label: "Photo", aide: "Une photo plein cadre et le profil." },
  { cle: "texte", label: "Texte", aide: "Un titre et un paragraphe." },
  { cle: "chiffres", label: "Chiffres", aide: "Les statistiques en grand." },
];

/**
 * Couleurs proposées pour les journées.
 *
 * Le fuchsia vient en tête : c'est la teinte des traces du live, choisie parce
 * qu'elle est absente de TOUS les fonds topo (cf. lib/liveTraceColors.js). Les
 * trois suivantes sont celles du labo — lisibles ici parce que la carte est
 * voilée, là où elles se fondraient dans un relief nu.
 *
 * PAS DE CRÈME dans cette liste, alors que c'est la couleur d'encre du labo :
 * l'itinéraire complet est déjà tracé en crème atténuée sous les journées, et
 * une journée de la même teinte se lisait comme « la portion non coloriée ».
 * Le bleu de la charte (`--color-brand-primary`) tient ce quatrième rang.
 */
export const PALETTE_JOURS = [traceColors.line, COULEURS.ambre, "#B67352", "#8CB9BD"];

export const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
export const ATTRIBUTION = "Fond de carte · Esri World Topo";

const MARQUE = "THE LOCOMOTION LAB";

/** Le fond quand il n'y a pas d'image — même valeur que les cartes du service. */
const SOMBRE = "#22241E";

/* ------------------------------------------------------------------ métriques */

/** Tout est proportionnel à 1080 px de large : un trait fixé en pixels
 *  paraîtrait deux fois plus fin d'un format à l'autre. */
function metriques(format) {
  const k = format.width / 1080;
  const hautTexte = format.height * (format.cle === "story" ? 0.3 : 0.34);
  return {
    k,
    pad: Math.round(72 * k),
    marque: Math.round(22 * k),
    titre: Math.round((format.cle === "carre" ? 64 : 76) * k),
    corps: Math.round(34 * k),
    chiffre: Math.round(112 * k),
    unite: Math.round(36 * k),
    pied: Math.round(26 * k),
    credit: Math.round(18 * k),
    etiquette: Math.round(30 * k),
    // Le bloc de texte occupe le bas ; la carte se cadre au-dessus.
    texteTop: format.height - hautTexte,
    headerTop: Math.round((format.zoneSure?.top ?? 0) + 104 * k),
    basSur: format.zoneSure ? format.zoneSure.bottom : format.height - Math.round(92 * k),
  };
}

/** Fenêtre de cadrage de l'itinéraire — entre l'en-tête et le bloc de texte. */
function fenetreCarte(format) {
  const m = metriques(format);
  const y = m.headerTop + Math.round(48 * m.k);
  return { x: m.pad, y, width: format.width - m.pad * 2, height: Math.max(200, m.texteTop - y - 24 * m.k) };
}

/**
 * LA vue de la carte — un seul endroit qui la calcule.
 *
 * Le fond de tuiles est téléchargé bien avant le rendu (c'est du réseau), mais
 * les deux DOIVENT partager exactement le même cadrage : une mosaïque calculée
 * sur une autre fenêtre se dessine décalée sous une trace qui, elle, est juste.
 * D'où cette fonction, appelée par l'atelier ET par le rendu.
 */
export function vueDeLaCarte(coords, formatCle) {
  const format = FORMATS[formatCle] ?? FORMATS.carrousel;
  return fitView(coords, { width: format.width, height: format.height, fit: fenetreCarte(format) });
}

function rectArrondi(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ fond de carte */

function urlTuile(template, z, x, y) {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

function chargerTuile(url) {
  return new Promise((resolve) => {
    const img = new Image();
    // ANONYMOUS EST OBLIGATOIRE : sans lui la tuile chargerait mais SOUILLERAIT
    // le canvas, et `toBlob` lèverait au moment d'exporter — l'échec
    // arriverait donc au pire moment. Avec, une tuile sans en-tête CORS échoue
    // proprement ici, et la carte se rabat sur son fond uni.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Mosaïque de tuiles couvrant la vue. `null` si AUCUNE tuile n'arrive — la
 * carte reste alors lisible sur son aplat sombre. Une carte ne doit jamais
 * échouer à cause du réseau.
 */
export async function chargerFond(view, options = {}) {
  if (typeof document === "undefined" || !view) return null;
  const tileUrl = options.tileUrl ?? TILE_URL;
  const w = tileWindow(view);
  if (w.cols * w.rows > 64) return null; // garde-fou : jamais une avalanche de requêtes

  const mosaique = document.createElement("canvas");
  mosaique.width = w.cols * TILE_SIZE;
  mosaique.height = w.rows * TILE_SIZE;
  const ctx = mosaique.getContext("2d");

  const demandes = [];
  for (let dy = 0; dy < w.rows; dy += 1) {
    for (let dx = 0; dx < w.cols; dx += 1) {
      const tx = w.tx0 + dx;
      const ty = w.ty0 + dy;
      demandes.push(
        chargerTuile(urlTuile(tileUrl, w.zoom, tx, ty)).then((img) => {
          if (img) ctx.drawImage(img, dx * TILE_SIZE, dy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          return Boolean(img);
        }),
      );
    }
  }
  const arrivees = await Promise.all(demandes);
  if (!arrivees.some(Boolean)) return null;
  return { mosaique, cropX: w.cropX, cropY: w.cropY };
}

/* ------------------------------------------------------------------ chrome commun */

function voile(ctx, format, depuis) {
  const g = ctx.createLinearGradient(0, depuis, 0, format.height);
  g.addColorStop(0, `rgba(${COULEURS.ombre}, 0)`);
  g.addColorStop(0.35, `rgba(${COULEURS.ombre}, 0.42)`);
  g.addColorStop(0.7, `rgba(${COULEURS.ombre}, 0.74)`);
  g.addColorStop(1, `rgba(${COULEURS.ombre}, 0.86)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, depuis, format.width, format.height - depuis);
}

/** La signature du labo, en haut à gauche. Le logo est déjà teinté par l'appelant. */
function signature(ctx, format, m, police, logo) {
  let x = m.pad;
  if (logo) {
    const taille = Math.round(m.marque * 1.8);
    const centre = m.headerTop - m.marque * CENTRE_CAPITALES;
    ctx.globalAlpha = MARQUE_OPACITE;
    ctx.drawImage(logo, x, centre - taille / 2, taille, taille);
    ctx.globalAlpha = 1;
    x += taille + Math.round(m.marque * 0.72);
  }
  ctx.font = `500 ${m.marque}px ${police}`;
  ctx.fillStyle = `rgba(254, 251, 246, ${MARQUE_OPACITE})`;
  dessinerTexteEspace(ctx, MARQUE, x, m.headerTop, m.marque, 0.3);
}

/** Découpe un texte à la largeur donnée. Renvoie les lignes. */
export function lignes(ctx, texte, largeurMax) {
  const mots = String(texte ?? "").split(/\s+/).filter(Boolean);
  const out = [];
  let ligne = "";
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(essai).width > largeurMax && ligne) {
      out.push(ligne);
      ligne = mot;
    } else {
      ligne = essai;
    }
  }
  if (ligne) out.push(ligne);
  return out;
}

function blocTitre(ctx, format, m, police, { titre, sousTitre, pied }) {
  let y = m.basSur;

  if (pied) {
    ctx.font = `400 ${m.pied}px ${police}`;
    ctx.fillStyle = `rgba(254, 251, 246, 0.72)`;
    ctx.fillText(pied, m.pad, y);
    y -= m.pied * 2.1;
  }
  if (sousTitre) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = `rgba(254, 251, 246, 0.86)`;
    const ls = lignes(ctx, sousTitre, format.width - m.pad * 2);
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      ctx.fillText(ls[i], m.pad, y);
      y -= m.corps * 1.42;
    }
    y -= m.corps * 0.35;
  }
  if (titre) {
    ctx.font = `700 ${m.titre}px ${police}`;
    ctx.fillStyle = COULEURS.creme;
    const ls = lignes(ctx, titre, format.width - m.pad * 2);
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      ctx.fillText(ls[i], m.pad, y);
      y -= m.titre * 1.1;
    }
  }
}

function credit(ctx, format, m, police, texte) {
  if (!texte) return;
  ctx.font = `400 ${m.credit}px ${police}`;
  ctx.fillStyle = "rgba(254, 251, 246, 0.5)";
  ctx.textAlign = "right";
  ctx.fillText(texte, format.width - m.pad, m.basSur + m.credit * 2.2);
  ctx.textAlign = "left";
}

/* ------------------------------------------------------------------ étiquettes */

/**
 * Boîte d'une étiquette, dans les pixels du canevas. Isolée parce qu'elle sert
 * DEUX FOIS : à dessiner, et à savoir si un clic tombe dessus (le glisser).
 */
export function boiteEtiquette(ctx, texte, ancre, m, police) {
  ctx.save();
  ctx.font = `500 ${m.etiquette}px ${police}`;
  const largeurTexte = ctx.measureText(texte).width;
  ctx.restore();
  const padX = m.etiquette * 0.62;
  const padY = m.etiquette * 0.42;
  const pastille = m.etiquette * 0.34;
  const w = largeurTexte + padX * 2 + pastille + m.etiquette * 0.4;
  const h = m.etiquette + padY * 2;
  return {
    x: ancre[0] - w / 2,
    // L'étiquette se pose AU-DESSUS de l'ancre, avec l'espace d'une hauteur de
    // pastille : collée au trait, elle se lit comme une partie du tracé.
    y: ancre[1] - h - m.etiquette * 0.9,
    width: w,
    height: h,
    padX,
    pastille,
  };
}

const borne = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Ramène une étiquette AUTOMATIQUE dans la zone de la carte.
 *
 * Sans ça, la journée dont le point le plus haut frôle le bord supérieur pose
 * son étiquette par-dessus la signature du labo — vu du premier coup sur le
 * Tour des Écrins, où J1 recouvrait « THE LOCOMOTION LAB ». On la cale donc
 * entre l'en-tête et le bloc de texte, avant que le décalage manuel s'applique.
 */
function calerEtiquette(boite, format, m) {
  boite.x = borne(boite.x, m.pad, format.width - m.pad - boite.width);
  boite.y = borne(boite.y, m.headerTop + m.marque * 1.4, m.texteTop - boite.height);
  return boite;
}

/** Dernier filet : déplacée à la main, une étiquette peut aller où on veut —
 *  mais jamais entièrement hors de l'image, d'où on ne la rattraperait plus. */
function dansLeCadre(boite, format) {
  boite.x = borne(boite.x, 0, format.width - boite.width);
  boite.y = borne(boite.y, 0, format.height - boite.height);
  return boite;
}

function dessinerEtiquette(ctx, texte, boite, couleur, m, police) {
  ctx.save();
  rectArrondi(ctx, boite.x, boite.y, boite.width, boite.height, boite.height / 2);
  ctx.fillStyle = `rgba(${COULEURS.ombre}, 0.82)`;
  ctx.fill();
  ctx.strokeStyle = `${couleur}`;
  ctx.lineWidth = Math.max(1.5, m.k * 2);
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const cy = boite.y + boite.height / 2;
  ctx.beginPath();
  ctx.arc(boite.x + boite.padX + boite.pastille / 2, cy, boite.pastille / 2, 0, Math.PI * 2);
  ctx.fillStyle = couleur;
  ctx.fill();

  ctx.font = `500 ${m.etiquette}px ${police}`;
  ctx.fillStyle = COULEURS.creme;
  ctx.textBaseline = "middle";
  ctx.fillText(texte, boite.x + boite.padX + boite.pastille + m.etiquette * 0.4, cy + m.etiquette * 0.04);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/* ------------------------------------------------------------------ gabarits */

function polyligne(ctx, points, couleur, epaisseur, liseré) {
  if (points.length < 2) return;
  const tracer = () => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points) ctx.lineTo(x, y);
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (liseré) {
    tracer();
    ctx.strokeStyle = traceColors.casing;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = epaisseur * 1.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  tracer();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = epaisseur;
  ctx.stroke();
}

/**
 * LA CARTE — l'itinéraire découpé en journées, chacune de sa couleur, chacune
 * avec son étiquette posée au-dessus de sa portion.
 *
 * Renvoie les boîtes des étiquettes : l'atelier en a besoin pour savoir ce
 * qu'on attrape à la souris.
 */
function dessinerCarte(ctx, format, ctx2) {
  const { carte, trace, segments, police, logo, fond, m } = ctx2;
  const boites = [];
  if (!trace || !trace.coords.length) return boites;

  const view = vueDeLaCarte(trace.coords, format.cle);
  if (!view) return boites;

  if (fond && carte.afficherFond !== false) {
    ctx.drawImage(
      fond.mosaique,
      fond.cropX,
      fond.cropY,
      view.tileCanvasWidth,
      view.tileCanvasHeight,
      0,
      0,
      format.width,
      format.height,
    );
    // Voile GÉNÉRAL léger : un fond topo est clair et très bavard, le tracé s'y
    // noie. On l'assombrit partout, puis le dégradé du bas porte le texte.
    ctx.fillStyle = `rgba(${COULEURS.ombre}, 0.28)`;
    ctx.fillRect(0, 0, format.width, format.height);
  }
  // Le voile démarre SOUS la fenêtre de cadrage : plus haut, il assombrissait
  // le tiers bas de l'itinéraire, et la dernière journée paraissait éteinte
  // alors qu'elle a la même couleur que les autres.
  voile(ctx, format, m.texteTop - format.height * 0.04);

  const epaisseur = Math.max(3, 7.5 * m.k);

  // L'itinéraire ENTIER, en sourdine : il tient la forme du parcours même là où
  // aucune journée n'est mise en avant. Discret par construction — il ne doit
  // pas pouvoir se confondre avec une journée coloriée.
  polyligne(
    ctx,
    decimerPixels(trace.coords.map((c) => view.project(c))),
    "rgba(254, 251, 246, 0.22)",
    epaisseur * 0.62,
    false,
  );

  segments.forEach((seg, i) => {
    const etq = carte.etiquettes?.[i] ?? {};
    const couleur = etq.couleur ?? PALETTE_JOURS[i % PALETTE_JOURS.length];
    polyligne(ctx, decimerPixels(seg.coords.map((c) => view.project(c))), couleur, epaisseur, true);
  });

  // Étiquettes en DERNIER : sur tous les tracés, jamais dessous.
  segments.forEach((seg, i) => {
    const etq = carte.etiquettes?.[i] ?? {};
    if (etq.masquee) return;
    const texte = etq.texte ?? `J${i + 1}`;
    if (!texte.trim()) return;
    const ancre = ancreDuSegment(seg, view.project);
    if (!ancre) return;
    const couleur = etq.couleur ?? PALETTE_JOURS[i % PALETTE_JOURS.length];
    const boite = calerEtiquette(boiteEtiquette(ctx, texte, ancre, m, police), format, m);
    boite.x += etq.dx ?? 0;
    boite.y += etq.dy ?? 0;
    dansLeCadre(boite, format);
    dessinerEtiquette(ctx, texte, boite, couleur, m, police);
    boites.push({ index: i, ...boite });
  });

  signature(ctx, format, m, police, logo);
  blocTitre(ctx, format, m, police, {
    titre: carte.titre,
    sousTitre: carte.texte,
    pied: carte.pied ?? piedItineraire(trace),
  });
  credit(ctx, format, m, police, fond && carte.afficherFond !== false ? ATTRIBUTION : null);
  return boites;
}

function piedItineraire(trace) {
  if (!trace) return "";
  return [
    trace.totalKm > 0 ? `${formatEntier(trace.totalKm)} km` : "",
    trace.dPlusM > 0 ? `${formatEntier(trace.dPlusM)} m D+` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
}

/** LA PHOTO — plein cadre, profil ambré, chiffres. Le gabarit de l'habillage,
 *  porté aux autres formats. */
function dessinerPhoto(ctx, format, ctx2) {
  const { carte, trace, police, logo, m } = ctx2;

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      format,
      carte.ancrage ?? 0.5,
    );
    if (c) ctx.drawImage(carte.image, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
  }
  voile(ctx, format, m.texteTop - format.height * 0.22);

  const profil = carte.segmentProfil != null ? ctx2.segments[carte.segmentProfil]?.profil : trace?.profil;
  const boite = {
    x: 0,
    y: m.basSur - m.pied * 2.1 - m.corps * 1.4 - 215 * m.k,
    width: format.width,
    height: 215 * m.k,
  };
  const chemin = cheminDuProfil(profil ?? [], boite);
  if (chemin) {
    ctx.beginPath();
    ctx.moveTo(chemin.points[0][0], chemin.base);
    for (const [x, y] of chemin.points) ctx.lineTo(x, y);
    ctx.lineTo(chemin.points[chemin.points.length - 1][0], chemin.base);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, boite.y, 0, chemin.base);
    g.addColorStop(0, "rgba(239, 177, 89, 0.3)");
    g.addColorStop(0.66, "rgba(239, 177, 89, 0.3)");
    g.addColorStop(1, "rgba(239, 177, 89, 0)");
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(chemin.points[0][0], chemin.points[0][1]);
    for (const [x, y] of chemin.points) ctx.lineTo(x, y);
    ctx.strokeStyle = COULEURS.ambre;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = 4 * m.k;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  signature(ctx, format, m, police, logo);
  blocTitre(ctx, format, m, police, {
    titre: carte.titre,
    sousTitre: carte.texte,
    pied: carte.pied ?? piedItineraire(trace),
  });
  return [];
}

/** LE TEXTE — un titre, un paragraphe. Rien d'autre : c'est la respiration du
 *  carrousel, la carte qu'on met entre deux images. */
function dessinerTexte(ctx, format, ctx2) {
  const { carte, police, logo, m } = ctx2;

  ctx.fillStyle = SOMBRE;
  ctx.fillRect(0, 0, format.width, format.height);
  // Halo chaud, pour qu'un aplat ne soit pas mort : très large, très faible.
  const halo = ctx.createRadialGradient(
    format.width * 0.24,
    format.height * 0.2,
    0,
    format.width * 0.24,
    format.height * 0.2,
    format.width,
  );
  halo.addColorStop(0, "rgba(239, 177, 89, 0.16)");
  halo.addColorStop(1, "rgba(239, 177, 89, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, format.width, format.height);

  const largeur = format.width - m.pad * 2;
  let y = (format.zoneSure?.top ?? 0) + format.height * 0.3;

  if (carte.titre) {
    ctx.font = `700 ${m.titre}px ${police}`;
    ctx.fillStyle = COULEURS.creme;
    for (const l of lignes(ctx, carte.titre, largeur)) {
      ctx.fillText(l, m.pad, y);
      y += m.titre * 1.14;
    }
    y += m.corps * 0.7;
  }
  if (carte.texte) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = "rgba(254, 251, 246, 0.88)";
    for (const l of lignes(ctx, carte.texte, largeur)) {
      ctx.fillText(l, m.pad, y);
      y += m.corps * 1.5;
    }
  }

  signature(ctx, format, m, police, logo);
  return [];
}

/** LES CHIFFRES — les statistiques en très grand. Par défaut celles de la trace
 *  entière, ou celles d'une journée si on en désigne une. */
function dessinerChiffres(ctx, format, ctx2) {
  const { carte, trace, segments, police, logo, m } = ctx2;

  ctx.fillStyle = SOMBRE;
  ctx.fillRect(0, 0, format.width, format.height);
  const g = ctx.createLinearGradient(0, 0, format.width, format.height);
  g.addColorStop(0, "rgba(182, 115, 82, 0.22)");
  g.addColorStop(1, "rgba(239, 177, 89, 0.06)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, format.width, format.height);

  const seg = carte.segment != null ? segments[carte.segment] : null;
  const distanceKm = Number.isFinite(carte.distanceKm)
    ? carte.distanceKm
    : (seg?.distanceKm ?? trace?.totalKm ?? 0);
  const dPlusM = Number.isFinite(carte.dPlusM) ? carte.dPlusM : (seg?.dPlusM ?? trace?.dPlusM ?? 0);
  const dMinusM = Number.isFinite(carte.dMinusM) ? carte.dMinusM : (seg ? 0 : (trace?.dMinusM ?? 0));

  let y = (format.zoneSure?.top ?? 0) + format.height * 0.34;
  if (carte.titre) {
    ctx.font = `700 ${Math.round(m.titre * 0.7)}px ${police}`;
    ctx.fillStyle = `rgba(254, 251, 246, 0.8)`;
    ctx.fillText(carte.titre, m.pad, y);
    y += m.titre * 0.95;
  }

  ctx.font = `700 ${m.chiffre}px ${police}`;
  ctx.fillStyle = COULEURS.ambre;
  const grand = `${formatKm(distanceKm)}`;
  ctx.fillText(grand, m.pad, y);
  const largeurGrand = ctx.measureText(grand).width;
  ctx.font = `400 ${m.unite}px ${police}`;
  ctx.fillStyle = "rgba(254, 251, 246, 0.7)";
  ctx.fillText("km", m.pad + largeurGrand + m.unite * 0.4, y);
  y += m.chiffre * 0.62;

  ctx.font = `500 ${Math.round(m.corps * 1.3)}px ${police}`;
  ctx.fillStyle = COULEURS.creme;
  ctx.strokeStyle = COULEURS.creme;
  let curseur = m.pad;
  const taille = Math.round(m.corps * 1.3);
  for (const [i, s] of segmentsDeStats({ distanceKm: NaN, dPlusM, dMinusM }).entries()) {
    if (i > 0) {
      ctx.fillText("  ·  ", curseur, y);
      curseur += ctx.measureText("  ·  ").width;
    }
    ctx.fillText(s.texte, curseur, y);
    curseur += ctx.measureText(s.texte).width;
    if (s.fleche) {
      curseur += taille * 0.26;
      curseur += dessinerFleche(ctx, curseur, y, taille, s.fleche);
    }
  }

  if (carte.texte) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = "rgba(254, 251, 246, 0.82)";
    let yy = y + m.corps * 2.2;
    for (const l of lignes(ctx, carte.texte, format.width - m.pad * 2)) {
      ctx.fillText(l, m.pad, yy);
      yy += m.corps * 1.5;
    }
  }

  signature(ctx, format, m, police, logo);
  return [];
}

/* ------------------------------------------------------------------ dispatcheur */

const RENDUS = {
  carte: dessinerCarte,
  photo: dessinerPhoto,
  texte: dessinerTexte,
  chiffres: dessinerChiffres,
};

/**
 * Dessine UNE carte du carrousel. Renvoie les boîtes des étiquettes déplaçables
 * (vide pour les gabarits qui n'en ont pas).
 */
export function dessinerCartePartage(ctx, options) {
  const format = FORMATS[options.format] ?? FORMATS.carrousel;
  const m = metriques(format);
  const police = options.police ?? "sans-serif";

  ctx.clearRect(0, 0, format.width, format.height);
  ctx.fillStyle = "#22241E";
  ctx.fillRect(0, 0, format.width, format.height);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const rendu = RENDUS[options.carte?.gabarit] ?? dessinerTexte;
  return rendu(ctx, format, { ...options, police, m });
}
