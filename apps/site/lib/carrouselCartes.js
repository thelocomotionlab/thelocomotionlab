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
// (couleurs, flèches dessinées, cadrage de photo, signature du labo).
//
// LA GRAMMAIRE, elle, est celle du compte Instagram du labo :
//   • une bande d'en-tête, en capitales très espacées, discrète ;
//   • un SURTITRE précédé d'un filet ambre — le point d'entrée du regard ;
//   • un titre en Ubuntu Bold, deux lignes maximum ;
//   • un corps en régulier, aéré, jamais d'italique ni de gras ;
//   • un pied paginé « 05 / 10 » et un « GLISSE → » tant qu'il reste une carte.
//
// L'APERÇU EST L'IMAGE FINALE : le canvas est dimensionné en pixels de sortie
// et seulement réduit en CSS. Ce qu'on voit est ce qu'on exporte, au pixel près.

import {
  CENTRE_CAPITALES,
  MARQUE_OPACITE,
  cadrageCouverture,
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

/**
 * Les deux encres.
 *
 * L'ambre `#EFB159` de la charte est fait pour un fond sombre ; sur le crème du
 * labo il perd tout contraste. Le thème clair prend donc `--color-brand-accent-ink`
 * (#C08327), le token que la charte réserve exactement à ce cas — pas une
 * teinte inventée ici.
 */
export const THEMES = {
  sombre: {
    cle: "sombre",
    label: "Sombre",
    fond: "#1A1C18",
    encre: "#FEFBF6",
    encreDouce: "rgba(254, 251, 246, 0.74)",
    encreFaible: "rgba(254, 251, 246, 0.44)",
    filet: "rgba(254, 251, 246, 0.15)",
    accent: "#EFB159",
    accentAire: "239, 177, 89",
    /** Voile posé sur les tuiles : elles sont claires et très bavardes. */
    voileCarte: "rgba(16, 18, 14, 0.34)",
    voileTexte: "16, 18, 14",
    profilRestant: "rgba(254, 251, 246, 0.55)",
  },
  clair: {
    cle: "clair",
    label: "Clair",
    fond: "#FEFBF6",
    encre: "#22241E",
    encreDouce: "rgba(34, 36, 30, 0.76)",
    encreFaible: "rgba(34, 36, 30, 0.46)",
    filet: "rgba(34, 36, 30, 0.14)",
    accent: "#C08327",
    accentAire: "192, 131, 39",
    voileCarte: "rgba(254, 251, 246, 0.30)",
    voileTexte: "254, 251, 246",
    profilRestant: "rgba(34, 36, 30, 0.38)",
  },
};

export const GABARITS = [
  { cle: "carte", label: "Carte", aide: "L'itinéraire et son profil, découpés en journées." },
  { cle: "bandeau", label: "Bandeau", aide: "Une photo en bandeau haut, le texte dessous." },
  { cle: "photo", label: "Photo", aide: "Une photo plein cadre." },
  { cle: "texte", label: "Texte", aide: "Un surtitre, un titre, un paragraphe." },
  { cle: "fiche", label: "Fiche", aide: "Des libellés à gauche, des valeurs en gros à droite." },
  { cle: "chiffres", label: "Chiffres", aide: "Une statistique en très grand." },
];

/**
 * Couleurs proposées pour les journées.
 *
 * Le fuchsia vient en tête : c'est la teinte des traces du live, choisie parce
 * qu'elle est absente de TOUS les fonds topo (cf. lib/liveTraceColors.js). Les
 * suivantes sont celles de la charte.
 *
 * PAS DE CRÈME : l'itinéraire complet est déjà tracé en encre atténuée sous les
 * journées, et une journée de la même teinte se lisait comme « la portion non
 * coloriée ».
 */
export const PALETTE_JOURS = [traceColors.line, "#EFB159", "#B67352", "#8CB9BD", "#6E9CA0", "#9A6044"];

export const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
export const ATTRIBUTION = "Fond de carte · Esri World Topo";

const MARQUE = "THE LOCOMOTION LAB";

/** « 7 h 45 » — la durée telle qu'on la dit, pas telle qu'un chrono l'affiche.
 *  Même règle que `dureeCourte` des cartes du service. */
export function dureeCourte(seconds) {
  const total = Math.max(0, Math.round(seconds / 60));
  const heures = Math.floor(total / 60);
  const minutes = total % 60;
  return heures > 0 ? `${heures} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

/* ------------------------------------------------------------------ métriques */

/** Tout est proportionnel à 1080 px de large : un trait fixé en pixels
 *  paraîtrait deux fois plus fin d'un format à l'autre. */
function metriques(format) {
  const k = format.width / 1080;
  const haut = format.zoneSure?.top ?? 0;
  const bas = format.zoneSure?.bottom ?? format.height;
  return {
    k,
    pad: Math.round(64 * k),
    // La bande d'en-tête : sa ligne de base, et le filet qui la ferme.
    bandeH: Math.round(haut + 116 * k),
    entete: Math.round(17 * k),
    surtitre: Math.round(19 * k),
    titre: Math.round((format.cle === "carre" ? 58 : 66) * k),
    corps: Math.round(31 * k),
    chiffre: Math.round(132 * k),
    unite: Math.round(34 * k),
    stat: Math.round(38 * k),
    piedTexte: Math.round(17 * k),
    etiquette: Math.round(29 * k),
    profilH: Math.round(150 * k),
    /** Ligne de base du pied, et filet juste au-dessus. */
    piedBase: Math.round(bas - 46 * k),
    piedFilet: Math.round(bas - 92 * k),
  };
}

/** Fenêtre de cadrage de l'itinéraire — entre la bande d'en-tête et le profil. */
function fenetreCarte(format) {
  const m = metriques(format);
  const y = m.bandeH + Math.round(40 * m.k);
  // Le bas réservé : profil + surtitre + titre + pied.
  const reserve = m.profilH + m.surtitre * 2.4 + m.titre * 1.5 + (m.piedBase - m.piedFilet) + 56 * m.k;
  return {
    x: m.pad,
    y,
    width: format.width - m.pad * 2,
    height: Math.max(240 * m.k, m.piedFilet - reserve - y),
  };
}

/**
 * LA vue de la carte — un seul endroit qui la calcule.
 *
 * Le fond de tuiles est téléchargé bien avant le rendu (c'est du réseau), mais
 * les deux DOIVENT partager exactement le même cadrage : une mosaïque calculée
 * sur une autre fenêtre se dessine décalée sous une trace qui, elle, est juste.
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
 * carte reste alors lisible sur son aplat. Une carte ne doit jamais échouer à
 * cause du réseau.
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
      demandes.push(
        chargerTuile(urlTuile(tileUrl, w.zoom, w.tx0 + dx, w.ty0 + dy)).then((img) => {
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

function voileTexte(ctx, format, th, depuis) {
  const g = ctx.createLinearGradient(0, depuis, 0, format.height);
  g.addColorStop(0, `rgba(${th.voileTexte}, 0)`);
  g.addColorStop(0.4, `rgba(${th.voileTexte}, 0.5)`);
  g.addColorStop(0.75, `rgba(${th.voileTexte}, 0.82)`);
  g.addColorStop(1, `rgba(${th.voileTexte}, 0.92)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, depuis, format.width, format.height - depuis);
}

/**
 * La bande d'en-tête : la marque du labo à gauche, l'intitulé de section à
 * droite, un filet dessous. C'est la ligne qui dit « c'est une planche du
 * labo » sans avoir à occuper le titre.
 */
function bandeEntete(ctx, format, m, th, police, { texte, accent, logo, filet = true }) {
  const base = m.bandeH - Math.round(46 * m.k);

  let x = m.pad;
  if (logo) {
    const taille = Math.round(m.entete * 1.9);
    const centre = base - m.entete * CENTRE_CAPITALES;
    ctx.globalAlpha = MARQUE_OPACITE;
    ctx.drawImage(logo, x, centre - taille / 2, taille, taille);
    ctx.globalAlpha = 1;
    x += taille + Math.round(m.entete * 0.66);
  }
  ctx.font = `500 ${m.entete}px ${police}`;
  ctx.fillStyle = th.encreDouce;
  dessinerTexteEspace(ctx, MARQUE, x, base, m.entete, 0.28);

  if (texte) {
    ctx.font = `${accent ? 500 : 400} ${m.entete}px ${police}`;
    ctx.fillStyle = accent ? th.accent : th.encreFaible;
    dessinerTexteEspace(
      ctx,
      String(texte).toUpperCase(),
      format.width - m.pad - largeurEspacee(ctx, String(texte).toUpperCase(), m.entete, 0.28),
      base,
      m.entete,
      0.28,
    );
  }

  if (filet) {
    ctx.fillStyle = th.filet;
    ctx.fillRect(m.pad, m.bandeH, format.width - m.pad * 2, Math.max(1, 1.5 * m.k));
  }
}

/**
 * Largeur d'un texte à interlettrage imposé. `measureText` ignore l'écart
 * ajouté entre les lettres : sans ce calcul, tout ce qui est aligné à DROITE
 * déborde de la marge d'autant de fois l'écart qu'il y a de caractères.
 * Le dernier écart ne compte pas — il n'y a pas de lettre après.
 */
function largeurEspacee(ctx, texte, taille, espacementEm) {
  let largeur = 0;
  for (const l of texte) largeur += ctx.measureText(l).width + espacementEm * taille;
  return Math.max(0, largeur - espacementEm * taille);
}

/**
 * Le surtitre : un filet ambre, puis des capitales espacées.
 * Renvoie l'ordonnée de la ligne de base du titre qui suit.
 */
function surtitre(ctx, m, th, police, texte, x, base) {
  if (!texte) return base;
  const filetL = Math.round(m.surtitre * 2.4);
  ctx.fillStyle = th.accent;
  ctx.fillRect(x, base - m.surtitre * 0.34, filetL, Math.max(2, 2.5 * m.k));

  ctx.font = `500 ${m.surtitre}px ${police}`;
  dessinerTexteEspace(
    ctx,
    String(texte).toUpperCase(),
    x + filetL + m.surtitre * 0.9,
    base,
    m.surtitre,
    0.22,
  );
  return base;
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

/** Les paragraphes du corps, séparés par une ligne vide dans la saisie. */
function paragraphes(ctx, texte, largeurMax) {
  return String(texte ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => lignes(ctx, p.replace(/\n/g, " "), largeurMax));
}

/**
 * Le pied : un filet, la pagination à gauche, « GLISSE → » à droite tant qu'il
 * reste une carte derrière. La flèche est DESSINÉE — les fontes du site sont
 * des sous-ensembles latins et n'ont pas U+2192 (elle sortirait en carré).
 */
function bandePied(ctx, format, m, th, police, { index, total, centre, droite, filet = true }) {
  if (filet) {
    ctx.fillStyle = th.filet;
    ctx.fillRect(m.pad, m.piedFilet, format.width - m.pad * 2, Math.max(1, 1.5 * m.k));
  }

  ctx.font = `400 ${m.piedTexte}px ${police}`;
  ctx.fillStyle = th.encreFaible;
  const numero = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  dessinerTexteEspace(ctx, numero, m.pad, m.piedBase, m.piedTexte, 0.24);

  if (centre) {
    const mot = String(centre).toUpperCase();
    const largeur = largeurEspacee(ctx, mot, m.piedTexte, 0.24);
    dessinerTexteEspace(ctx, mot, (format.width - largeur) / 2, m.piedBase, m.piedTexte, 0.24);
  }

  // À droite : le texte qu'on a écrit, ou « GLISSE → » par défaut tant qu'il
  // reste une carte derrière. Un texte explicite l'emporte toujours — c'est le
  // seul moyen de signer la DERNIÈRE carte (« merci », « lien en bio »…).
  const motDroite = droite ? String(droite).toUpperCase() : index < total - 1 ? "GLISSE" : null;
  if (!motDroite) return;

  const avecFleche = !droite && index < total - 1;
  const fleche = avecFleche ? m.piedTexte * 1.5 : 0;
  const largeur = largeurEspacee(ctx, motDroite, m.piedTexte, 0.24);
  dessinerTexteEspace(
    ctx,
    motDroite,
    format.width - m.pad - largeur - fleche,
    m.piedBase,
    m.piedTexte,
    0.24,
  );

  if (!avecFleche) return;
  // Flèche horizontale, tracée à la main. Le canvas SAIT afficher U+2192 — il
  // retombe sur une fonte système — mais justement : la flèche arriverait dans
  // un dessin qui n'est pas celui d'Ubuntu, et changerait d'un appareil à
  // l'autre. On la trace pour qu'elle soit la même partout.
  const y = m.piedBase - m.piedTexte * 0.32;
  const x1 = format.width - m.pad;
  ctx.strokeStyle = th.encreFaible;
  ctx.lineWidth = Math.max(1.5, 1.8 * m.k);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1 - fleche * 0.9, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x1 - m.piedTexte * 0.34, y - m.piedTexte * 0.3);
  ctx.lineTo(x1, y);
  ctx.lineTo(x1 - m.piedTexte * 0.34, y + m.piedTexte * 0.3);
  ctx.stroke();
}

/* ------------------------------------------------------------------ le profil */

/**
 * LA SILHOUETTE ALTIMÉTRIQUE, dans le style de l'export a posteriori
 * (services/live-journal/src/og/profil.ts) : le relief complet en filet clair,
 * la portion acquise en aire à demi transparente surmontée d'une crête presque
 * pleine. Les opacités viennent de là — elles ont été RELEVÉES sur la maquette,
 * pas choisies, et on ne les redécide pas ici.
 *
 * Une seule chose change : quand l'itinéraire est découpé en journées, l'aire
 * prend LA COULEUR DE SA JOURNÉE. C'est ce qui fait que le profil et la carte
 * se lisent ensemble au lieu de répéter la même information deux fois.
 */
const AIRE_OPACITE = 0.46;
const CRETE_OPACITE = 0.9;

function dessinerProfil(ctx, boite, th, options) {
  const { profil, totalKm, segments, couleurs, doneKm } = options;
  const points = (profil ?? []).filter((p) => Number.isFinite(p?.km) && Number.isFinite(p?.alt));
  if (points.length < 2) return;
  const total = totalKm > 0 ? totalKm : points[points.length - 1].km;
  if (!(total > 0)) return;

  const alts = points.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const amplitude = Math.max(1, max - min);

  /* Les altitudes se posent dans une GOUTTIÈRE réservée à droite, pas par-dessus
     le relief : sur une boucle, l'arrivée redescend au niveau du départ et le
     « 900 m » tombait pile sur la fin du tracé. La silhouette est donc tracée
     un peu plus étroite — c'est la même convention qu'un axe de graphique. */
  const tailleAlt = Math.max(11, boite.height * 0.115);
  let gouttiere = 0;
  if (options.altitudes !== false) {
    ctx.save();
    ctx.font = `400 ${tailleAlt}px ${options.police ?? "sans-serif"}`;
    gouttiere =
      Math.max(
        ctx.measureText(`${formatEntier(max)} m`).width,
        ctx.measureText(`${formatEntier(min)} m`).width,
      ) + tailleAlt * 0.7;
    ctx.restore();
  }
  const largeurTrace = Math.max(boite.width * 0.5, boite.width - gouttiere);

  const X = (km) => boite.x + (Math.max(0, Math.min(total, km)) / total) * largeurTrace;
  const Y = (alt) => boite.y + (1 - (alt - min) / amplitude) * boite.height;
  const base = boite.y + boite.height;

  // Le relief entier : filet clair, jamais rempli — il n'est pas encore acquis.
  ctx.beginPath();
  ctx.moveTo(X(points[0].km), Y(points[0].alt));
  for (const p of points) ctx.lineTo(X(p.km), Y(p.alt));
  ctx.strokeStyle = th.profilRestant;
  ctx.lineWidth = Math.max(2, boite.height * 0.017);
  ctx.lineJoin = "round";
  ctx.stroke();

  /** Une aire + sa crête, sur l'intervalle [kmA, kmB]. */
  const aire = (kmA, kmB, couleur) => {
    const dedans = points.filter((p) => p.km >= kmA && p.km <= kmB);
    if (dedans.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(X(dedans[0].km), base);
    for (const p of dedans) ctx.lineTo(X(p.km), Y(p.alt));
    ctx.lineTo(X(dedans[dedans.length - 1].km), base);
    ctx.closePath();
    ctx.globalAlpha = AIRE_OPACITE;
    ctx.fillStyle = couleur;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(X(dedans[0].km), Y(dedans[0].alt));
    for (const p of dedans) ctx.lineTo(X(p.km), Y(p.alt));
    ctx.globalAlpha = CRETE_OPACITE;
    ctx.strokeStyle = couleur;
    ctx.lineWidth = Math.max(3, boite.height * 0.027);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  if (segments?.length > 1) {
    segments.forEach((s, i) => aire(s.kmDebut, s.kmFin, couleurs[i] ?? th.accent));
  } else if (doneKm > 0) {
    aire(0, doneKm, th.accent);
    if (doneKm < total) {
      const x = X(doneKm);
      ctx.save();
      ctx.setLineDash([7 * (boite.height / 150), 7 * (boite.height / 150)]);
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = Math.max(2, boite.height * 0.02);
      ctx.beginPath();
      ctx.moveTo(x, boite.y - boite.height * 0.04);
      ctx.lineTo(x, base);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Les bornes de journée, en pointillés discrets : c'est là qu'on dort.
  if (segments?.length > 1) {
    ctx.save();
    ctx.setLineDash([4 * (boite.height / 150), 6 * (boite.height / 150)]);
    ctx.strokeStyle = th.filet;
    ctx.lineWidth = Math.max(1, boite.height * 0.012);
    for (const s of segments.slice(1)) {
      ctx.beginPath();
      ctx.moveTo(X(s.kmDebut), boite.y);
      ctx.lineTo(X(s.kmDebut), base);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Les deux altitudes qui bornent la silhouette. Discrètes par construction :
     ce sont des REPÈRES, pas une échelle — le profil reste une silhouette
     étirée sur toute la hauteur, comme celui de /live. Le maximum se pose au ras
     du plafond, le minimum sur la ligne de base, avec un tiret de rappel. */
  if (options.altitudes !== false) {
    ctx.font = `400 ${tailleAlt}px ${options.police ?? "sans-serif"}`;
    ctx.fillStyle = th.encreFaible;
    ctx.textAlign = "right";
    const x = boite.x + boite.width;
    const yMax = boite.y + tailleAlt * 0.9;
    const yMin = base - tailleAlt * 0.14;
    ctx.fillText(`${formatEntier(max)} m`, x, yMax);
    ctx.fillText(`${formatEntier(min)} m`, x, yMin);
    ctx.textAlign = "left";

    // Deux tirets fins relient le chiffre au niveau qu'il désigne — sans eux,
    // les nombres flottent et rien ne dit qu'ils bornent la silhouette.
    ctx.strokeStyle = th.filet;
    ctx.lineWidth = Math.max(1, boite.height * 0.008);
    for (const y of [yMax - tailleAlt * 0.32, yMin - tailleAlt * 0.32]) {
      ctx.beginPath();
      ctx.moveTo(boite.x + largeurTrace + tailleAlt * 0.2, y);
      ctx.lineTo(boite.x + boite.width - gouttiere + tailleAlt * 0.45, y);
      ctx.stroke();
    }
  }
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
 * son étiquette par-dessus la bande d'en-tête — vu du premier coup sur le Tour
 * des Écrins, où J1 recouvrait « THE LOCOMOTION LAB ».
 */
function calerEtiquette(boite, format, m, fenetre) {
  boite.x = borne(boite.x, m.pad, format.width - m.pad - boite.width);
  boite.y = borne(boite.y, m.bandeH + m.etiquette * 0.5, fenetre.y + fenetre.height - boite.height);
  return boite;
}

/** Dernier filet : déplacée à la main, une étiquette peut aller où on veut —
 *  mais jamais entièrement hors de l'image, d'où on ne la rattraperait plus. */
function dansLeCadre(boite, format) {
  boite.x = borne(boite.x, 0, format.width - boite.width);
  boite.y = borne(boite.y, 0, format.height - boite.height);
  return boite;
}

function dessinerEtiquette(ctx, texte, boite, couleur, m, th, police) {
  ctx.save();
  rectArrondi(ctx, boite.x, boite.y, boite.width, boite.height, boite.height / 2);
  ctx.fillStyle = th.cle === "clair" ? "rgba(254, 251, 246, 0.9)" : "rgba(16, 18, 14, 0.84)";
  ctx.fill();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = Math.max(1.5, m.k * 2);
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const cy = boite.y + boite.height / 2;
  ctx.beginPath();
  ctx.arc(boite.x + boite.padX + boite.pastille / 2, cy, boite.pastille / 2, 0, Math.PI * 2);
  ctx.fillStyle = couleur;
  ctx.fill();

  ctx.font = `500 ${m.etiquette}px ${police}`;
  ctx.fillStyle = th.encre;
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

function couleursDesJours(carte, segments) {
  return segments.map(
    (_, i) => carte.etiquettes?.[i]?.couleur ?? PALETTE_JOURS[i % PALETTE_JOURS.length],
  );
}

/** Le pied de page factuel d'une carte : les chiffres de l'itinéraire, ou ceux
 *  de la sortie quand la trace a été vécue. */
function ligneFactuelle(trace, bilan) {
  if (!trace) return "";
  const bouts = [
    trace.totalKm > 0 ? `${formatEntier(trace.totalKm)} km` : "",
    trace.dPlusM > 0 ? `${formatEntier(trace.dPlusM)} m D+` : "",
  ];
  if (bilan && trace.dureeSecondes > 0) bouts.push(dureeCourte(trace.dureeSecondes));
  return bouts.filter(Boolean).join("   ·   ");
}

/**
 * LA CARTE — l'itinéraire, son profil, découpés en journées.
 *
 * Renvoie les boîtes des étiquettes : l'atelier en a besoin pour savoir ce
 * qu'on attrape à la souris.
 */
function dessinerCarte(ctx, format, o) {
  const { carte, trace, segments, police, logo, fond, m, th, index, total } = o;
  const boites = [];
  const fenetre = fenetreCarte(format);
  const view = trace?.coords?.length ? vueDeLaCarte(trace.coords, format.cle) : null;

  if (view && fond && carte.afficherFond !== false) {
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
    ctx.fillStyle = th.voileCarte;
    ctx.fillRect(0, 0, format.width, format.height);
  }
  voileTexte(ctx, format, th, fenetre.y + fenetre.height);
  // La bande d'en-tête doit rester lisible par-dessus les tuiles.
  if (view && fond && carte.afficherFond !== false) {
    const g = ctx.createLinearGradient(0, 0, 0, m.bandeH * 1.4);
    g.addColorStop(0, `rgba(${th.voileTexte}, 0.8)`);
    g.addColorStop(1, `rgba(${th.voileTexte}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, format.width, m.bandeH * 1.4);
  }

  const couleurs = couleursDesJours(carte, segments);

  if (view) {
    const epaisseur = Math.max(3, 7.5 * m.k);
    // L'itinéraire ENTIER, en sourdine : il tient la forme du parcours même là
    // où aucune journée n'est mise en avant.
    polyligne(
      ctx,
      decimerPixels(trace.coords.map((c) => view.project(c))),
      th.cle === "clair" ? "rgba(34, 36, 30, 0.28)" : "rgba(254, 251, 246, 0.24)",
      epaisseur * 0.62,
      false,
    );
    segments.forEach((seg, i) => {
      polyligne(ctx, decimerPixels(seg.coords.map((c) => view.project(c))), couleurs[i], epaisseur, true);
    });

    // Étiquettes en DERNIER : sur tous les tracés, jamais dessous.
    segments.forEach((seg, i) => {
      const etq = carte.etiquettes?.[i] ?? {};
      if (etq.masquee) return;
      const texte = etq.texte ?? `J${i + 1}`;
      if (!texte.trim()) return;
      const ancre = ancreDuSegment(seg, view.project);
      if (!ancre) return;
      const boite = calerEtiquette(boiteEtiquette(ctx, texte, ancre, m, police), format, m, fenetre);
      boite.x += etq.dx ?? 0;
      boite.y += etq.dy ?? 0;
      dansLeCadre(boite, format);
      dessinerEtiquette(ctx, texte, boite, couleurs[i], m, th, police);
      boites.push({ index: i, ...boite });
    });
  }

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
  });

  /* Bloc du bas : profil, surtitre, titre, ligne factuelle. Construit de bas en
     haut pour que le titre pousse le profil, jamais l'inverse. */
  let y = m.piedFilet - Math.round(34 * m.k);

  const factuelle = carte.pied ?? ligneFactuelle(trace, carte.bilan);
  if (factuelle) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    ctx.fillText(factuelle, m.pad, y);
    y -= m.corps * 1.9;
  }
  if (carte.titre) {
    ctx.font = `700 ${m.titre}px ${police}`;
    ctx.fillStyle = th.encre;
    const ls = lignes(ctx, carte.titre, format.width - m.pad * 2);
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      ctx.fillText(ls[i], m.pad, y);
      y -= m.titre * 1.12;
    }
    y -= m.surtitre * 0.5;
  }
  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, police, carte.surtitre, m.pad, y);
    y -= m.surtitre * 2.1;
  }

  if (carte.afficherProfil !== false && trace?.profil?.length > 1) {
    const boite = {
      x: m.pad,
      y: y - m.profilH,
      width: format.width - m.pad * 2,
      height: m.profilH,
    };
    dessinerProfil(ctx, boite, th, {
      profil: trace.profil,
      totalKm: trace.totalKm,
      segments: segments.length > 1 ? segments : null,
      couleurs,
      doneKm: carte.bilan ? trace.totalKm : 0,
      altitudes: carte.afficherAltitudes !== false,
      police,
    });
  }

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
  });
  if (view && fond && carte.afficherFond !== false) {
    ctx.font = `400 ${Math.round(m.piedTexte * 0.86)}px ${police}`;
    ctx.fillStyle = th.encreFaible;
    ctx.textAlign = "right";
    ctx.fillText(ATTRIBUTION, format.width - m.pad, m.bandeH - Math.round(14 * m.k));
    ctx.textAlign = "left";
  }
  return boites;
}

/**
 * LA PHOTO — plein cadre, le texte posé dessus.
 *
 * Les deux dégradés se règlent SÉPARÉMENT : une photo dont le ciel est déjà
 * sombre n'a pas besoin d'être assombrie en haut, et une photo dont on veut
 * garder le premier plan intact n'a pas besoin de l'être en bas. Sans dégradé,
 * le texte reste écrit — c'est à l'auteur de vérifier qu'il se lit.
 */
function dessinerPhoto(ctx, format, o) {
  const { carte, police, logo, m, th, index, total } = o;

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      format,
      carte.ancrage ?? 0.5,
    );
    if (c) ctx.drawImage(carte.image, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
  }
  if (carte.degradeBas !== false) voileTexte(ctx, format, th, format.height * 0.42);
  if (carte.degradeHaut !== false && carte.image) {
    const g = ctx.createLinearGradient(0, 0, 0, m.bandeH * 1.5);
    g.addColorStop(0, `rgba(${th.voileTexte}, 0.72)`);
    g.addColorStop(1, `rgba(${th.voileTexte}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, format.width, m.bandeH * 1.5);
  }

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    filet: !carte.image,
  });

  let y = m.piedFilet - Math.round(34 * m.k);
  const factuelle = carte.pied ?? "";
  if (factuelle) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    ctx.fillText(factuelle, m.pad, y);
    y -= m.corps * 1.9;
  }
  if (carte.texte) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    const blocs = paragraphes(ctx, carte.texte, format.width - m.pad * 2);
    for (let b = blocs.length - 1; b >= 0; b -= 1) {
      for (let i = blocs[b].length - 1; i >= 0; i -= 1) {
        ctx.fillText(blocs[b][i], m.pad, y);
        y -= m.corps * 1.52;
      }
      y -= m.corps * 0.5;
    }
    y -= m.corps * 0.2;
  }
  if (carte.titre) {
    ctx.font = `700 ${m.titre}px ${police}`;
    ctx.fillStyle = th.encre;
    const ls = lignes(ctx, carte.titre, format.width - m.pad * 2);
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      ctx.fillText(ls[i], m.pad, y);
      y -= m.titre * 1.12;
    }
    y -= m.surtitre * 0.5;
  }
  if (carte.surtitre) surtitre(ctx, m, th, police, carte.surtitre, m.pad, y);

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
  });
  return [];
}

/** LE TEXTE — surtitre, titre, paragraphes. La respiration du carrousel. */
function dessinerTexte(ctx, format, o) {
  const { carte, police, logo, m, th, index, total } = o;
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
  });

  const largeur = format.width - m.pad * 2;
  let y = m.bandeH + Math.round(112 * m.k);

  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, police, carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  y = blocTitreEtCorps(ctx, format, m, th, police, carte, y, largeur);

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
  });
  return [];
}

/**
 * Le titre puis les paragraphes, de haut en bas, à partir de `y`.
 *
 * `y` est le BAS de ce qui précède, pas la ligne de base du titre : on descend
 * d'abord de la hampe du titre (~0,86 em). Sans ça, un titre de 66 px posé
 * directement sur `y` remonte ses capitales par-dessus le surtitre — c'est
 * exactement ce qui est arrivé à « Un massif, une boucle, aucune assistance. »
 */
function blocTitreEtCorps(ctx, format, m, th, police, carte, yDepart, largeur, echelleTitre = 1) {
  let y = yDepart;
  const tailleTitre = Math.round(m.titre * echelleTitre);

  if (carte.titre) {
    ctx.font = `700 ${tailleTitre}px ${police}`;
    ctx.fillStyle = th.encre;
    const ls = lignes(ctx, carte.titre, largeur);
    y += tailleTitre * 0.86;
    ls.forEach((l, i) => {
      if (i > 0) y += tailleTitre * 1.16;
      ctx.fillText(l, m.pad, y);
    });
    // 2,2 corps et pas 1,7 : la jambe du titre descend sous sa ligne de base et
    // la hampe du corps remonte — l'écart utile est bien plus petit que l'écart
    // nominal, et « assistance. » collait à « Quatre jours ».
    y += m.corps * 2.2;
  }
  if (carte.texte) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    if (!carte.titre) y += m.corps;
    const blocs = paragraphes(ctx, carte.texte, largeur);
    blocs.forEach((bloc, b) => {
      if (b > 0) y += m.corps * 0.8;
      bloc.forEach((l, i) => {
        if (i > 0 || b > 0) y += m.corps * 1.55;
        ctx.fillText(l, m.pad, y);
      });
    });
  }
  return y;
}

/** LES CHIFFRES — la statistique en très grand. Tout l'itinéraire, ou une
 *  seule journée. */
function dessinerChiffres(ctx, format, o) {
  const { carte, trace, segments, police, logo, m, th, index, total } = o;
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
  });

  const seg = carte.segment != null ? segments[carte.segment] : null;
  const distanceKm = Number.isFinite(carte.distanceKm)
    ? carte.distanceKm
    : (seg?.distanceKm ?? trace?.totalKm ?? 0);
  const dPlusM = Number.isFinite(carte.dPlusM) ? carte.dPlusM : (seg?.dPlusM ?? trace?.dPlusM ?? 0);
  const dMinusM = Number.isFinite(carte.dMinusM) ? carte.dMinusM : (seg ? 0 : (trace?.dMinusM ?? 0));

  let y = m.bandeH + Math.round(150 * m.k);

  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, police, carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  if (carte.titre) {
    const tailleTitre = Math.round(m.titre * 0.82);
    ctx.font = `700 ${tailleTitre}px ${police}`;
    ctx.fillStyle = th.encre;
    const ls = lignes(ctx, carte.titre, format.width - m.pad * 2);
    y += tailleTitre * 0.86;
    ls.forEach((l, i) => {
      if (i > 0) y += tailleTitre * 1.16;
      ctx.fillText(l, m.pad, y);
    });
  }

  // Le grand chiffre, et son unité posée sur la même ligne de base. Le pas est
  // celui de la HAUTEUR DU CHIFFRE, pas du titre : c'est lui qui occupe la
  // place, et un pas trop court le collait au titre.
  y += m.chiffre * 1.1;
  ctx.font = `700 ${m.chiffre}px ${police}`;
  ctx.fillStyle = th.accent;
  const grand = formatKm(distanceKm);
  ctx.fillText(grand, m.pad, y);
  const largeurGrand = ctx.measureText(grand).width;
  ctx.font = `400 ${m.unite}px ${police}`;
  ctx.fillStyle = th.encreFaible;
  ctx.fillText(carte.bilan ? "km parcourus" : "km", m.pad + largeurGrand + m.unite * 0.5, y);
  y += m.chiffre * 0.3 + m.stat;

  ctx.font = `500 ${m.stat}px ${police}`;
  ctx.fillStyle = th.encre;
  ctx.strokeStyle = th.encre;
  let curseur = m.pad;
  for (const [i, s] of segmentsDeStats({ distanceKm: NaN, dPlusM, dMinusM }).entries()) {
    if (i > 0) {
      ctx.fillText("   ·   ", curseur, y);
      curseur += ctx.measureText("   ·   ").width;
    }
    ctx.fillText(s.texte, curseur, y);
    curseur += ctx.measureText(s.texte).width;
    if (s.fleche) {
      curseur += m.stat * 0.26;
      curseur += dessinerFleche(ctx, curseur, y, m.stat, s.fleche);
    }
  }
  if (carte.bilan && trace?.dureeSecondes > 0) {
    y += m.stat * 1.5;
    ctx.font = `400 ${m.stat}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    ctx.fillText(dureeCourte(trace.dureeSecondes), m.pad, y);
  }

  if (carte.texte) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    let yy = y + m.corps * 2.4;
    for (const bloc of paragraphes(ctx, carte.texte, format.width - m.pad * 2)) {
      for (const l of bloc) {
        ctx.fillText(l, m.pad, yy);
        yy += m.corps * 1.55;
      }
      yy += m.corps * 0.75;
    }
  }

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
  });
  return [];
}

/* ------------------------------------------------------------------ dispatcheur */

/**
 * LE BANDEAU — une photo en haut, le texte dessous, sur le fond du thème.
 *
 * La différence avec le gabarit Photo n'est pas cosmétique : ici l'image ne
 * porte PAS le texte, elle l'annonce. Le texte revient sur l'aplat du thème, où
 * il se lit toujours, quelle que soit la photo. C'est la mise en page qui
 * supporte le plus de photos différentes sans réglage.
 *
 * Le bas du bandeau se fond dans le fond de page : une coupure franche
 * ressemblerait à une image collée, pas à une planche composée.
 */
function dessinerBandeau(ctx, format, o) {
  const { carte, police, logo, m, th, index, total } = o;
  const hauteur = Math.round(format.height * (carte.bandeauPart ?? 0.42));

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      { width: format.width, height: hauteur },
      carte.ancrage ?? 0.5,
    );
    if (c) ctx.drawImage(carte.image, c.sx, c.sy, c.sw, c.sh, 0, 0, format.width, hauteur);

    if (carte.degradeBas !== false) {
      const fondu = Math.round(hauteur * 0.42);
      const g = ctx.createLinearGradient(0, hauteur - fondu, 0, hauteur);
      g.addColorStop(0, `rgba(${th.voileTexte}, 0)`);
      g.addColorStop(0.55, `rgba(${th.voileTexte}, 0.55)`);
      g.addColorStop(1, `rgba(${th.voileTexte}, 1)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, hauteur - fondu, format.width, fondu);
    }
    if (carte.degradeHaut !== false) {
      const g = ctx.createLinearGradient(0, 0, 0, m.bandeH * 1.4);
      g.addColorStop(0, `rgba(${th.voileTexte}, 0.74)`);
      g.addColorStop(1, `rgba(${th.voileTexte}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, format.width, m.bandeH * 1.4);
    }
  } else {
    ctx.fillStyle = th.filet;
    ctx.fillRect(0, 0, format.width, hauteur);
  }

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    filet: !carte.image,
  });

  const largeur = format.width - m.pad * 2;
  let y = hauteur + Math.round(74 * m.k);
  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, police, carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  blocTitreEtCorps(ctx, format, m, th, police, carte, y, largeur);

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
  });
  return [];
}

/**
 * LA FICHE — un libellé à gauche, une valeur en gros à droite, une ligne par
 * donnée.
 *
 * C'est le gabarit qui détaille des chiffres sans les mettre en très grand :
 * là où « Chiffres » assène UNE valeur, la fiche en aligne cinq et les rend
 * comparables. Les valeurs sont du TEXTE LIBRE — « 4 jours », « 6,2 kg »,
 * « aucun » : l'atelier ne sait pas ce que pèse ton sac, et n'a pas à le
 * deviner.
 */
function dessinerFiche(ctx, format, o) {
  const { carte, police, logo, m, th, index, total } = o;

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
  });

  let y = m.bandeH + Math.round(118 * m.k);
  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, police, carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  if (carte.titre) {
    const taille = Math.round(m.titre * 0.86);
    ctx.font = `700 ${taille}px ${police}`;
    ctx.fillStyle = th.encre;
    y += taille * 0.86;
    ctx.fillText(carte.titre, m.pad, y);
    y += Math.round(30 * m.k);
    // Le filet ambre sous le titre : le même geste que le surtitre, à l'autre
    // bout du bloc — il ferme le titre au lieu de l'ouvrir.
    ctx.fillStyle = th.accent;
    ctx.fillRect(m.pad, y, Math.round(96 * m.k), Math.max(2, 2.5 * m.k));
    y += Math.round(46 * m.k);
  }

  const lignesFiche = (carte.fiche ?? []).filter((l) => l && (l.label || l.valeur));
  const libelle = Math.round(16 * m.k);
  const valeur = Math.round(46 * m.k);
  const pasLigne = Math.round(96 * m.k);

  for (const [i, l] of lignesFiche.entries()) {
    if (i > 0) {
      ctx.fillStyle = th.filet;
      ctx.fillRect(m.pad, y, format.width - m.pad * 2, Math.max(1, 1.2 * m.k));
    }
    const base = y + pasLigne * 0.66;

    ctx.font = `400 ${libelle}px ${police}`;
    ctx.fillStyle = th.encreFaible;
    dessinerTexteEspace(ctx, String(l.label ?? "").toUpperCase(), m.pad, base, libelle, 0.26);

    ctx.font = `700 ${valeur}px ${police}`;
    ctx.fillStyle = l.accent ? th.accent : th.encre;
    ctx.textAlign = "right";
    ctx.fillText(String(l.valeur ?? ""), format.width - m.pad, base + valeur * 0.1);
    ctx.textAlign = "left";

    y += pasLigne;
  }

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
  });
  return [];
}

const RENDUS = {
  carte: dessinerCarte,
  bandeau: dessinerBandeau,
  photo: dessinerPhoto,
  texte: dessinerTexte,
  fiche: dessinerFiche,
  chiffres: dessinerChiffres,
};

/**
 * Dessine UNE carte du carrousel. Renvoie les boîtes des étiquettes déplaçables
 * (vide pour les gabarits qui n'en ont pas).
 */
export function dessinerCartePartage(ctx, options) {
  const format = FORMATS[options.format] ?? FORMATS.carrousel;
  const th = THEMES[options.theme] ?? THEMES.sombre;
  const m = metriques(format);
  const police = options.police ?? "sans-serif";

  ctx.clearRect(0, 0, format.width, format.height);
  ctx.fillStyle = th.fond;
  ctx.fillRect(0, 0, format.width, format.height);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const rendu = RENDUS[options.carte?.gabarit] ?? dessinerTexte;
  return rendu(ctx, format, {
    ...options,
    police,
    m,
    th,
    segments: options.segments ?? [],
    index: options.index ?? 0,
    total: options.total ?? 1,
  });
}
