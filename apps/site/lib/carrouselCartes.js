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
import {
  ESPACEMENT,
  analyserRiche,
  blocsDeTexte,
  dessinerLigneRiche,
  largeurLigne,
  hauteurBlocs,
  lignesRiches,
  poserBlocs,
} from "./carrouselTexte";
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
  { cle: "cloture", label: "Clôture", aide: "La marque cerclée, et le mot de la fin." },
];

/** Ce que porte la bande d'en-tête : le logo, le nom, les deux, ou rien. */
export const MARQUES = [
  { cle: "", label: "Logo + nom" },
  { cle: "sans-nom", label: "Logo seul" },
  { cle: "sans-logo", label: "Nom seul" },
  { cle: "rien", label: "Rien" },
];

/** Ce que fait la flèche du pied de page. */
/**
 * LES POLICES DISPONIBLES — celles de la charte, et rien d'autre.
 *
 * Ubuntu porte la voix courante, Lora l'accent (vraies italiques), Ubuntu Mono
 * la voix « instrument » (chiffres, références). Chaque planche choisit la
 * sienne pour le titre, le surtitre et le corps SÉPARÉMENT : c'est le réglage
 * qui change le plus le ton d'une image, et il ne coûte rien puisque les trois
 * fontes sont déjà chargées par le site (packages/ui/src/fonts.ts).
 *
 * La VALEUR est une clé, jamais une famille CSS : l'atelier résout les trois
 * familles au moment du rendu et les passe en bloc (`polices`). Écrire
 * « Ubuntu » dans une carte enregistrée l'aurait figée sur un nom de fonte qui
 * ne veut rien dire hors de ce navigateur.
 */
export const POLICES = [
  { cle: "sans", label: "Ubuntu — la police du labo" },
  { cle: "serif", label: "Lora — serif d'accent" },
  { cle: "mono", label: "Ubuntu Mono — instrument" },
];

export const FLECHES = [
  { cle: "auto", label: "Auto (sauf dernière)" },
  { cle: "toujours", label: "Toujours" },
  { cle: "jamais", label: "Jamais" },
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

/**
 * Les corps de référence, en pixels d'une planche de 1080 de large.
 *
 * Ce sont les valeurs relevées sur les aperçus de reel du labo : titre 65,
 * sous-titre (le corps) 38, filet ambre 10 d'épaisseur. Les autres s'y accordent
 * — l'en-tête et le pied étaient à 17, illisibles une fois la planche postée,
 * ils montent à 22. Chaque carte peut les redéfinir (cf. `mesuresDeLaCarte`).
 */
export const CORPS = {
  entete: 22,
  surtitre: 22,
  titre: 65,
  corps: 38,
  pied: 22,
  filet: 10,
  /** La fiche : le libellé à gauche, la valeur en gros à droite. */
  ficheLabel: 16,
  ficheValeur: 46,
  /** Le côté du carré du logo, dans la bande d'en-tête. */
  logo: 42,
};

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
    bandeH: Math.round(haut + 128 * k),
    entete: Math.round(CORPS.entete * k),
    surtitre: Math.round(CORPS.surtitre * k),
    filetSurtitre: Math.round(CORPS.filet * k),
    titre: Math.round((format.cle === "carre" ? CORPS.titre * 0.88 : CORPS.titre) * k),
    corps: Math.round(CORPS.corps * k),
    chiffre: Math.round(132 * k),
    unite: Math.round(34 * k),
    stat: Math.round(42 * k),
    piedTexte: Math.round(CORPS.pied * k),
    etiquette: Math.round(29 * k),
    ficheLabel: Math.round(CORPS.ficheLabel * k),
    ficheValeur: Math.round(CORPS.ficheValeur * k),
    logo: Math.round(CORPS.logo * k),
    profilH: Math.round(150 * k),
    /** Ligne de base du pied, et filet juste au-dessus. */
    piedBase: Math.round(bas - 46 * k),
    piedFilet: Math.round(bas - 96 * k),
  };
}

/**
 * Les mesures et les encres EFFECTIVES d'une carte : celles du format et du
 * thème, écrasées par ce que la carte redéfinit.
 *
 * Tout est réglable, mais rien n'est obligatoire : une carte qui ne dit rien
 * prend les valeurs de la charte, et deux planches faites à six mois d'écart se
 * ressemblent encore. C'est la différence entre « personnalisable » et Canva.
 */
function mesuresDeLaCarte(carte, m, th) {
  const px = (valeur, defaut) =>
    Math.round((Number.isFinite(valeur) && valeur > 0 ? valeur : defaut) * m.k);
  return [
    {
      ...m,
      entete: px(carte?.tailleEntete, CORPS.entete),
      surtitre: px(carte?.tailleSurtitre, CORPS.surtitre),
      filetSurtitre: px(carte?.epaisseurFilet, CORPS.filet),
      titre: px(carte?.tailleTitre, m.titre / m.k),
      corps: px(carte?.tailleCorps, CORPS.corps),
      piedTexte: px(carte?.taillePied, CORPS.pied),
      ficheLabel: px(carte?.tailleFicheLabel, CORPS.ficheLabel),
      ficheValeur: px(carte?.tailleFicheValeur, CORPS.ficheValeur),
      logo: px(carte?.tailleLogo, CORPS.logo),
    },
    {
      ...th,
      encre: carte?.couleurTitre || th.encre,
      encreDouce: carte?.couleurCorps || th.encreDouce,
      accent: carte?.couleurAccent || th.accent,
    },
  ];
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

/**
 * L'INTENSITÉ D'UN DÉGRADÉ, en une seule lecture.
 *
 * Les planches d'avant réglaient les voiles par une case à cocher : `false` =
 * éteint, tout le reste = la valeur du gabarit. On garde ces deux cas — les
 * projets déjà enregistrés les portent — et on accepte en plus un NOMBRE, qui
 * est l'opacité du bord le plus dense. Une photo au ciel déjà sombre n'a plus à
 * choisir entre « rien » et « tout ».
 */
function intensite(v, defaut) {
  if (v === false) return 0;
  if (v === true || v == null || v === "") return defaut;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : defaut;
}

/**
 * Le voile du bas, qui rend le texte lisible sur une image.
 *
 * `force` MULTIPLIE le dégradé de référence — 1 est exactement le voile des
 * planches d'avant, 0 l'éteint. C'est volontaire : le réglage doit pouvoir
 * s'ouvrir sans redessiner les carrousels déjà publiés.
 */
function voileTexte(ctx, format, th, depuis, force = 1) {
  if (!(force > 0)) return;
  const a = (v) => `rgba(${th.voileTexte}, ${(v * force).toFixed(3)})`;
  const g = ctx.createLinearGradient(0, depuis, 0, format.height);
  g.addColorStop(0, `rgba(${th.voileTexte}, 0)`);
  g.addColorStop(0.4, a(0.5));
  g.addColorStop(0.75, a(0.82));
  g.addColorStop(1, a(0.92));
  ctx.fillStyle = g;
  ctx.fillRect(0, depuis, format.width, format.height - depuis);
}

/** Le voile du haut, sous la bande d'en-tête. Même contrat que `voileTexte`. */
function voileEntete(ctx, format, m, th, force, jusqu = 1.4) {
  if (!(force > 0)) return;
  const bas = m.bandeH * jusqu;
  const g = ctx.createLinearGradient(0, 0, 0, bas);
  g.addColorStop(0, `rgba(${th.voileTexte}, ${force.toFixed(3)})`);
  g.addColorStop(1, `rgba(${th.voileTexte}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, format.width, bas);
}

/**
 * La bande d'en-tête : la marque du labo à gauche, l'intitulé de section à
 * droite, un filet dessous. C'est la ligne qui dit « c'est une planche du
 * labo » sans avoir à occuper le titre.
 */
function bandeEntete(ctx, format, m, th, police, { texte, accent, logo, marque, filet = true, opacite = 1 }) {
  const base = m.bandeH - Math.round(48 * m.k);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacite));

  let x = m.pad;
  if (logo && marque !== "sans-logo" && marque !== "rien") {
    const centre = base - m.entete * CENTRE_CAPITALES;
    ctx.globalAlpha = MARQUE_OPACITE;
    ctx.drawImage(logo, x, centre - m.logo / 2, m.logo, m.logo);
    ctx.globalAlpha = 1;
    x += m.logo + Math.round(m.entete * 0.5);
  }
  if (marque !== "sans-nom" && marque !== "rien") {
    ctx.font = `500 ${m.entete}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    dessinerTexteEspace(ctx, MARQUE, x, base, m.entete, 0.28);
  }

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
  ctx.restore();
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
  const filetL = Math.round(m.surtitre * 2.6);
  const epaisseur = Math.max(2, m.filetSurtitre);
  ctx.fillStyle = th.accent;
  // Le filet est ÉPAIS (10 px de référence) : c'est lui le point d'entrée du
  // regard, pas le petit texte qui le suit. Centré sur la hauteur de capitale
  // du surtitre, sinon il pend sous la ligne dès qu'il s'épaissit.
  ctx.fillRect(x, base - m.surtitre * CENTRE_CAPITALES - epaisseur / 2, filetL, epaisseur);

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

/**
 * Le pied : un filet, la pagination à gauche, « GLISSE → » à droite tant qu'il
 * reste une carte derrière. La flèche est DESSINÉE — les fontes du site sont
 * des sous-ensembles latins et n'ont pas U+2192 (elle sortirait en carré).
 */
/** Interligne d'un titre, en parts de son corps. */
const INTERLIGNE_TITRE = 1.16;

/** Un réglage numérique de la planche, sinon la valeur de la charte. */
function nombre(v, defaut) {
  return Number.isFinite(v) && v >= 0 ? v : defaut;
}

/** La famille RÉSOLUE d'un des trois rôles de texte (cf. `POLICES`). */
function policeDe(carte, champ, polices) {
  return polices[carte?.[champ]] ?? polices.sans;
}

/** Le style de base d'un titre et d'un corps — ce sur quoi le balisage vient
 *  poser ses variantes (cf. lib/carrouselTexte.js). */
function baseTitre(m, th, polices, carte, echelle = 1) {
  return {
    police: policeDe(carte, "policeTitre", polices),
    taille: Math.round(m.titre * echelle),
    graisse: 700,
    couleur: th.encre,
    accent: th.accent,
    // L'interligne du titre : un seul défaut pour TOUS les gabarits. Les
    // chemins « du bas vers le haut » en avaient un autre (1,12) — ce n'était
    // pas une décision, c'était une divergence.
    interligne: nombre(carte?.interligneTitre, INTERLIGNE_TITRE),
  };
}

/**
 * Le corps de texte — et, avec lui, TOUS les espacements de la planche.
 *
 * Ils voyagent DANS le style plutôt qu'en argument : mesure (`hauteurBlocs`) et
 * pose (`poserBlocs`) lisent alors forcément les mêmes valeurs. Un paramètre de
 * plus à passer, c'est un appelant qui l'oubliera — et un texte qui se dessine
 * ailleurs qu'où on l'a mesuré.
 */
function baseCorps(m, th, polices, carte) {
  return {
    police: policeDe(carte, "policeCorps", polices),
    taille: m.corps,
    graisse: 400,
    couleur: th.encreDouce,
    accent: th.accent,
    interligne: nombre(carte?.interligne, ESPACEMENT.interligne),
    entreBlocs: nombre(carte?.entreBlocs, ESPACEMENT.entreBlocs),
    respiration: nombre(carte?.respiration, ESPACEMENT.respiration),
    entreItems: nombre(carte?.entreItems, ESPACEMENT.entreItems),
    retraitListe: nombre(carte?.retraitListe, ESPACEMENT.retraitListe),
    alinea: nombre(carte?.alinea, ESPACEMENT.alinea),
  };
}

/**
 * LE FILET SOUS LE TITRE — un trait court qui ferme le bloc, à l'inverse du
 * filet du surtitre qui l'ouvre.
 *
 * Longueur et épaisseur se règlent : sous un titre de deux lignes en 80 px, un
 * trait de 96 × 2,5 ne pèse plus rien. Il suit le centrage du titre, sinon il
 * pendrait à gauche d'un bloc centré.
 *
 * Rend la nouvelle ordonnée — zéro si le filet est éteint, donc l'appelant peut
 * toujours chaîner.
 */
/** L'écart entre la ligne de base du titre et le filet. */
const AVANT_FILET_TITRE = 28;

/** La place que prend le filet sous le titre — c'est elle qu'on réserve dans
 *  les gabarits qui empilent du bas vers le haut. */
function hauteurFiletTitre(m, carte) {
  return (
    Math.round(AVANT_FILET_TITRE * m.k) +
    Math.max(1, Math.round(nombre(carte?.filetTitreEpaisseur, 4) * m.k))
  );
}

function filetSousTitre(ctx, m, th, carte, y, centre = null) {
  if (!carte.filetTitre) return y;
  const largeur = Math.round(nombre(carte.filetTitreLargeur, 96) * m.k);
  const epaisseur = Math.max(1, Math.round(nombre(carte.filetTitreEpaisseur, 4) * m.k));
  const yTrait = y + Math.round(AVANT_FILET_TITRE * m.k);
  ctx.fillStyle = carte.couleurFiletTitre || th.accent;
  ctx.fillRect(centre === null ? m.pad : centre - largeur / 2, yTrait, largeur, epaisseur);
  return yTrait + epaisseur;
}

/**
 * Pose des lignes déjà mises en page, de haut en bas, et rend l'ordonnée de la
 * DERNIÈRE ligne de base — pas celle d'après : c'est à l'appelant de décider de
 * l'espace qui suit, il est le seul à savoir ce qui vient.
 */
function poserLignes(ctx, lignes, x, y, base, { centre = null } = {}) {
  const interligne = base.interligne ?? INTERLIGNE_TITRE;
  let ligneBase = y;
  lignes.forEach((ligne, i) => {
    if (i > 0) ligneBase += base.taille * interligne;
    const gauche = centre === null ? x : centre - largeurLigne(ligne) / 2;
    dessinerLigneRiche(ctx, ligne, gauche, ligneBase, base);
  });
  return ligneBase;
}

function bandePied(ctx, format, m, th, police, { index, total, centre, droite, fleche = "auto", filet = true, opacite = 1 }) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacite));
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
  // « auto » : le mot par défaut et sa flèche tant qu'il reste une carte
  // derrière. « toujours » / « jamais » forcent la flèche — la première sert à
  // signer une dernière carte qui renvoie ailleurs (« lien en bio → »), la
  // seconde à laisser un pied nu.
  const resteUneCarte = index < total - 1;
  const motDroite = droite ? String(droite).toUpperCase() : resteUneCarte ? "GLISSE" : null;
  const avecFleche =
    fleche === "toujours" ? true : fleche === "jamais" ? false : !droite && resteUneCarte;
  if (!motDroite && !avecFleche) {
    ctx.restore();
    return;
  }
  const ecartFleche = avecFleche ? m.piedTexte * 1.5 : 0;
  const largeur = motDroite ? largeurEspacee(ctx, motDroite, m.piedTexte, 0.24) : 0;
  if (motDroite) {
    dessinerTexteEspace(
      ctx,
      motDroite,
      format.width - m.pad - largeur - ecartFleche,
      m.piedBase,
      m.piedTexte,
      0.24,
    );
  }

  if (!avecFleche) {
    ctx.restore();
    return;
  }
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
  ctx.moveTo(x1 - ecartFleche * 0.9, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x1 - m.piedTexte * 0.34, y - m.piedTexte * 0.3);
  ctx.lineTo(x1, y);
  ctx.lineTo(x1 - m.piedTexte * 0.34, y + m.piedTexte * 0.3);
  ctx.stroke();
  ctx.restore();
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
  const amplitude = Math.max(1, Math.max(...alts) - min);

  const X = (km) => boite.x + (Math.max(0, Math.min(total, km)) / total) * boite.width;
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
  const { carte, trace, police, polices, logo, fond, m, th, index, total } = o;
  const boites = [];
  const fenetre = fenetreCarte(format);

  /* LA TRACE DE CADRAGE n'est pas forcément celle qu'on dessine.
     Une série qui révèle l'itinéraire jour après jour (J1, puis J1+J2…) doit
     garder LE MÊME cadre d'une planche à l'autre : sinon la carte saute à
     chaque image et la série ne se lit plus comme un tout. On cadre donc sur
     la trace de référence — l'itinéraire complet, jamais tracé — et on ne
     dessine que ce que la carte demande. Même chose pour le profil : son
     domaine (les kilomètres en abscisse, les altitudes en ordonnée) vient de
     la référence, la couleur ne remplit que ce qui est acquis. */
  const cadre = o.traceCadre ?? trace;
  const view = cadre?.coords?.length ? vueDeLaCarte(cadre.coords, format.cle) : null;

  // `jusquA` : n'afficher que les n premières journées. `null` = tout.
  const segments =
    carte.jusquA == null ? (o.segments ?? []) : (o.segments ?? []).slice(0, carte.jusquA + 1);

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
  // LES DEUX DÉGRADÉS DE LA CARTE, réglables comme ceux des photos : le fond
  // topo est une image comme une autre, et sa densité change du tout au tout
  // entre une haute vallée enneigée et un fond de forêt.
  voileTexte(ctx, format, th, fenetre.y + fenetre.height, intensite(carte.degradeBas, 1));
  // La bande d'en-tête doit rester lisible par-dessus les tuiles.
  voileEntete(ctx, format, m, th, intensite(carte.degradeHaut, 0.8));

  const couleurs = couleursDesJours(carte, segments);

  if (view && cadre?.coords?.length) {
    const epaisseur = Math.max(3, 7.5 * m.k);
    // L'itinéraire ENTIER, en sourdine : il tient la forme du parcours même là
    // où aucune journée n'est mise en avant.
    polyligne(
      ctx,
      decimerPixels(cadre.coords.map((c) => view.project(c))),
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
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
  });

  /* Bloc du bas : profil, surtitre, titre, ligne factuelle. Construit de bas en
     haut pour que le titre pousse le profil, jamais l'inverse. */
  let y = m.piedFilet - Math.round(34 * m.k);

  const factuelle = carte.pied ?? ligneFactuelle(trace, carte.bilan);
  const largeurTexte = format.width - m.pad * 2;
  if (factuelle) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    ctx.fillText(factuelle, m.pad, y);
    y -= m.corps * 1.9;
  }
  if (carte.titre) {
    const bt = baseTitre(m, th, polices, carte);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeurTexte, bt);
    // Bloc construit du bas vers le haut : on réserve la place du filet AVANT
    // d'empiler le titre, puis on le pose une fois la dernière ligne connue.
    if (carte.filetTitre) y -= hauteurFiletTitre(m, carte);
    const basTitre = y;
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      dessinerLigneRiche(ctx, ls[i], m.pad, y, bt);
      y -= bt.taille * bt.interligne;
    }
    filetSousTitre(ctx, m, th, carte, basTitre);
    y -= m.surtitre * 0.5;
  }
  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, policeDe(carte, "policeSurtitre", polices), carte.surtitre, m.pad, y);
    y -= m.surtitre * 2.1;
  }

  if (carte.afficherProfil !== false && cadre?.profil?.length > 1) {
    const boite = {
      x: m.pad,
      y: y - m.profilH,
      width: format.width - m.pad * 2,
      height: m.profilH,
    };
    dessinerProfil(ctx, boite, th, {
      profil: cadre.profil,
      totalKm: cadre.totalKm,
      segments: segments.length > 1 ? segments : null,
      couleurs,
      doneKm: carte.jusquA != null ? (segments[segments.length - 1]?.kmFin ?? 0) : carte.bilan ? trace.totalKm : 0,
    });
  }

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
  });
  if (view && fond && carte.afficherFond !== false) attributionVerticale(ctx, format, m, th, police);
  return boites;
}

/**
 * L'attribution des tuiles, à la VERTICALE contre le bord droit.
 *
 * À l'horizontale elle prenait une ligne entière sous l'en-tête et se lisait
 * comme une information de la planche — alors que c'est une mention légale.
 * Debout dans la marge, elle est là, elle reste lisible de près, et elle
 * n'entre pas en concurrence avec le contenu. C'est la convention des cartes
 * papier.
 */
function attributionVerticale(ctx, format, m, th, police) {
  const taille = Math.round(m.piedTexte * 0.68);
  ctx.save();
  ctx.font = `400 ${taille}px ${police}`;
  ctx.fillStyle = th.encreFaible;
  ctx.globalAlpha = 0.75;
  // Rotation d'un quart de tour à gauche : le texte se lit de bas en haut,
  // sa ligne de base tournée vers l'extérieur de la planche.
  ctx.translate(format.width - Math.round(m.pad * 0.42), m.bandeH + Math.round(28 * m.k));
  ctx.rotate(Math.PI / 2);
  ctx.fillText(ATTRIBUTION, 0, 0);
  ctx.restore();
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
  const { carte, police, polices, logo, m, th, index, total } = o;

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      format,
      carte.ancrage ?? 0.5,
    );
    if (c) ctx.drawImage(carte.image, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
  }
  voileTexte(ctx, format, th, format.height * 0.42, intensite(carte.degradeBas, 1));
  if (carte.image) voileEntete(ctx, format, m, th, intensite(carte.degradeHaut, 0.72), 1.5);

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false && !carte.image,
    opacite: carte.enteteOpacite,
  });

  let y = m.piedFilet - Math.round(34 * m.k);
  const factuelle = carte.pied ?? "";
  if (factuelle) {
    ctx.font = `400 ${m.corps}px ${police}`;
    ctx.fillStyle = th.encreDouce;
    ctx.fillText(factuelle, m.pad, y);
    y -= m.corps * 1.9;
  }
  const largeurTexte = format.width - m.pad * 2;
  if (carte.texte) {
    // Ce gabarit se construit du BAS vers le haut. Avec des listes et des
    // respirations, empiler à reculons devient illisible : on mesure le bloc
    // entier, on remonte d'autant, et on le pose dans le sens normal.
    const bc = baseCorps(m, th, polices, carte);
    const blocs = blocsDeTexte(ctx, carte.texte, largeurTexte, bc);
    const hauteur = hauteurBlocs(blocs, bc);
    poserBlocs(ctx, blocs, m.pad, y - hauteur + m.corps * 0.2, bc, { puce: carte.puce });
    y -= hauteur + m.corps * 0.5;
  }
  if (carte.titre) {
    const bt = baseTitre(m, th, polices, carte);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeurTexte, bt);
    // Bloc construit du bas vers le haut : on réserve la place du filet AVANT
    // d'empiler le titre, puis on le pose une fois la dernière ligne connue.
    if (carte.filetTitre) y -= hauteurFiletTitre(m, carte);
    const basTitre = y;
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      dessinerLigneRiche(ctx, ls[i], m.pad, y, bt);
      y -= bt.taille * bt.interligne;
    }
    filetSousTitre(ctx, m, th, carte, basTitre);
    y -= m.surtitre * 0.5;
  }
  if (carte.surtitre)
    surtitre(ctx, m, th, policeDe(carte, "policeSurtitre", polices), carte.surtitre, m.pad, y);

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
  });
  return [];
}

/** LE TEXTE — surtitre, titre, paragraphes. La respiration du carrousel. */
function dessinerTexte(ctx, format, o) {
  const { carte, police, polices, logo, m, th, index, total } = o;
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
  });

  const largeur = format.width - m.pad * 2;
  let y = m.bandeH + Math.round(112 * m.k);

  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, policeDe(carte, "policeSurtitre", polices), carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  y = blocTitreEtCorps(ctx, format, m, th, polices, carte, y, largeur);

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
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
function blocTitreEtCorps(ctx, format, m, th, polices, carte, yDepart, largeur, echelleTitre = 1) {
  let y = yDepart;
  const bt = baseTitre(m, th, polices, carte, echelleTitre);
  const bc = baseCorps(m, th, polices, carte);
  const centre = carte.centrer ? m.pad + largeur / 2 : null;

  if (carte.titre) {
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeur, bt);
    y = poserLignes(ctx, ls, m.pad, y + bt.taille * 0.86, bt, { centre });
    y = filetSousTitre(ctx, m, th, carte, y, centre);
    // 2,2 corps et pas 1,7 : la jambe du titre descend sous sa ligne de base et
    // la hampe du corps remonte — l'écart utile est bien plus petit que l'écart
    // nominal, et « assistance. » collait à « Quatre jours ».
    y += m.corps * 2.2;
  }
  if (carte.texte) {
    if (!carte.titre) y += m.corps * 0.4;
    y = poserBlocs(ctx, blocsDeTexte(ctx, carte.texte, largeur, bc), m.pad, y, bc, {
      centre,
      puce: carte.puce,
    });
  }
  return y;
}

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
  const { carte, police, polices, logo, m, th, index, total } = o;
  const hauteur = Math.round(format.height * (carte.bandeauPart ?? 0.42));

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      { width: format.width, height: hauteur },
      carte.ancrage ?? 0.5,
    );
    if (c) ctx.drawImage(carte.image, c.sx, c.sy, c.sw, c.sh, 0, 0, format.width, hauteur);

    const bas = intensite(carte.degradeBas, 1);
    if (bas > 0) {
      const fondu = Math.round(hauteur * 0.42);
      const g = ctx.createLinearGradient(0, hauteur - fondu, 0, hauteur);
      g.addColorStop(0, `rgba(${th.voileTexte}, 0)`);
      g.addColorStop(0.55, `rgba(${th.voileTexte}, ${(0.55 * bas).toFixed(3)})`);
      g.addColorStop(1, `rgba(${th.voileTexte}, ${bas.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, hauteur - fondu, format.width, fondu);
    }
    voileEntete(ctx, format, m, th, intensite(carte.degradeHaut, 0.74));
  } else {
    ctx.fillStyle = th.filet;
    ctx.fillRect(0, 0, format.width, hauteur);
  }

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false && !carte.image,
    opacite: carte.enteteOpacite,
  });

  const largeur = format.width - m.pad * 2;
  let y = hauteur + Math.round(74 * m.k);
  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, policeDe(carte, "policeSurtitre", polices), carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  blocTitreEtCorps(ctx, format, m, th, polices, carte, y, largeur);

  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
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
  const { carte, police, polices, logo, m, th, index, total } = o;

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
  });

  let y = m.bandeH + Math.round(118 * m.k);
  if (carte.surtitre) {
    ctx.fillStyle = th.accent;
    surtitre(ctx, m, th, policeDe(carte, "policeSurtitre", polices), carte.surtitre, m.pad, y);
    y += m.surtitre * 1.3;
  }
  if (carte.titre) {
    const bt = baseTitre(m, th, polices, carte, 0.86);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), format.width - m.pad * 2, bt);
    y = poserLignes(ctx, ls, m.pad, y + bt.taille * 0.86, bt);
    // La fiche l'allume par défaut : c'est ce trait qui la faisait tenir.
    y = filetSousTitre(ctx, m, th, { ...carte, filetTitre: carte.filetTitre !== false }, y);
    y += Math.round(46 * m.k);
  }

  const lignesFiche = (carte.fiche ?? []).filter((l) => l && (l.label || l.valeur));
  // Les corps de la fiche se règlent : une fiche à trois lignes respire d'un
  // tout autre calibre qu'une fiche à huit.
  const libelle = m.ficheLabel;
  const valeur = m.ficheValeur;
  const pasLigne = Math.round(valeur * 2.1);

  for (const [i, l] of lignesFiche.entries()) {
    if (i > 0) {
      ctx.fillStyle = th.filet;
      ctx.fillRect(m.pad, y, format.width - m.pad * 2, Math.max(1, 1.2 * m.k));
    }
    const base = y + pasLigne * 0.66;

    ctx.font = `400 ${libelle}px ${policeDe(carte, "policeSurtitre", polices)}`;
    ctx.fillStyle = th.encreFaible;
    dessinerTexteEspace(ctx, String(l.label ?? "").toUpperCase(), m.pad, base, libelle, 0.26);

    ctx.font = `700 ${valeur}px ${policeDe(carte, "policeTitre", polices)}`;
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
    fleche: carte.piedFleche,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
  });
  return [];
}

/**
 * LA CLÔTURE — la dernière planche : la marque du labo dans un cercle, et un
 * mot.
 *
 * C'est la seule carte où le logo quitte la bande d'en-tête pour devenir le
 * SUJET. Cerclé et centré, il se lit comme une signature, pas comme un
 * filigrane : on ferme le carrousel sur qui l'a fait.
 *
 * Deux usages, une seule mise en page — la différence est dans le contenu, et
 * l'atelier la pré-remplit à la création :
 *   • en AMONT, on renvoie vers le direct (aplat, texte centré) ;
 *   • en AVAL, une photo termine, et le cercle se pose dessus.
 * D'où l'image facultative : c'est le même gabarit dans les deux cas.
 */
function dessinerCloture(ctx, format, o) {
  const { carte, police, polices, logo, m, th, index, total } = o;

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      format,
      carte.ancrage ?? 0.5,
    );
    if (c) ctx.drawImage(carte.image, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
    // Voile PLEIN, pas dégradé : le texte est au centre, il n'a pas de bord où
    // s'appuyer. Réglable, comme partout ailleurs.
    ctx.fillStyle = `rgba(${th.voileTexte}, ${carte.voileCloture ?? 0.62})`;
    ctx.fillRect(0, 0, format.width, format.height);
  }

  const centreX = format.width / 2;
  const rayon = Math.round((carte.tailleCercle ?? 128) * m.k);
  const hautZone = format.zoneSure?.top ?? 0;
  // Le bloc entier (cercle + textes) est centré dans la zone utile, pas dans la
  // planche : en story, l'interface d'Instagram mange le haut et le bas.
  const basZone = m.piedFilet;
  let y = hautZone + (basZone - hautZone) * (carte.image ? 0.4 : 0.42);

  ctx.save();
  // LA MARQUE PORTE DÉJÀ SON ROND : le fichier source, c'est le pied DANS un
  // cercle. En tracer un second par-dessus faisait une cible. L'anneau
  // extérieur existe donc, mais éteint par défaut — il sert quand on veut un
  // halo, pas pour « entourer » quelque chose qui l'est déjà.
  if (carte.cercleVisible) {
    ctx.beginPath();
    ctx.arc(centreX, y, rayon, 0, Math.PI * 2);
    ctx.strokeStyle = carte.couleurCercle || th.encre;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, (carte.epaisseurCercle ?? 4) * m.k);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (logo) {
    // Sans anneau extérieur, le pied occupe tout le diamètre : c'est LUI le
    // cercle. Avec, il se range dedans.
    const cote = rayon * (carte.cercleVisible ? 1.16 : 2);
    ctx.globalAlpha = 0.94;
    ctx.drawImage(logo, centreX - cote / 2, y - cote / 2, cote, cote);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  y += rayon + Math.round(84 * m.k);

  const largeur = format.width - m.pad * 2;
  if (carte.surtitre) {
    // Centré, le surtitre n'a pas son filet : celui-ci ouvre une ligne, il ne
    // sait pas ouvrir un axe de symétrie.
    ctx.font = `500 ${m.surtitre}px ${policeDe(carte, "policeSurtitre", polices)}`;
    ctx.fillStyle = th.accent;
    const mot = String(carte.surtitre).toUpperCase();
    const l = largeurEspacee(ctx, mot, m.surtitre, 0.22);
    dessinerTexteEspace(ctx, mot, centreX - l / 2, y, m.surtitre, 0.22);
    y += m.surtitre * 2.2;
  }
  if (carte.titre) {
    const bt = baseTitre(m, th, polices, carte);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeur, bt);
    y = poserLignes(ctx, ls, m.pad, y + bt.taille * 0.7, bt, { centre: centreX });
    y = filetSousTitre(ctx, m, th, carte, y, centreX) + m.corps * 2.2;
  }
  if (carte.texte) {
    const bc = baseCorps(m, th, polices, carte);
    poserBlocs(ctx, blocsDeTexte(ctx, carte.texte, largeur, bc), m.pad, y - bc.taille * 0.78, bc, {
      centre: centreX,
      puce: carte.puce,
    });
  }

  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque ?? "rien", // la marque est déjà au centre, en grand
    filet: carte.filetEntete === true,
    opacite: carte.enteteOpacite,
  });
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche ?? "jamais", // c'est la fin : il n'y a plus rien à glisser
    filet: carte.filetPied === true,
    opacite: carte.piedOpacite,
  });
  return [];
}

const RENDUS = {
  carte: dessinerCarte,
  bandeau: dessinerBandeau,
  photo: dessinerPhoto,
  texte: dessinerTexte,
  fiche: dessinerFiche,
  cloture: dessinerCloture,
};

/**
 * Dessine UNE carte du carrousel. Renvoie les boîtes des étiquettes déplaçables
 * (vide pour les gabarits qui n'en ont pas).
 */
export function dessinerCartePartage(ctx, options) {
  const format = FORMATS[options.format] ?? FORMATS.carrousel;
  const theme = THEMES[options.theme] ?? THEMES.sombre;
  const [m, th] = mesuresDeLaCarte(options.carte, metriques(format), theme);
  // LES TROIS FAMILLES, résolues par l'appelant (l'atelier lit les tokens de la
  // charte sur le document). Sans trousseau, tout retombe sur `police` : une
  // planche rendue hors du navigateur reste correcte, en Ubuntu partout.
  const police = options.police ?? "sans-serif";
  const polices = {
    sans: police,
    serif: police,
    mono: police,
    ...(options.polices ?? null),
  };

  ctx.clearRect(0, 0, format.width, format.height);
  // Le FOND reste celui du thème même si l'encre est redéfinie : une couleur de
  // titre ne doit pas pouvoir repeindre la planche.
  ctx.fillStyle = options.carte?.couleurFond || theme.fond;
  ctx.fillRect(0, 0, format.width, format.height);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const rendu = RENDUS[options.carte?.gabarit] ?? dessinerTexte;
  return rendu(ctx, format, {
    ...options,
    police,
    polices,
    m,
    th,
    segments: options.segments ?? [],
    index: options.index ?? 0,
    total: options.total ?? 1,
  });
}
