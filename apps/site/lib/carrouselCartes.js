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
import { dessinerIcone } from "./carrouselIcones";
import { ancreDuSegment } from "./carrouselTrace";
import {
  ALIGNEMENTS,
  DEGRADES_PLAQUE,
  ESPACEMENT,
  analyserRiche,
  FLECHE_LARGEUR,
  decalageAlignement,
  blocsDeTexte,
  flecheTracee,
  dessinerCapitales,
  dessinerLigneRiche,
  encreDe,
  largeurBlocs,
  largeurCapitales,
  morceauxCapitales,
  largeurLigne,
  hauteurBlocs,
  lignesRiches,
  plaqueDeLigne,
  poserBlocs,
  styleDeLigne,
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
  carrousel: {
    cle: "carrousel",
    label: "Carrousel · 1080×1350",
    width: 1080,
    height: 1350,
    zoneSure: null,
  },
  story: {
    cle: "story",
    label: "Story · 1080×1920",
    width: 1080,
    height: 1920,
    zoneSure: { top: 250, bottom: 1600 },
  },
  carre: {
    cle: "carre",
    label: "Carré · 1080×1080",
    width: 1080,
    height: 1080,
    zoneSure: null,
  },
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
  {
    cle: "carte",
    label: "Carte",
    aide: "L'itinéraire et son profil, découpés en journées.",
  },
  {
    cle: "bandeau",
    label: "Bandeau",
    aide: "Une photo en bandeau haut, le texte dessous.",
  },
  { cle: "photo", label: "Photo", aide: "Une photo plein cadre." },
  {
    cle: "texte",
    label: "Texte",
    aide: "Un surtitre, un titre, un paragraphe.",
  },
  {
    cle: "fiche",
    label: "Fiche",
    aide: "Des libellés à gauche, des valeurs en gros à droite.",
  },
  {
    cle: "etape",
    label: "Étape",
    aide: "Le compte rendu d'une journée : la photo fondue, le récit, la portion de trace parcourue et ses chiffres.",
  },
  {
    cle: "journees",
    label: "Journées",
    aide: "L'espace découpé en cases : une journée par case, sa portion de trace et de profil.",
  },
  {
    cle: "cloture",
    label: "Clôture",
    aide: "La marque cerclée, et le mot de la fin.",
  },
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
export const PALETTE_JOURS = [
  traceColors.line,
  "#EFB159",
  "#B67352",
  "#8CB9BD",
  "#6E9CA0",
  "#9A6044",
];

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
  return heures > 0
    ? `${heures} h ${String(minutes).padStart(2, "0")}`
    : `${minutes} min`;
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
    titre: Math.round(
      (format.cle === "carre" ? CORPS.titre * 0.88 : CORPS.titre) * k,
    ),
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
  const reserve =
    m.profilH +
    m.surtitre * 2.4 +
    m.titre * 1.5 +
    (m.piedBase - m.piedFilet) +
    56 * m.k;
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
  return fitView(coords, {
    width: format.width,
    height: format.height,
    fit: fenetreCarte(format),
  });
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
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
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
        chargerTuile(urlTuile(tileUrl, w.zoom, w.tx0 + dx, w.ty0 + dy)).then(
          (img) => {
            if (img)
              ctx.drawImage(
                img,
                dx * TILE_SIZE,
                dy * TILE_SIZE,
                TILE_SIZE,
                TILE_SIZE,
              );
            return Boolean(img);
          },
        ),
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

/**
 * Le voile du haut, sous la bande d'en-tête.
 *
 * `force` est son opacité au bord haut, `hauteur` la DISTANCE sur laquelle il
 * s'éteint. Les deux se règlent : sur une photo dont le ciel occupe le tiers
 * supérieur, un voile court et dense mange le ciel ; un voile long et léger le
 * garde tout en rendant l'en-tête lisible. C'est le même réglage que celui
 * qu'on ferait à la main dans un dégradé.
 */
function voileEntete(ctx, format, m, th, force, hauteur) {
  if (!(force > 0) || !(hauteur > 0)) return;
  const bas = hauteur;
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
function bandeEntete(
  ctx,
  format,
  m,
  th,
  police,
  { texte, accent, logo, marque, filet = true, opacite = 1, zones = null },
) {
  zone(zones, "entete", 0, 0, format.width, m.bandeH);
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
    const mots = morceauxCapitales(texte);
    dessinerCapitales(
      ctx,
      mots,
      format.width - m.pad - largeurCapitales(ctx, mots, m.entete, 0.28),
      base,
      m.entete,
      0.28,
      th.accent,
    );
  }

  if (filet) {
    ctx.fillStyle = th.filet;
    ctx.fillRect(
      m.pad,
      m.bandeH,
      format.width - m.pad * 2,
      Math.max(1, 1.5 * m.k),
    );
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
  for (const l of texte)
    largeur += ctx.measureText(l).width + espacementEm * taille;
  return Math.max(0, largeur - espacementEm * taille);
}

/* ------------------------------------------- capitales espacées, avec icônes */

/**
 * Le surtitre : un filet ambre, puis des capitales espacées.
 *
 * Le filet et le texte forment UN bloc : c'est l'ensemble qu'on aligne, sinon
 * un surtitre centré verrait son filet rester collé à la marge gauche — ce qui
 * n'a plus rien d'un surtitre, juste un trait perdu. Rend l'ordonnée de la
 * ligne de base.
 */
/**
 * LE SURTITRE : un filet ambre, puis des capitales espacées — sur AUTANT DE
 * LIGNES qu'on en écrit.
 *
 * Une seule ligne suffisait tant qu'il n'annonçait qu'une chose. Mais une étape
 * en dit deux : d'où l'on part et où l'on va, puis avec qui — et la seconde
 * n'a ni le même corps ni la même encre que la première. Chaque ligne prend
 * donc les préfixes de ligne du balisage (`--` et `++` pour le corps, `|` pour
 * l'alignement) et tout le reste (`[gris: …]`, `:fleche:`, les couleurs).
 *
 * LE FILET n'ouvre que la PREMIÈRE : c'est le point d'entrée du regard, et le
 * répéter à chaque ligne en ferait une liste.
 *
 * @param {boolean} o.depuisLeBas - `base` est la ligne de base de la DERNIÈRE
 *   ligne, pas de la première. Les gabarits qui composent du bas vers le haut
 *   en ont besoin : sinon leur surtitre déborderait vers le bas, sur le titre
 *   qu'ils viennent de poser.
 * @returns {{dernier:number, sup:number}} la ligne de base de la dernière
 *   ligne, et la hauteur que les lignes SUPPLÉMENTAIRES ont prise.
 */
/**
 * Les lignes d'un surtitre, prêtes à mesurer OU à poser.
 *
 * La mesure et la pose doivent lire exactement la même découpe : c'est ce qui
 * permet d'aligner un surtitre AVEC un titre sur la même ligne, où il faut
 * connaître sa largeur avant de savoir où commence le titre.
 */
function lignesDeSurtitre(m, texte, { align = "gauche", filet = true } = {}) {
  return String(texte ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((brute, i) => {
      const { align: alignLigne, echelle, reste } = styleDeLigne(brute);
      return {
        align: alignLigne ?? align,
        taille: Math.max(8, Math.round(m.surtitre * echelle)),
        mots: morceauxCapitales(reste),
        // Sans filet, le surtitre n'est plus qu'une ligne de capitales ambrées :
        // la place du trait ET son écart disparaissent, sinon il resterait un
        // retrait fantôme que personne ne saurait expliquer.
        filet: filet && i === 0,
      };
    });
}

/** Le filet d'ouverture d'une ligne de surtitre : sa longueur et son écart. */
function filetDeSurtitre(l) {
  return l.filet
    ? { longueur: Math.round(l.taille * 2.6), ecart: l.taille * 0.9 }
    : { longueur: 0, ecart: 0 };
}

/** La largeur d'une ligne de surtitre, SON FILET COMPRIS. Change `ctx.font`. */
function largeurDeSurtitre(ctx, police, l, polices) {
  const { longueur, ecart } = filetDeSurtitre(l);
  ctx.font = `500 ${l.taille}px ${police}`;
  return (
    longueur + ecart + largeurCapitales(ctx, l.mots, l.taille, 0.22, polices)
  );
}

function surtitre(
  ctx,
  m,
  th,
  police,
  texte,
  x,
  base,
  {
    align = "gauche",
    largeur = 0,
    filet = true,
    plaque = null,
    depuisLeBas = false,
    polices = null,
  } = {},
) {
  const lignes = lignesDeSurtitre(m, texte, { align, filet });
  if (lignes.length === 0) return { dernier: base, sup: 0 };

  const pas = (l) => Math.round(l.taille * 1.75);
  const sup = lignes.slice(1).reduce((total, l) => total + pas(l), 0);
  let ligneBase = depuisLeBas ? base - sup : base;

  for (const [i, l] of lignes.entries()) {
    if (i > 0) ligneBase += pas(l);
    const { longueur: filetL, ecart } = filetDeSurtitre(l);
    const epaisseur = Math.max(2, m.filetSurtitre);

    const total = largeurDeSurtitre(ctx, police, l, polices);
    const gauche = x + decalageAlignement(l.align, largeur, total);

    // La plaque passe SOUS le filet comme sous les lettres : c'est le bloc
    // entier qu'on rend lisible, pas seulement son texte.
    if (plaque) {
      plaqueDeLigne(ctx, [{ largeur: total }], gauche, ligneBase, {
        taille: l.taille,
        plaque,
      });
    }
    ctx.fillStyle = th.accent;
    // Le filet est ÉPAIS (10 px de référence) : c'est lui le point d'entrée du
    // regard, pas le petit texte qui le suit. Centré sur la hauteur de capitale
    // du surtitre, sinon il pend sous la ligne dès qu'il s'épaissit.
    if (l.filet) {
      ctx.fillRect(
        gauche,
        ligneBase - l.taille * CENTRE_CAPITALES - epaisseur / 2,
        filetL,
        epaisseur,
      );
    }
    dessinerCapitales(
      ctx,
      l.mots,
      gauche + filetL + ecart,
      ligneBase,
      l.taille,
      0.22,
      th.accent,
      {
        douce: th.encreFaible,
        polices,
      },
    );
  }
  return { dernier: ligneBase, sup };
}

export function lignes(ctx, texte, largeurMax) {
  const mots = String(texte ?? "")
    .split(/\s+/)
    .filter(Boolean);
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
/** L'écart après le titre, en corps de ce qui suit (cf. `blocTitreEtCorps`). */
const APRES_TITRE = 2.2;

/** L'écart entre le titre et le surtitre quand ils partagent une ligne, en
 *  parts du corps du SURTITRE. Un peu plus qu'une espace-mot : les deux corps
 *  sont trop différents pour que l'espace du titre suffise à les séparer. */
const ECART_DUO = 1.1;

/** L'écart avant le bloc de données d'une étape, en corps (cf. `dessinerEtape`). */
const AVANT_DONNEES = 1;

const INTERLIGNE_TITRE = 1.16;

/* ------------------------------------------------------- zones cliquables */

/**
 * LES ZONES DE LA PLANCHE — de quoi cliquer DANS l'image pour ouvrir le
 * réglage correspondant.
 *
 * C'est le geste de tous les éditeurs : on clique sur le titre, le champ du
 * titre s'ouvre. Rien à inventer côté rendu — il sait déjà où il a posé chaque
 * chose, il suffit qu'il le DISE au lieu de le jeter. Chaque renderer déclare
 * ses zones au fil du dessin ; l'atelier les teste de la dernière à la
 * première, donc la plus récemment dessinée (celle du dessus) gagne.
 */
function zone(zones, champ, x, y, width, height, extra = null) {
  if (!zones || !(width > 0) || !(height > 0)) return;
  zones.push({ champ, x, y, width, height, ...(extra ?? null) });
}

/** La zone d'un bloc de texte : toute la colonne, sur la hauteur écrite. */
function zoneTexte(zones, champ, m, x, largeur, yHaut, yBas, marge = 0) {
  zone(zones, champ, x, yHaut - marge, largeur, yBas - yHaut + marge * 2);
}

/**
 * LA ZONE DE REPLI d'un gabarit : tout l'espace entre les deux bandes.
 *
 * Déclarée EN PREMIER, donc perdante face à tout ce qui se dessine ensuite.
 * Elle existe pour qu'un clic dans le grand blanc du bas ouvre quand même
 * quelque chose — sur une planche de texte à moitié vide, la moitié inférieure
 * ne répondait à rien, ce qui se lit comme un outil cassé.
 */
function zoneDeRepli(zones, format, m, champ) {
  zone(zones, champ, 0, m.bandeH, format.width, m.piedFilet - m.bandeH, {
    repli: true,
  });
}

/** Les champs qui se partagent les blancs de la colonne de texte. */
const ZONES_DE_TEXTE = new Set(["surtitre", "titre", "texte", "fiche"]);

/**
 * LES BLANCS APPARTIENNENT AU BLOC DU DESSUS.
 *
 * Mesurées au plus juste, les zones de texte laissent entre elles l'écart que
 * la mise en page a voulu — 2,2 corps entre un titre et son paragraphe. Cliquer
 * là n'ouvrait RIEN, et rien est le pire résultat possible : on croit que le
 * clic ne marche pas. Chaque bloc s'étend donc jusqu'au suivant, plafonné à sa
 * propre hauteur pour qu'un blanc énorme (une planche presque vide) ne devienne
 * pas une zone de clic absurde.
 */
function comblerLesBlancs(zones) {
  // Les zones de repli s'étendent déjà partout : les faire participer au
  // partage des blancs n'aurait aucun sens (et écraserait les vraies).
  const textes = zones
    .filter((z) => ZONES_DE_TEXTE.has(z.champ) && !z.repli)
    .sort((a, b) => a.y - b.y);
  for (const [i, z] of textes.entries()) {
    const bas = z.y + z.height;
    const suivant = textes[i + 1];
    if (!suivant || suivant.y <= bas) continue;
    z.height += Math.min(suivant.y - bas, z.height * 1.6 + 24);
  }
}

/** Re-exportés pour l'atelier : ils vivent dans le module de texte, seul à
 *  savoir décaler une ligne et à peindre le fond qui la porte. */
export { ALIGNEMENTS, DEGRADES_PLAQUE };

/**
 * L'alignement d'une planche.
 *
 * `centrer` était un booléen : les planches déjà enregistrées le portent, et
 * elles doivent continuer de se centrer. On le lit donc en secours de
 * `alignement`, qui le remplace.
 */
/**
 * L'ORDRE DU TITRE ET DU SURTITRE.
 *
 * Par défaut le surtitre ouvre (c'est son rôle : un filet, une catégorie, puis
 * le titre). Inversé, le titre passe devant et le surtitre devient une
 * signature de bas de bloc — utile quand le titre EST l'accroche et que la
 * catégorie ne fait que la ranger.
 *
 * `basVersHaut` : les gabarits qui empilent à reculons (Carte, Photo) posent
 * l'ordre à l'envers — c'est le même réglage, lu dans l'autre sens.
 */
function ordreDuTitre(carte, basVersHaut = false) {
  const ordre = carte?.titreDevant
    ? ["titre", "surtitre"]
    : ["surtitre", "titre"];
  return basVersHaut ? [...ordre].reverse() : ordre;
}

function alignementDe(carte, defaut = "gauche") {
  const a = carte?.alignement;
  if (a === "gauche" || a === "centre" || a === "droite") return a;
  if (carte?.centrer) return "centre";
  return defaut;
}

/* ------------------------------------------------------------------ ombres */

/**
 * L'OMBRE PORTÉE DES TEXTES.
 *
 * Elle ne sert pas à décorer : elle sert à poser du texte clair sur une photo
 * claire. Un voile assombrit TOUTE la zone (et donc la photo) ; une ombre ne
 * fait un contraste QUE sous les lettres. Sur une crête enneigée à midi, c'est
 * la seule chose qui rende un titre lisible sans repeindre l'image.
 *
 * Elle est portée par le contexte (`ctx.shadow*`), donc elle s'applique à TOUT
 * ce qu'on dessine ensuite : on la pose avant les textes et on l'enlève avant
 * les images, les voiles et le profil — un profil altimétrique doublé d'une
 * ombre devient une bouillie.
 */
const OMBRE = { flou: 18, dx: 0, dy: 6, opacite: 0.5, couleur: "#000000" };

/**
 * Les textes qui peuvent la porter, SÉPARÉMENT.
 *
 * Un titre en très gros sur une photo a besoin d'une ombre franche ; la
 * pagination du pied, en 22 px, n'en a besoin d'aucune et une ombre l'épaissit
 * jusqu'à la rendre sale. Un seul interrupteur pour tout obligeait à choisir le
 * moins mauvais compromis.
 */
/**
 * LA PLAQUE — l'aplat posé SOUS le texte.
 *
 * L'autre façon de rendre un titre lisible sur une photo : le dégradé assombrit
 * toute l'image, la plaque ne couvre que les lettres. On garde la photo, et le
 * texte tient quand même. Elle se pose LIGNE PAR LIGNE (cf. `plaqueDeLigne`).
 */
const PLAQUE = {
  opacite: 0.88,
  padX: 0.3,
  padY: 0.24,
  rayon: 0.18,
  fondu: 0.4,
};

/** Les textes qui peuvent en porter une. L'en-tête et le pied vivent dans des
 *  bandes qui ont déjà leur propre opacité : ils n'en ont pas besoin. */
export const TEXTES_PLAQUABLES = [
  { cle: "titre", label: "Titre" },
  { cle: "surtitre", label: "Surtitre" },
  { cle: "corps", label: "Texte" },
];

function plaqueDe(carte, th, quoi) {
  if (!carte?.plaque || carte[`plaque_${quoi}`] === false) return null;
  // Par défaut, le FOND DU THÈME : sur le sombre l'encre est crème, il faut un
  // aplat sombre ; sur le clair, l'inverse. Une couleur au choix reste possible.
  const rgb = composantes(carte.plaqueCouleur || th.fond) ?? "255, 255, 255";
  return {
    rgb,
    alpha: Math.min(
      1,
      Math.max(0, nombre(carte.plaqueOpacite, PLAQUE.opacite)),
    ),
    padX: nombre(carte.plaquePadX, PLAQUE.padX),
    padY: nombre(carte.plaquePadY, PLAQUE.padY),
    rayon: nombre(carte.plaqueRayon, PLAQUE.rayon),
    // L'aplat s'arrête net ; le fondu le dissout dans la photo.
    degrade: carte.plaqueDegrade ?? "aucun",
    fondu: nombre(carte.plaqueFondu, PLAQUE.fondu),
  };
}

export const TEXTES_OMBRABLES = [
  { cle: "titre", label: "Titre" },
  { cle: "surtitre", label: "Surtitre" },
  { cle: "corps", label: "Texte" },
  { cle: "entete", label: "En-tête" },
  { cle: "pied", label: "Pied de page" },
];

/** #RRGGBB (ou #RGB) → « r, g, b ». Toute autre écriture est rendue telle
 *  quelle : une couleur déjà en `rgb()` doit continuer de marcher. */
function composantes(hex) {
  const brut = String(hex ?? "").trim();
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(brut);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(brut);
  if (court)
    return court
      .slice(1)
      .map((c) => parseInt(c + c, 16))
      .join(", ");
  if (long)
    return long
      .slice(1)
      .map((c) => parseInt(c, 16))
      .join(", ");
  return null;
}

function ombreDe(carte, m) {
  if (!carte?.ombre) return null;
  const rgb = composantes(carte.ombreCouleur || OMBRE.couleur) ?? "0, 0, 0";
  const opacite = Math.min(
    1,
    Math.max(0, nombre(carte.ombreOpacite, OMBRE.opacite)),
  );
  // Rien de coché = TOUT est ombré : allumer l'ombre puis ne rien voir serait
  // le plus sûr moyen de croire qu'elle ne marche pas.
  const sur = Object.fromEntries(
    TEXTES_OMBRABLES.map(({ cle }) => [cle, carte[`ombre_${cle}`] !== false]),
  );
  return {
    sur,
    couleur: `rgba(${rgb}, ${opacite})`,
    flou: Math.max(0, nombre(carte.ombreFlou, OMBRE.flou)) * m.k,
    dx: (Number.isFinite(carte.ombreDx) ? carte.ombreDx : OMBRE.dx) * m.k,
    dy: (Number.isFinite(carte.ombreDy) ? carte.ombreDy : OMBRE.dy) * m.k,
  };
}

/** Ce qui suit est du texte de type `quoi` : il porte l'ombre si elle est
 *  allumée pour lui, et il l'ENLÈVE sinon — un appel ne doit jamais hériter en
 *  silence de l'ombre posée par le précédent. */
function poserOmbre(ctx, ombre, quoi) {
  if (!ombre || (quoi && !ombre.sur[quoi])) {
    sansOmbre(ctx);
    return;
  }
  ctx.shadowColor = ombre.couleur;
  ctx.shadowBlur = ombre.flou;
  ctx.shadowOffsetX = ombre.dx;
  ctx.shadowOffsetY = ombre.dy;
}

/** Ce qui suit n'en est pas. */
function sansOmbre(ctx) {
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Un réglage numérique de la planche, sinon la valeur de la charte. */
function nombre(v, defaut) {
  return Number.isFinite(v) && v >= 0 ? v : defaut;
}

/**
 * La DISTANCE d'un dégradé, en pixels d'une planche de 1080 de large.
 *
 * Réglée, elle est mise à l'échelle du format comme tout le reste ; absente,
 * on garde la distance calculée par le gabarit (qui, elle, est déjà en pixels
 * du format — d'où les deux chemins).
 */
function portee(reglee, defautDejaEchelle, m) {
  return Number.isFinite(reglee) && reglee >= 0
    ? reglee * m.k
    : defautDejaEchelle;
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
    polices,
    taille: Math.round(m.titre * echelle),
    graisse: 700,
    couleur: th.encre,
    accent: th.accent,
    douce: th.encreFaible,
    plaque: plaqueDe(carte, th, "titre"),
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
    // Le TROUSSEAU voyage avec la base : c'est lui qui rend `[serif: mot]`
    // possible au milieu d'un paragraphe (cf. `fonteDe`).
    polices,
    taille: m.corps,
    graisse: 400,
    couleur: th.encreDouce,
    accent: th.accent,
    // L'encre ATTÉNUÉE, pour `[gris: …]` : c'est un rôle du thème, pas une
    // teinte, et il faut donc la lui passer plutôt que de l'écrire en dur.
    douce: th.encreFaible,
    plaque: plaqueDe(carte, th, "corps"),
    interligne: nombre(carte?.interligne, ESPACEMENT.interligne),
    entreBlocs: nombre(carte?.entreBlocs, ESPACEMENT.entreBlocs),
    respiration: nombre(carte?.respiration, ESPACEMENT.respiration),
    entreItems: nombre(carte?.entreItems, ESPACEMENT.entreItems),
    retraitListe: nombre(carte?.retraitListe, ESPACEMENT.retraitListe),
    alinea: nombre(carte?.alinea, ESPACEMENT.alinea),
    lignesDures: Boolean(carte?.lignesDures),
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

function filetSousTitre(
  ctx,
  m,
  th,
  carte,
  y,
  { align = "gauche", x = m.pad, largeur = 0 } = {},
) {
  if (!carte.filetTitre) return y;
  const l = Math.round(nombre(carte.filetTitreLargeur, 96) * m.k);
  const epaisseur = Math.max(
    1,
    Math.round(nombre(carte.filetTitreEpaisseur, 4) * m.k),
  );
  const yTrait = y + Math.round(AVANT_FILET_TITRE * m.k);
  ctx.fillStyle = carte.couleurFiletTitre || th.accent;
  ctx.fillRect(x + decalageAlignement(align, largeur, l), yTrait, l, epaisseur);
  return yTrait + epaisseur;
}

/**
 * Pose des lignes déjà mises en page, de haut en bas, et rend l'ordonnée de la
 * DERNIÈRE ligne de base — pas celle d'après : c'est à l'appelant de décider de
 * l'espace qui suit, il est le seul à savoir ce qui vient.
 */
function poserLignes(
  ctx,
  lignes,
  x,
  y,
  base,
  { align = "gauche", largeur = 0 } = {},
) {
  const interligne = base.interligne ?? INTERLIGNE_TITRE;
  let ligneBase = y;
  lignes.forEach((ligne, i) => {
    if (i > 0) ligneBase += base.taille * interligne;
    dessinerLigneRiche(
      ctx,
      ligne,
      x + decalageAlignement(align, largeur, largeurLigne(ligne)),
      ligneBase,
      base,
    );
  });
  return ligneBase;
}

function bandePied(
  ctx,
  format,
  m,
  th,
  police,
  {
    index,
    total,
    centre,
    droite,
    fleche = "auto",
    filet = true,
    opacite = 1,
    /**
     * « 03 / 12 » en bas à gauche. Vrai par défaut — c'est la signature d'un
     * carrousel, et elle dit au lecteur qu'il en reste.
     *
     * Mais un carrousel n'est pas toujours une SÉRIE : quand des planches de
     * journée alternent avec des photos, numéroter chaque image en fait un
     * décompte qui ne compte rien. La planche décide donc, une par une.
     */
    numero = true,
    zones = null,
  },
) {
  zone(
    zones,
    "pied",
    0,
    m.piedFilet,
    format.width,
    format.height - m.piedFilet,
  );
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacite));
  if (filet) {
    ctx.fillStyle = th.filet;
    ctx.fillRect(
      m.pad,
      m.piedFilet,
      format.width - m.pad * 2,
      Math.max(1, 1.5 * m.k),
    );
  }

  ctx.font = `400 ${m.piedTexte}px ${police}`;
  ctx.fillStyle = th.encreFaible;
  if (numero) {
    const pagination = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    dessinerTexteEspace(ctx, pagination, m.pad, m.piedBase, m.piedTexte, 0.24);
  }

  if (centre) {
    const mots = morceauxCapitales(centre);
    const largeur = largeurCapitales(ctx, mots, m.piedTexte, 0.24);
    dessinerCapitales(
      ctx,
      mots,
      (format.width - largeur) / 2,
      m.piedBase,
      m.piedTexte,
      0.24,
      th.accent,
    );
  }

  // À droite : le texte qu'on a écrit, ou « GLISSE → » par défaut tant qu'il
  // reste une carte derrière. Un texte explicite l'emporte toujours — c'est le
  // seul moyen de signer la DERNIÈRE carte (« merci », « lien en bio »…).
  // « auto » : le mot par défaut et sa flèche tant qu'il reste une carte
  // derrière. « toujours » / « jamais » forcent la flèche — la première sert à
  // signer une dernière carte qui renvoie ailleurs (« lien en bio → »), la
  // seconde à laisser un pied nu.
  const resteUneCarte = index < total - 1;
  const motDroite = droite
    ? morceauxCapitales(droite)
    : resteUneCarte
      ? morceauxCapitales("Glisse")
      : null;
  const avecFleche =
    fleche === "toujours"
      ? true
      : fleche === "jamais"
        ? false
        : !droite && resteUneCarte;
  if (!motDroite && !avecFleche) {
    ctx.restore();
    return;
  }
  const ecartFleche = avecFleche ? m.piedTexte * 1.5 : 0;
  const largeur = motDroite
    ? largeurCapitales(ctx, motDroite, m.piedTexte, 0.24)
    : 0;
  if (motDroite) {
    dessinerCapitales(
      ctx,
      motDroite,
      format.width - m.pad - largeur - ecartFleche,
      m.piedBase,
      m.piedTexte,
      0.24,
      th.accent,
    );
  }

  if (!avecFleche) {
    ctx.restore();
    return;
  }
  // La flèche vient de `flecheTracee` — la MÊME que `:fleche:` dans un texte et
  // que la puce de liste. Elle était tracée ici, et c'est de ce dessin-là que
  // les deux autres sont nées : les garder séparés aurait suffi à les faire
  // diverger au premier retouchage.
  const y = m.piedBase - m.piedTexte * 0.32;
  flecheTracee(
    ctx,
    format.width - m.pad - m.piedTexte * FLECHE_LARGEUR,
    y,
    m.piedTexte,
    th.encreFaible,
    Math.max(1.5, 1.8 * m.k),
  );
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
  const points = (profil ?? []).filter(
    (p) => Number.isFinite(p?.km) && Number.isFinite(p?.alt),
  );
  if (points.length < 2) return;
  const total = totalKm > 0 ? totalKm : points[points.length - 1].km;
  if (!(total > 0)) return;

  const alts = points.map((p) => p.alt);
  const min = Math.min(...alts);
  const amplitude = Math.max(1, Math.max(...alts) - min);

  const X = (km) =>
    boite.x + (Math.max(0, Math.min(total, km)) / total) * boite.width;
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

  // `>= 1` : une planche « la journée 3 seule » n'a qu'un segment, et c'est
  // justement lui qu'on veut voir en couleur. L'appelant décide en amont s'il
  // passe des journées ou `null` (une sortie d'un seul tenant n'en a pas).
  if (segments?.length >= 1) {
    segments.forEach((s, i) =>
      aire(s.kmDebut, s.kmFin, couleurs[i] ?? th.accent),
    );
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
  if (segments?.length >= 1) {
    ctx.save();
    ctx.setLineDash([4 * (boite.height / 150), 6 * (boite.height / 150)]);
    ctx.strokeStyle = th.filet;
    ctx.lineWidth = Math.max(1, boite.height * 0.012);
    for (const s of segments.filter((s) => s.kmDebut > 0)) {
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
  boite.y = borne(
    boite.y,
    m.bandeH + m.etiquette * 0.5,
    fenetre.y + fenetre.height - boite.height,
  );
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
  rectArrondi(
    ctx,
    boite.x,
    boite.y,
    boite.width,
    boite.height,
    boite.height / 2,
  );
  ctx.fillStyle =
    th.cle === "clair" ? "rgba(254, 251, 246, 0.9)" : "rgba(16, 18, 14, 0.84)";
  ctx.fill();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = Math.max(1.5, m.k * 2);
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const cy = boite.y + boite.height / 2;
  ctx.beginPath();
  ctx.arc(
    boite.x + boite.padX + boite.pastille / 2,
    cy,
    boite.pastille / 2,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = couleur;
  ctx.fill();

  ctx.font = `500 ${m.etiquette}px ${police}`;
  ctx.fillStyle = th.encre;
  ctx.textBaseline = "middle";
  ctx.fillText(
    texte,
    boite.x + boite.padX + boite.pastille + m.etiquette * 0.4,
    cy + m.etiquette * 0.04,
  );
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

export function couleurDuJour(carte, jour) {
  return (
    carte?.etiquettes?.[jour]?.couleur ??
    PALETTE_JOURS[jour % PALETTE_JOURS.length]
  );
}

function couleursDesJours(carte, segments) {
  return segments.map((_, i) => couleurDuJour(carte, i));
}

/**
 * LES JOURNÉES QUE LA PLANCHE MONTRE — avec leur NUMÉRO D'ORIGINE.
 *
 * Deux façons de raconter une étape, et elles ne demandent pas la même chose :
 *   • l'AVANCEMENT (`jusquA`) — tout ce qui est fait jusqu'à ce jour-là, en
 *     couleur ; la série révèle l'itinéraire au fur et à mesure ;
 *   • la JOURNÉE SEULE (`depuis` = `jusquA`) — cette étape et rien d'autre, sur
 *     l'itinéraire entier resté en sourdine ; on lit où elle tombe dans le tour.
 *
 * Couper la liste suffisait tant qu'on ne montrait qu'un DÉBUT de série : les
 * indices restaient alignés sur les couleurs et les étiquettes, qui sont rangées
 * par position. Ne montrer QUE la journée 3 casse cet alignement — elle
 * deviendrait la journée 0, en fuchsia, étiquetée « J1 ».
 *
 * On ne coupe donc plus : on rend des paires `{ jour, seg }`, où `jour` est le
 * rang dans l'itinéraire ENTIER. Couleur, étiquette et numéro se lisent dessus,
 * et la boîte rendue à l'atelier porte ce rang — sans quoi déplacer l'étiquette
 * d'une planche « J3 seule » écrirait dans celle de J1.
 */
export function journeesMontrees(carte, segments) {
  const tous = segments ?? [];
  const depuis = Number.isInteger(carte?.depuis)
    ? Math.max(0, carte.depuis)
    : 0;
  const jusquA =
    carte?.jusquA == null
      ? tous.length - 1
      : Math.min(tous.length - 1, carte.jusquA);
  const out = [];
  for (let jour = depuis; jour <= jusquA; jour += 1) {
    if (tous[jour]) out.push({ jour, seg: tous[jour] });
  }
  return out;
}

/** Le pied de page factuel d'une carte : les chiffres de l'itinéraire, ou ceux
 *  de la sortie quand la trace a été vécue. */
export function ligneFactuelle(trace, bilan) {
  if (!trace) return "";
  const bouts = [
    trace.totalKm > 0 ? `${formatEntier(trace.totalKm)} km` : "",
    trace.dPlusM > 0 ? `${formatEntier(trace.dPlusM)} m D+` : "",
  ];
  if (bilan && trace.dureeSecondes > 0)
    bouts.push(dureeCourte(trace.dureeSecondes));
  return bouts.filter(Boolean).join("   ·   ");
}

/**
 * LA CARTE — l'itinéraire, son profil, découpés en journées.
 *
 * Renvoie les boîtes des étiquettes : l'atelier en a besoin pour savoir ce
 * qu'on attrape à la souris.
 */
/**
 * LA LIGNE DE CHIFFRES, sous le titre des gabarits Carte et Photo.
 *
 * Par défaut, celle que la trace sait dire d'elle-même (« 188 km · 12 279 m
 * D+ »). Mais c'est un TEXTE, avec tout le balisage : on peut y écrire une
 * date, un nom de col, une phrase, mettre un mot en ambre ou poser une icône —
 * et la vider quand la distance n'est pas ce qu'on a envie d'annoncer.
 *
 * Posée du BAS vers le haut, comme le bloc qui la contient : la dernière ligne
 * tombe sur `y`. Rend la nouvelle ordonnée.
 */
function ligneDeChiffres(ctx, format, m, th, polices, carte, y, o) {
  const { texte, align, largeur, ombre, zones } = o;
  if (!texte) return y;
  poserOmbre(ctx, ombre, "corps");
  const base = { ...baseCorps(m, th, polices, carte), graisse: 400 };
  const ls = lignesRiches(ctx, analyserRiche(texte), largeur, base);
  if (ls.length === 0) return y;

  let ligne = y;
  for (let i = ls.length - 1; i >= 0; i -= 1) {
    dessinerLigneRiche(
      ctx,
      ls[i],
      m.pad + decalageAlignement(align, largeur, largeurLigne(ls[i])),
      ligne,
      base,
    );
    if (i > 0) ligne -= base.taille * base.interligne;
  }
  zoneTexte(
    zones,
    "factuelle",
    m,
    m.pad,
    largeur,
    ligne - m.corps,
    y + m.corps * 0.3,
  );
  // Une seule ligne retombe EXACTEMENT sur l'écart d'avant (1,9 corps) : ouvrir
  // le texte ne doit pas déplacer les planches déjà composées.
  return ligne - m.corps * 1.9;
}

function dessinerCarte(ctx, format, o) {
  const {
    carte,
    trace,
    police,
    polices,
    logo,
    fond,
    m,
    th,
    ombre,
    zones,
    index,
    total,
  } = o;
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
  const view = cadre?.coords?.length
    ? vueDeLaCarte(cadre.coords, format.cle)
    : null;

  // Les journées montrées, AVEC leur rang d'origine (cf. `journeesMontrees`).
  const montrees = journeesMontrees(carte, o.segments);
  // Le profil et la polyligne veulent deux listes parallèles : on les fabrique
  // ICI, depuis les paires, pour qu'elles ne puissent pas se désaccorder.
  const segments = montrees.map((j) => j.seg);
  const couleurs = montrees.map((j) => couleurDuJour(carte, j.jour));
  /** L'itinéraire est-il découpé du tout ? Une sortie d'un seul tenant garde le
   *  profil « acquis » en ambre ; dès qu'il y a des journées, chacune a sa
   *  couleur — y compris quand la planche n'en montre qu'UNE. */
  const decoupee = (o.segments ?? []).length > 1;

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
  voileTexte(
    ctx,
    format,
    th,
    format.height -
      portee(
        carte.degradeBasH,
        format.height - (fenetre.y + fenetre.height),
        m,
      ),
    intensite(carte.degradeBas, 1),
  );
  // La bande d'en-tête doit rester lisible par-dessus les tuiles.
  voileEntete(
    ctx,
    format,
    m,
    th,
    intensite(carte.degradeHaut, 0.8),
    portee(carte.degradeHautH, m.bandeH * 1.4, m),
  );

  // Cliquer n'importe où hors des textes ouvre les réglages de trace.
  zoneDeRepli(zones, format, m, "carte");

  if (view && cadre?.coords?.length) {
    const epaisseur = Math.max(3, 7.5 * m.k);
    // L'itinéraire ENTIER, en sourdine : il tient la forme du parcours même là
    // où aucune journée n'est mise en avant.
    polyligne(
      ctx,
      decimerPixels(cadre.coords.map((c) => view.project(c))),
      th.cle === "clair"
        ? "rgba(34, 36, 30, 0.28)"
        : "rgba(254, 251, 246, 0.24)",
      epaisseur * 0.62,
      false,
    );
    montrees.forEach(({ jour, seg }) => {
      const couleur = couleurDuJour(carte, jour);
      polyligne(
        ctx,
        decimerPixels(seg.coords.map((c) => view.project(c))),
        couleur,
        epaisseur,
        true,
      );
    });

    // Étiquettes en DERNIER : sur tous les tracés, jamais dessous.
    poserOmbre(ctx, ombre, "corps");
    montrees.forEach(({ jour, seg }) => {
      const etq = carte.etiquettes?.[jour] ?? {};
      if (etq.masquee) return;
      const texte = etq.texte ?? `J${jour + 1}`;
      if (!texte.trim()) return;
      const ancre = ancreDuSegment(seg, view.project);
      if (!ancre) return;
      const boite = calerEtiquette(
        boiteEtiquette(ctx, texte, ancre, m, police),
        format,
        m,
        fenetre,
      );
      boite.x += etq.dx ?? 0;
      boite.y += etq.dy ?? 0;
      dansLeCadre(boite, format);
      dessinerEtiquette(
        ctx,
        texte,
        boite,
        couleurDuJour(carte, jour),
        m,
        th,
        police,
      );
      boites.push({ index: jour, ...boite });
    });
    sansOmbre(ctx);
  }

  poserOmbre(ctx, ombre, "entete");
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
    zones,
  });

  /* Bloc du bas : profil, surtitre, titre, ligne factuelle. Construit de bas en
     haut pour que le titre pousse le profil, jamais l'inverse. */
  let y = m.piedFilet - Math.round(34 * m.k);

  const align = alignementDe(carte);
  const largeurTexte = format.width - m.pad * 2;
  y = ligneDeChiffres(ctx, format, m, th, polices, carte, y, {
    texte: carte.pied ?? ligneFactuelle(trace, carte.bilan),
    align,
    largeur: largeurTexte,
    ombre,
    zones,
  });

  // Titre et surtitre peuvent s'échanger : ici on construit du bas vers le
  // haut, donc « inverser » revient à poser le surtitre en premier.
  const poserTitre = () => {
    poserOmbre(ctx, ombre, "titre");
    const bt = baseTitre(m, th, polices, carte);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeurTexte, bt);
    // On réserve la place du filet AVANT d'empiler le titre, puis on le pose
    // une fois la dernière ligne connue.
    if (carte.filetTitre) y -= hauteurFiletTitre(m, carte);
    const basTitre = y;
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      dessinerLigneRiche(
        ctx,
        ls[i],
        m.pad + decalageAlignement(align, largeurTexte, largeurLigne(ls[i])),
        y,
        bt,
      );
      y -= bt.taille * bt.interligne;
    }
    filetSousTitre(ctx, m, th, carte, basTitre, {
      align,
      x: m.pad,
      largeur: largeurTexte,
    });
    zoneTexte(
      zones,
      "titre",
      m,
      m.pad,
      largeurTexte,
      y,
      basTitre + hauteurFiletTitre(m, carte),
    );
    y -= m.surtitre * 0.5;
  };
  const poserSurtitre = () => {
    poserOmbre(ctx, ombre, "surtitre");
    ctx.fillStyle = th.accent;
    const { sup } = surtitre(
      ctx,
      m,
      th,
      policeDe(carte, "policeSurtitre", polices),
      carte.surtitre,
      m.pad,
      y,
      {
        align,
        polices,
        filet: carte.surtitreFilet !== false,
        plaque: plaqueDe(carte, th, "surtitre"),
        largeur: largeurTexte,
        // Composé du bas vers le haut : `y` est la ligne du BAS, les lignes
        // supplémentaires s'empilent au-dessus.
        depuisLeBas: true,
      },
    );
    zoneTexte(
      zones,
      "surtitre",
      m,
      m.pad,
      largeurTexte,
      y - m.surtitre - sup,
      y + m.surtitre * 0.3,
    );
    y -= sup + m.surtitre * 2.1;
  };
  for (const quoi of ordreDuTitre(carte, true)) {
    if (quoi === "titre" && carte.titre) poserTitre();
    if (quoi === "surtitre" && carte.surtitre) poserSurtitre();
  }

  // Le profil n'est pas du texte : une silhouette doublée d'une ombre portée
  // devient illisible.
  sansOmbre(ctx);
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
      // `decoupee` et non `segments.length > 1` : une planche qui ne montre
      // qu'une journée en montre UNE, et cette journée-là doit être à SA
      // couleur — pas à l'ambre du « déjà parcouru », qui dirait autre chose.
      segments: decoupee && segments.length > 0 ? segments : null,
      couleurs,
      doneKm:
        carte.jusquA != null
          ? (segments[segments.length - 1]?.kmFin ?? 0)
          : carte.bilan
            ? trace.totalKm
            : 0,
    });
  }

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
  if (view && fond && carte.afficherFond !== false)
    attributionVerticale(ctx, format, m, th, police);
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
  ctx.translate(
    format.width - Math.round(m.pad * 0.42),
    m.bandeH + Math.round(28 * m.k),
  );
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
  const { carte, police, polices, logo, m, th, ombre, zones, index, total } = o;
  // Toute la planche EST la photo : c'est la zone de repli, donc la première
  // déclarée — les textes se posent par-dessus et gagnent au clic.
  zone(zones, "photo", 0, 0, format.width, format.height);

  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      format,
      carte.ancrage ?? 0.5,
    );
    if (c)
      ctx.drawImage(
        carte.image,
        c.sx,
        c.sy,
        c.sw,
        c.sh,
        c.dx,
        c.dy,
        c.dw,
        c.dh,
      );
  }
  voileTexte(
    ctx,
    format,
    th,
    format.height - portee(carte.degradeBasH, format.height * 0.58, m),
    intensite(carte.degradeBas, 1),
  );
  if (carte.image)
    voileEntete(
      ctx,
      format,
      m,
      th,
      intensite(carte.degradeHaut, 0.72),
      portee(carte.degradeHautH, m.bandeH * 1.5, m),
    );

  poserOmbre(ctx, ombre, "entete");
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false && !carte.image,
    opacite: carte.enteteOpacite,
    zones,
  });

  let y = m.piedFilet - Math.round(34 * m.k);
  const align = alignementDe(carte);
  const largeurTexte = format.width - m.pad * 2;
  y = ligneDeChiffres(ctx, format, m, th, polices, carte, y, {
    texte: carte.pied ?? "",
    align,
    largeur: largeurTexte,
    ombre,
    zones,
  });
  if (carte.texte) {
    // Ce gabarit se construit du BAS vers le haut. Avec des listes et des
    // respirations, empiler à reculons devient illisible : on mesure le bloc
    // entier, on remonte d'autant, et on le pose dans le sens normal.
    poserOmbre(ctx, ombre, "corps");
    const bc = baseCorps(m, th, polices, carte);
    const blocs = blocsDeTexte(ctx, carte.texte, largeurTexte, bc);
    const hauteur = hauteurBlocs(blocs, bc);
    poserBlocs(ctx, blocs, m.pad, y - hauteur + m.corps * 0.2, bc, {
      align,
      largeur: largeurTexte,
      puce: carte.puce,
    });
    zoneTexte(zones, "texte", m, m.pad, largeurTexte, y - hauteur, y);
    y -= hauteur + m.corps * 0.5;
  }
  const poserTitre = () => {
    poserOmbre(ctx, ombre, "titre");
    const bt = baseTitre(m, th, polices, carte);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeurTexte, bt);
    if (carte.filetTitre) y -= hauteurFiletTitre(m, carte);
    const basTitre = y;
    for (let i = ls.length - 1; i >= 0; i -= 1) {
      dessinerLigneRiche(
        ctx,
        ls[i],
        m.pad + decalageAlignement(align, largeurTexte, largeurLigne(ls[i])),
        y,
        bt,
      );
      y -= bt.taille * bt.interligne;
    }
    filetSousTitre(ctx, m, th, carte, basTitre, {
      align,
      x: m.pad,
      largeur: largeurTexte,
    });
    zoneTexte(
      zones,
      "titre",
      m,
      m.pad,
      largeurTexte,
      y,
      basTitre + hauteurFiletTitre(m, carte),
    );
    y -= m.surtitre * 0.5;
  };
  const poserSurtitre = () => {
    poserOmbre(ctx, ombre, "surtitre");
    const { sup } = surtitre(
      ctx,
      m,
      th,
      policeDe(carte, "policeSurtitre", polices),
      carte.surtitre,
      m.pad,
      y,
      {
        align,
        polices,
        filet: carte.surtitreFilet !== false,
        plaque: plaqueDe(carte, th, "surtitre"),
        largeur: largeurTexte,
        // Composé du bas vers le haut : `y` est la ligne du BAS, les lignes
        // supplémentaires s'empilent au-dessus.
        depuisLeBas: true,
      },
    );
    zoneTexte(
      zones,
      "surtitre",
      m,
      m.pad,
      largeurTexte,
      y - m.surtitre - sup,
      y + m.surtitre * 0.3,
    );
    y -= sup + m.surtitre * 2.1;
  };
  for (const quoi of ordreDuTitre(carte, true)) {
    if (quoi === "titre" && carte.titre) poserTitre();
    if (quoi === "surtitre" && carte.surtitre) poserSurtitre();
  }

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
  return [];
}

/** LE TEXTE — surtitre, titre, paragraphes. La respiration du carrousel. */
function dessinerTexte(ctx, format, o) {
  const { carte, police, polices, logo, m, th, ombre, zones, index, total } = o;
  zoneDeRepli(zones, format, m, "texte");
  poserOmbre(ctx, ombre, "entete");
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
    zones,
  });

  const largeur = format.width - m.pad * 2;
  const y = m.bandeH + Math.round(112 * m.k);
  blocTitreEtCorps(ctx, format, m, th, polices, carte, y, largeur, {
    ombre,
    zones,
  });

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
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
function blocTitreEtCorps(
  ctx,
  format,
  m,
  th,
  polices,
  carte,
  yDepart,
  largeur,
  { echelleTitre = 1, ombre = null, zones = null } = {},
) {
  let y = yDepart;
  const align = alignementDe(carte);
  const bt = baseTitre(m, th, polices, carte, echelleTitre);
  const bc = baseCorps(m, th, polices, carte);

  const poserSurtitre = (premier, ferme = false, dernierDuBloc = false) => {
    poserOmbre(ctx, ombre, "surtitre");
    ctx.fillStyle = th.accent;
    // En tête de bloc, `y` EST la ligne de base. Après le titre, il faut
    // d'abord descendre de la hauteur des capitales, sinon le surtitre remonte
    // dans la jambe du titre.
    const base = premier ? y : y + m.surtitre;
    const { dernier, sup } = surtitre(
      ctx,
      m,
      th,
      policeDe(carte, "policeSurtitre", polices),
      carte.surtitre,
      m.pad,
      base,
      {
        align,
        polices,
        filet: carte.surtitreFilet !== false,
        plaque: plaqueDe(carte, th, "surtitre"),
        largeur,
      },
    );
    zoneTexte(
      zones,
      "surtitre",
      m,
      m.pad,
      largeur,
      base - m.surtitre,
      dernier + m.surtitre * 0.3,
    );
    // Passé DERRIÈRE le titre, le surtitre devient la ligne qui introduit le
    // corps : il lui faut le même souffle qu'à un titre, pas l'écart serré d'un
    // surtitre qui ouvre. Et RIEN quand il ferme le bloc : l'appelant décide
    // alors de ce qui vient après, il n'a pas à défaire un écart hérité.
    y = base + sup + m.surtitre * (dernierDuBloc ? 0.3 : premier ? 1.3 : 2.1);
    // `ferme` : le filet passe SOUS LE DUO. Le surtitre est alors le sous-titre
    // du titre, et un trait glissé entre les deux les séparerait au lieu de les
    // souligner.
    if (ferme) {
      const bas = filetSousTitre(
        ctx,
        m,
        th,
        carte,
        base + sup + m.surtitre * 0.4,
        {
          align,
          x: m.pad,
          largeur,
        },
      );
      y = Math.max(y, bas + m.corps * 0.9);
    }
  };
  /**
   * L'écart APRÈS le titre se mesure sur CE QUI SUIT, jamais sur le corps seul.
   *
   * Il valait 2,2 corps quoi qu'il arrive. C'est juste devant un paragraphe —
   * la jambe du titre descend sous sa ligne de base, la hampe du corps remonte,
   * l'écart utile est bien plus petit que l'écart nominal, et « assistance. »
   * collait à « Quatre jours ». Mais devant un SURTITRE, qui est une ligne de
   * petites capitales de 22, ces 2,2 corps ouvraient un trou de cent pixels
   * pour rien : on mesurait un écart avec la mauvaise règle.
   */
  const poserTitre = (suivant, duo) => {
    poserOmbre(ctx, ombre, "titre");
    const haut = y;
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeur, bt);
    y = poserLignes(ctx, ls, m.pad, y + bt.taille * 0.86, bt, {
      align,
      largeur,
    });
    // En duo, le filet attend le surtitre (cf. `poserSurtitre`).
    if (!duo)
      y = filetSousTitre(ctx, m, th, carte, y, { align, x: m.pad, largeur });
    zoneTexte(zones, "titre", m, m.pad, largeur, haut, y);
    if (!suivant) return;
    y +=
      (suivant === "surtitre" ? m.surtitre : m.corps) *
      nombre(carte?.apresTitre, APRES_TITRE);
  };

  const ordre = ordreDuTitre(carte);

  /**
   * LE DUO SUR UNE SEULE LIGNE : « Jour 1 · VÉNOSC → VALGAUDÉMAR ».
   *
   * Un titre court — un numéro de journée, un mot — laisse la moitié de sa
   * ligne vide, et le surtitre qui le suit ouvre un second étage pour trois
   * mots. Mis bout à bout, les deux ne font qu'une ligne, et le contraste des
   * deux corps SUFFIT à les distinguer : c'est le geste d'un titre de presse.
   *
   * Seule la DERNIÈRE ligne du titre partage sa ligne — les précédentes gardent
   * toute la largeur. Et seule la PREMIÈRE ligne du surtitre s'y met : les
   * suivantes s'empilent dessous, à l'aplomb de leur début.
   *
   * L'alignement porte sur la PAIRE, jamais sur ses deux moitiés séparément :
   * centré, c'est l'ensemble « titre + surtitre » qui se centre, sinon le titre
   * se centrerait tout seul et le surtitre partirait vers la droite.
   */
  const poserDuoEnLigne = () => {
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeur, bt);
    const derniere = ls[ls.length - 1] ?? [];
    const hautes = ls.slice(0, -1);
    const haut = y;

    let base = y + bt.taille * 0.86;
    if (hautes.length) {
      poserOmbre(ctx, ombre, "titre");
      base =
        poserLignes(ctx, hautes, m.pad, base, bt, { align, largeur }) +
        bt.taille * (bt.interligne ?? INTERLIGNE_TITRE);
    }

    const lignesSur = lignesDeSurtitre(m, carte.surtitre, {
      align: "gauche",
      filet: carte.surtitreFilet !== false,
    });
    const policeSur = policeDe(carte, "policeSurtitre", polices);
    const largeurTitre = largeurLigne(derniere);
    // L'écart entre les deux se mesure sur le SURTITRE, pas sur le titre : il
    // sépare deux mots, et c'est le petit corps qui donne l'échelle d'un blanc
    // entre des mots. Mesuré sur le titre, un « Jour 1 » de 60 px poussait le
    // surtitre à l'autre bout de la ligne.
    const ecart = Math.round(
      m.surtitre * nombre(carte.ecartDuoEnLigne, ECART_DUO),
    );
    const largeurSur = lignesSur.length
      ? largeurDeSurtitre(ctx, policeSur, lignesSur[0], polices)
      : 0;
    const decal = decalageAlignement(
      align,
      largeur,
      largeurTitre + (largeurSur ? ecart + largeurSur : 0),
    );

    poserOmbre(ctx, ombre, "titre");
    dessinerLigneRiche(ctx, derniere, m.pad + decal, base, bt);
    zoneTexte(zones, "titre", m, m.pad, largeur, haut, base + bt.taille * 0.3);

    let sup = 0;
    let baseSur = base;
    if (largeurSur) {
      poserOmbre(ctx, ombre, "surtitre");
      ctx.fillStyle = th.accent;
      const xSur = m.pad + decal + largeurTitre + ecart;
      /**
       * LES DEUX SE CENTRENT SUR LEUR HAUTEUR DE CAPITALE, pas sur la ligne de
       * base qu'ils partagent.
       *
       * Posé sur la même ligne de base qu'un titre trois fois plus gros, un
       * surtitre en petites capitales pend au PIED du titre : typographiquement
       * c'est juste, optiquement c'est un décrochage. On fait donc coïncider
       * les deux centres optiques — la hauteur de capitale d'Ubuntu vaut ~0,70
       * em, son milieu est à `CENTRE_CAPITALES` au-dessus de la ligne de base —
       * ce qui revient à remonter le surtitre de la moitié de ce qui les sépare.
       */
      baseSur =
        base -
        CENTRE_CAPITALES * (bt.taille - lignesSur[0].taille) +
        m.surtitre * nombre(carte.decalageDuoEnLigne, 0);
      ({ sup } = surtitre(
        ctx,
        m,
        th,
        policeSur,
        carte.surtitre,
        xSur,
        baseSur,
        {
          // Le bloc EST déjà placé : ses lignes se posent à son aplomb, elles ne
          // se réalignent pas dans une largeur qui n'est plus la leur.
          align: "gauche",
          largeur: 0,
          polices,
          filet: carte.surtitreFilet !== false,
          plaque: plaqueDe(carte, th, "surtitre"),
        },
      ));
      zoneTexte(
        zones,
        "surtitre",
        m,
        xSur,
        largeur - (xSur - m.pad),
        baseSur - m.surtitre,
        baseSur + sup + m.surtitre * 0.3,
      );
    }

    // Remonté, le surtitre ne décide plus du bas du bloc — mais sur plusieurs
    // lignes il peut redescendre plus bas que le titre. On prend le plus bas
    // des deux, sinon le texte qui suit viendrait s'écrire dessus.
    y = Math.max(base, baseSur + sup) + bt.taille * 0.3;
    // Le filet souligne la PAIRE : elle est le titre, il passe dessous.
    y = filetSousTitre(ctx, m, th, carte, y, { align, x: m.pad, largeur });
    if (carte.texte) y += m.corps * nombre(carte?.apresTitre, APRES_TITRE);
  };

  /**
   * LE DUO : titre puis surtitre, soulignés ENSEMBLE.
   *
   * Le filet s'appelle « sous le titre » et se posait sous le titre — ce qui,
   * quand le surtitre passe derrière, le glisse ENTRE les deux et les sépare.
   * Or dans cet ordre le surtitre n'ouvre plus, il précise : c'est un
   * sous-titre, et un trait qui souligne un titre passe sous son sous-titre.
   */
  const duo =
    carte.filetSousDuo === true &&
    Boolean(carte.filetTitre) &&
    Boolean(carte.titre) &&
    Boolean(carte.surtitre) &&
    ordre[0] === "titre";

  const enLigne =
    carte.surtitreEnLigne === true &&
    Boolean(carte.titre) &&
    Boolean(carte.surtitre);
  if (enLigne) poserDuoEnLigne();

  for (const [i, quoi] of enLigne ? [] : ordre.entries()) {
    // Dernier du bloc : rien d'écrit ne le suit — ni l'autre ligne du duo, ni
    // un corps. C'est alors à l'appelant de dire l'air qu'il veut dessous.
    const dernier = i === ordre.length - 1 && !carte.texte;
    if (quoi === "surtitre" && carte.surtitre)
      poserSurtitre(i === 0, duo, dernier);
    if (quoi === "titre" && carte.titre) {
      // Ce qui vient après le titre : l'autre ligne du duo si elle est écrite,
      // sinon le corps s'il y en a un, sinon rien — et le bloc s'arrête là.
      const apres = ordre[i + 1];
      poserTitre(
        apres === "surtitre" && carte.surtitre
          ? "surtitre"
          : carte.texte
            ? "texte"
            : null,
        duo,
      );
    }
  }
  if (carte.texte) {
    poserOmbre(ctx, ombre, "corps");
    if (!carte.titre) y += m.corps * 0.4;
    const haut = y;
    y = poserBlocs(
      ctx,
      blocsDeTexte(ctx, carte.texte, largeur, bc),
      m.pad,
      y,
      bc,
      {
        align,
        largeur,
        puce: carte.puce,
      },
    );
    zoneTexte(zones, "texte", m, m.pad, largeur, haut, y);
  }
  return y;
}

/**
 * UNE PHOTO QUI SE DISSOUT DANS LA PAGE.
 *
 * Le fondu n'est pas un effet : une coupure franche ressemble à une image
 * COLLÉE, pas à une planche composée. Le dégradé va vers `voileTexte`, qui EST
 * la couleur de fond du thème — la photo se termine donc exactement sur le
 * papier, en sombre comme en clair, sans qu'on ait à redire la couleur ici.
 *
 * Sans image, on pose l'aplat de repérage : sur une planche vide, il faut voir
 * où la photo ira.
 *
 * @param {number} haut - où la bande commence. Le bandeau part de 0 (l'en-tête
 *   passe PAR-DESSUS l'image) ; l'étape part sous le filet d'en-tête, pour
 *   garder la bande de marque sur le papier.
 */
function photoFondue(ctx, format, m, th, carte, haut, hauteur) {
  if (!carte.image) {
    ctx.fillStyle = th.filet;
    ctx.fillRect(0, haut, format.width, hauteur);
    return;
  }
  const c = cadrageCouverture(
    { width: carte.image.width, height: carte.image.height },
    { width: format.width, height: hauteur },
    carte.ancrage ?? 0.5,
  );
  if (c)
    ctx.drawImage(
      carte.image,
      c.sx,
      c.sy,
      c.sw,
      c.sh,
      0,
      haut,
      format.width,
      hauteur,
    );

  const bas = intensite(carte.degradeBas, 1);
  if (bas <= 0) return;
  const fondu = Math.round(portee(carte.degradeBasH, hauteur * 0.42, m));
  const y = haut + hauteur - fondu;
  const g = ctx.createLinearGradient(0, y, 0, haut + hauteur);
  g.addColorStop(0, `rgba(${th.voileTexte}, 0)`);
  g.addColorStop(0.55, `rgba(${th.voileTexte}, ${(0.55 * bas).toFixed(3)})`);
  g.addColorStop(1, `rgba(${th.voileTexte}, ${bas.toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y, format.width, fondu);
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
  const { carte, police, polices, logo, m, th, ombre, zones, index, total } = o;
  const hauteur = Math.round(format.height * (carte.bandeauPart ?? 0.42));
  zoneDeRepli(zones, format, m, "texte");
  zone(zones, "photo", 0, 0, format.width, hauteur);

  photoFondue(ctx, format, m, th, carte, 0, hauteur);
  if (carte.image) {
    voileEntete(
      ctx,
      format,
      m,
      th,
      intensite(carte.degradeHaut, 0.74),
      portee(carte.degradeHautH, m.bandeH * 1.4, m),
    );
  }

  poserOmbre(ctx, ombre, "entete");
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false && !carte.image,
    opacite: carte.enteteOpacite,
    zones,
  });

  const largeur = format.width - m.pad * 2;
  const y = hauteur + Math.round(74 * m.k);
  blocTitreEtCorps(ctx, format, m, th, polices, carte, y, largeur, {
    ombre,
    zones,
  });

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
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
  const { carte, police, polices, logo, m, th, ombre, zones, index, total } = o;
  zoneDeRepli(zones, format, m, "fiche");

  poserOmbre(ctx, ombre, "entete");
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
    zones,
  });

  const align = alignementDe(carte);
  const largeurTexte = format.width - m.pad * 2;
  let y = m.bandeH + Math.round(118 * m.k);
  const poserSurtitre = (premier) => {
    poserOmbre(ctx, ombre, "surtitre");
    ctx.fillStyle = th.accent;
    const base = premier ? y : y + m.surtitre;
    const { dernier, sup } = surtitre(
      ctx,
      m,
      th,
      policeDe(carte, "policeSurtitre", polices),
      carte.surtitre,
      m.pad,
      base,
      {
        align,
        polices,
        filet: carte.surtitreFilet !== false,
        plaque: plaqueDe(carte, th, "surtitre"),
        largeur: largeurTexte,
      },
    );
    zoneTexte(
      zones,
      "surtitre",
      m,
      m.pad,
      largeurTexte,
      base - m.surtitre,
      dernier + m.surtitre * 0.3,
    );
    y = base + sup + m.surtitre * 1.3;
  };
  const poserTitre = () => {
    poserOmbre(ctx, ombre, "titre");
    const haut = y;
    const bt = baseTitre(m, th, polices, carte, 0.86);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeurTexte, bt);
    y = poserLignes(ctx, ls, m.pad, y + bt.taille * 0.86, bt, {
      align,
      largeur: largeurTexte,
    });
    // La fiche l'allume par défaut : c'est ce trait qui la faisait tenir.
    y = filetSousTitre(
      ctx,
      m,
      th,
      { ...carte, filetTitre: carte.filetTitre !== false },
      y,
      {
        align,
        x: m.pad,
        largeur: largeurTexte,
      },
    );
    zoneTexte(zones, "titre", m, m.pad, largeurTexte, haut, y);
    y += Math.round(46 * m.k);
  };
  for (const [i, quoi] of ordreDuTitre(carte).entries()) {
    if (quoi === "surtitre" && carte.surtitre) poserSurtitre(i === 0);
    if (quoi === "titre" && carte.titre) poserTitre();
  }

  const lignesFiche = (carte.fiche ?? []).filter(
    (l) => l && (l.label || l.valeur),
  );
  const hautFiche = y;
  // Les corps de la fiche se règlent : une fiche à trois lignes respire d'un
  // tout autre calibre qu'une fiche à huit.
  const libelle = m.ficheLabel;
  const valeur = m.ficheValeur;
  const pasLigne = Math.round(valeur * 2.1);

  for (const [i, l] of lignesFiche.entries()) {
    if (i > 0) {
      sansOmbre(ctx);
      ctx.fillStyle = th.filet;
      ctx.fillRect(m.pad, y, format.width - m.pad * 2, Math.max(1, 1.2 * m.k));
    }
    const base = y + pasLigne * 0.66;

    // Le libellé suit l'ombre du SURTITRE et la valeur celle du TITRE : ce sont
    // leurs rôles dans la fiche, et déjà leurs polices.
    poserOmbre(ctx, ombre, "surtitre");
    ctx.font = `400 ${libelle}px ${policeDe(carte, "policeSurtitre", polices)}`;
    ctx.fillStyle = th.encreFaible;
    dessinerCapitales(
      ctx,
      morceauxCapitales(l.label ?? ""),
      m.pad,
      base,
      libelle,
      0.26,
      th.accent,
    );

    poserOmbre(ctx, ombre, "titre");
    ctx.font = `700 ${valeur}px ${policeDe(carte, "policeTitre", polices)}`;
    ctx.fillStyle = l.accent ? th.accent : th.encre;
    ctx.textAlign = "right";
    ctx.fillText(
      String(l.valeur ?? ""),
      format.width - m.pad,
      base + valeur * 0.1,
    );
    ctx.textAlign = "left";

    y += pasLigne;
  }
  zoneTexte(zones, "fiche", m, m.pad, format.width - m.pad * 2, hautFiche, y);

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
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
/**
 * L'ENCART DE CLÔTURE : un cadre, et des chiffres dedans.
 *
 * Sur une photo pleine page, une colonne de données posée à nu se perd — le
 * voile de clôture la rend lisible, mais rien ne la RASSEMBLE, et elle flotte
 * au milieu de l'image. Un cadre en fait un objet : c'est la vignette de fin,
 * le bilan qu'on lit d'un coup.
 *
 * Il porte le MÊME texte que la colonne d'une étape (`Libellé = valeur`, plus
 * tout le balisage) : c'est déjà la syntaxe des chiffres du carrousel, et une
 * seconde façon de les écrire n'aurait rien apporté.
 */
function dessinerEncart(ctx, m, th, polices, carte, boite, { ombre, zones }) {
  const rayon = Math.round(nombre(carte.encartRayon, 18) * m.k);
  const opacite = intensite(carte.encartFond, 0.34);
  if (opacite > 0) {
    ctx.fillStyle = `rgba(${th.voileTexte}, ${opacite.toFixed(3)})`;
    rectArrondi(ctx, boite.x, boite.y, boite.width, boite.height, rayon);
    ctx.fill();
  }
  if (carte.encartCadre !== false) {
    ctx.strokeStyle = carte.couleurEncart || th.filet;
    ctx.lineWidth = Math.max(1, nombre(carte.encartEpaisseur, 2) * m.k);
    rectArrondi(ctx, boite.x, boite.y, boite.width, boite.height, rayon);
    ctx.stroke();
  }
  const base = baseDeColonne(m, th, polices, carte);
  const pad = Math.round(nombre(carte.encartPad, 34) * m.k);
  const dedans = boite.width - pad * 2;
  const blocs = blocsDeTexte(ctx, carte.colonne ?? "", dedans, base);
  const naturelle = Math.min(dedans, largeurBlocs(ctx, blocs, base));
  poserOmbre(ctx, ombre, "corps");
  poserBlocs(
    ctx,
    blocs,
    boite.x + Math.round((boite.width - naturelle) / 2),
    boite.y + pad,
    base,
    {
      align: alignementDe(carte, "centre"),
      largeur: naturelle,
      puce: carte.puce,
    },
  );
  sansOmbre(ctx);
  zoneTexte(
    zones,
    "colonne",
    m,
    boite.x,
    boite.width,
    boite.y,
    boite.y + boite.height,
  );
}

/** La hauteur qu'un encart prendra — mesurée avant que le bloc de clôture ne se
 *  centre, comme toutes les autres pièces. */
function hauteurEncart(ctx, m, th, polices, carte, largeur) {
  const base = baseDeColonne(m, th, polices, carte);
  const pad = Math.round(nombre(carte.encartPad, 34) * m.k);
  const blocs = blocsDeTexte(ctx, carte.colonne ?? "", largeur - pad * 2, base);
  return hauteurBlocs(blocs, base) + pad * 2;
}

function dessinerCloture(ctx, format, o) {
  const {
    carte,
    trace,
    police,
    polices,
    logo,
    m,
    th,
    ombre,
    zones,
    index,
    total,
  } = o;
  const cadre = o.traceCadre ?? trace;

  zone(zones, "photo", 0, 0, format.width, format.height);
  if (carte.image) {
    const c = cadrageCouverture(
      { width: carte.image.width, height: carte.image.height },
      format,
      carte.ancrage ?? 0.5,
    );
    if (c)
      ctx.drawImage(
        carte.image,
        c.sx,
        c.sy,
        c.sw,
        c.sh,
        c.dx,
        c.dy,
        c.dw,
        c.dh,
      );
    // Voile PLEIN, pas dégradé : le texte est au centre, il n'a pas de bord où
    // s'appuyer. Réglable, comme partout ailleurs.
    ctx.fillStyle = `rgba(${th.voileTexte}, ${carte.voileCloture ?? 0.62})`;
    ctx.fillRect(0, 0, format.width, format.height);
  }

  poserOmbre(ctx, ombre);

  /* LE BLOC DE CLÔTURE, MESURÉ AVANT D'ÊTRE POSÉ.
     Le surtitre et le titre peuvent passer AU-DESSUS du logo (`clotureHaut`) :
     « Merci d'avoir suivi » annoncé, puis la signature dessous, se lit comme
     une fin ; l'inverse se lit comme un en-tête. Pour que les deux soient
     centrés, il faut connaître la hauteur totale du bloc avant d'écrire la
     première ligne — d'où la mesure, puis la pose. */
  const centreX = format.width / 2;
  const rayon = Math.round(nombre(carte.tailleCercle, 128) * m.k);
  const largeur = format.width - m.pad * 2;
  const bt = baseTitre(m, th, polices, carte);
  const bc = baseCorps(m, th, polices, carte);

  const align = alignementDe(carte, "centre");
  /**
   * CE QUI PASSE AU-DESSUS DU LOGO, pièce par pièce.
   *
   * Trois cases indépendantes plutôt qu'un menu à quatre entrées : avec le
   * texte, un menu aurait eu huit combinaisons à nommer. `clotureHaut` était ce
   * menu — les planches déjà enregistrées le portent, on le lit donc en secours.
   */
  const ancien = carte.clotureHaut ?? "non";
  const enHaut = (quoi) => {
    const choisi = carte[`clotureHaut_${quoi}`];
    if (typeof choisi === "boolean") return choisi;
    return quoi !== "texte" && (ancien === quoi || ancien === "les-deux");
  };

  const lignesTitre = carte.titre
    ? lignesRiches(ctx, analyserRiche(carte.titre), largeur, bt)
    : [];
  const blocsTexte = carte.texte
    ? blocsDeTexte(ctx, carte.texte, largeur, bc)
    : [];

  /** Les pièces du bloc, dans l'ordre où elles se posent. */
  const morceaux = [];
  const pieceSurtitre = carte.surtitre
    ? { type: "surtitre", hauteur: m.surtitre * 1.9 }
    : null;
  const pieceTitre = lignesTitre.length
    ? {
        type: "titre",
        hauteur:
          bt.taille * 0.7 +
          (lignesTitre.length - 1) * bt.taille * bt.interligne +
          (carte.filetTitre ? hauteurFiletTitre(m, carte) : 0) +
          bt.taille * 0.3,
      }
    : null;
  const pieceTexte = blocsTexte.length
    ? { type: "texte", hauteur: hauteurBlocs(blocsTexte, bc) }
    : null;
  const pieceLogo = { type: "logo", hauteur: rayon * 2 };

  /* LA TRACE ENTIÈRE — le tour, d'un coup, en guise de bilan.
     Toutes les journées en couleur : la clôture ne raconte plus une étape, elle
     rend le parcours. Un carré, comme la vignette d'une étape, avec le profil
     dessous quand on le demande. */
  const journees = journeesMontrees(carte, o.segments).map(({ jour, seg }) => ({
    seg,
    kmDebut: seg.kmDebut,
    kmFin: seg.kmFin,
    couleur: couleurDuJour(carte, jour),
  }));
  let coteTrace = Math.round(
    Math.min(largeur, nombre(carte.tailleTrace, 420) * m.k),
  );
  const avecProfil = carte.afficherProfil === true && cadre?.profil?.length > 1;
  const ecartProfil = avecProfil ? Math.round(16 * m.k) : 0;
  let hProfil = avecProfil ? Math.round(coteTrace * 0.2) : 0;
  const pieceTrace =
    carte.clotureTrace === true && cadre?.coords?.length > 1
      ? { type: "trace", hauteur: coteTrace + ecartProfil + hProfil }
      : null;

  const largeurEncart = Math.round(
    Math.min(
      largeur,
      largeur * Math.max(0.3, Math.min(1, nombre(carte.encartPart, 0.78))),
    ),
  );
  const pieceEncart =
    carte.clotureEncart === true && String(carte.colonne ?? "").trim()
      ? {
          type: "encart",
          hauteur: hauteurEncart(ctx, m, th, polices, carte, largeurEncart),
        }
      : null;

  const ecart = Math.round(72 * m.k);
  // L'ordre titre/surtitre est celui de la planche (`titreDevant`) et le texte
  // ferme ; passer au-dessus du logo est un réglage à part, qui DÉPLACE une
  // pièce sans changer l'ordre des autres entre elles.
  const suite = [
    ...ordreDuTitre(carte).map((quoi) =>
      quoi === "surtitre" ? pieceSurtitre : pieceTitre,
    ),
    pieceTexte,
    pieceTrace,
    pieceEncart,
  ].filter(Boolean);
  for (const piece of suite) if (enHaut(piece.type)) morceaux.push(piece);
  morceaux.push(pieceLogo);
  for (const piece of suite) if (!enHaut(piece.type)) morceaux.push(piece);

  const hautZone = format.zoneSure?.top ?? m.bandeH;
  // Le bloc est centré dans la zone UTILE, pas dans la planche : en story,
  // l'interface d'Instagram mange le haut et le bas.
  const basZone = m.piedFilet;
  const dispo = basZone - hautZone;
  const empilee = () =>
    morceaux.reduce((somme, p) => somme + p.hauteur, 0) +
    Math.max(0, morceaux.length - 1) * ecartUtile;

  /**
   * LE BLOC NE DÉBORDE PAS DE LA PLANCHE.
   *
   * Avec la trace et l'encart, la clôture peut porter cinq pièces : le bloc
   * dépassait alors la page par les deux bouts — logo coupé en haut, chiffres
   * sous le bord en bas — et rien ne le disait avant l'export.
   *
   * On resserre D'ABORD les écarts, jusqu'à un plancher : c'est le réglage le
   * moins coûteux, personne ne compte les blancs. Puis, s'il le faut encore, on
   * rétrécit la TRACE — la seule pièce dont la taille est un choix et non un
   * texte qu'on aurait écrit. Un texte trop long reste trop long : le tronquer
   * en douce serait pire que de le laisser déborder, qui au moins se voit.
   */
  let ecartUtile = ecart;
  const ecartMin = Math.round(20 * m.k);
  const entre = Math.max(0, morceaux.length - 1);
  if (empilee() > dispo && entre > 0) {
    ecartUtile = Math.max(ecartMin, ecartUtile - (empilee() - dispo) / entre);
  }
  if (empilee() > dispo && pieceTrace) {
    const minTrace = Math.round(120 * m.k);
    const reduit = Math.max(
      minTrace,
      coteTrace - (empilee() - dispo) / (avecProfil ? 1.2 : 1),
    );
    coteTrace = Math.round(reduit);
    hProfil = avecProfil ? Math.round(coteTrace * 0.2) : 0;
    pieceTrace.hauteur = coteTrace + ecartProfil + hProfil;
  }
  const total_h = empilee();
  // Jamais au-dessus de la zone utile : débordant, le bloc part vers le BAS,
  // où le pied est éteint — pas vers le haut, où la marque vit.
  let y = Math.max(hautZone, hautZone + (dispo - total_h) / 2);

  for (const [i, piece] of morceaux.entries()) {
    if (i > 0) y += ecartUtile;
    if (piece.type === "logo") {
      sansOmbre(ctx);
      const cy = y + rayon;
      zone(zones, "cloture", centreX - rayon, y, rayon * 2, rayon * 2);
      ctx.save();
      // LA MARQUE PORTE DÉJÀ SON ROND : le fichier source, c'est le pied DANS
      // un cercle. En tracer un second par-dessus faisait une cible. L'anneau
      // extérieur existe donc, mais éteint par défaut — il sert quand on veut
      // un halo, pas pour « entourer » quelque chose qui l'est déjà.
      if (carte.cercleVisible) {
        ctx.beginPath();
        ctx.arc(centreX, cy, rayon, 0, Math.PI * 2);
        ctx.strokeStyle = carte.couleurCercle || th.encre;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = Math.max(1, nombre(carte.epaisseurCercle, 4) * m.k);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (logo) {
        // Sans anneau extérieur, le pied occupe tout le diamètre : c'est LUI le
        // cercle. Avec, il se range dedans.
        const cote = rayon * (carte.cercleVisible ? 1.16 : 2);
        ctx.globalAlpha = 0.94;
        ctx.drawImage(logo, centreX - cote / 2, cy - cote / 2, cote, cote);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (piece.type === "surtitre") {
      poserOmbre(ctx, ombre, "surtitre");
      // Le surtitre de la clôture suit les MÊMES réglages que partout ailleurs
      // — son filet compris : c'est `surtitre()` qui aligne le bloc entier
      // (filet + capitales), donc centré il ne pend plus à gauche.
      ctx.fillStyle = th.accent;
      surtitre(
        ctx,
        m,
        th,
        policeDe(carte, "policeSurtitre", polices),
        carte.surtitre,
        m.pad,
        y + m.surtitre,
        {
          align,
          polices,
          largeur,
          filet: carte.surtitreFilet !== false,
          plaque: plaqueDe(carte, th, "surtitre"),
        },
      );
      zoneTexte(zones, "surtitre", m, m.pad, largeur, y, y + piece.hauteur);
    } else if (piece.type === "titre") {
      poserOmbre(ctx, ombre, "titre");
      const bas = poserLignes(
        ctx,
        lignesTitre,
        m.pad,
        y + bt.taille * 0.7,
        bt,
        { align, largeur },
      );
      filetSousTitre(ctx, m, th, carte, bas, { align, x: m.pad, largeur });
      zoneTexte(zones, "titre", m, m.pad, largeur, y, y + piece.hauteur);
    } else if (piece.type === "texte") {
      poserOmbre(ctx, ombre, "corps");
      poserBlocs(ctx, blocsTexte, m.pad, y, bc, {
        align,
        largeur,
        puce: carte.puce,
      });
      zoneTexte(zones, "texte", m, m.pad, largeur, y, y + piece.hauteur);
    } else if (piece.type === "trace") {
      sansOmbre(ctx);
      const xTrace = Math.round(centreX - coteTrace / 2);
      dessinerCarteCase(
        ctx,
        { x: xTrace, y, width: coteTrace, height: coteTrace },
        th,
        { coords: cadre.coords, journees },
      );
      if (avecProfil) {
        dessinerProfilCase(
          ctx,
          {
            x: xTrace,
            y: y + coteTrace + ecartProfil,
            width: coteTrace,
            height: hProfil,
          },
          th,
          { profil: cadre.profil, totalKm: cadre.totalKm, journees },
        );
      }
      zone(zones, "carte", xTrace, y, coteTrace, piece.hauteur);
    } else if (piece.type === "encart") {
      dessinerEncart(
        ctx,
        m,
        th,
        polices,
        carte,
        {
          x: Math.round(centreX - largeurEncart / 2),
          y,
          width: largeurEncart,
          height: piece.hauteur,
        },
        { ombre, zones },
      );
    }
    y += piece.hauteur;
  }

  /* NI EN-TÊTE NI PIED, sauf si on les redemande.
     C'est la seule planche où les deux bandes n'ont rien à dire : la marque est
     déjà au centre, en grand, et « 12 / 12 » compte des pages devant quelqu'un
     qui vient d'arriver au bout. Une clôture en pleine photo les veut d'autant
     moins. Les deux cases les rallument — le reste des gabarits ne change pas,
     eux les portent toujours. */
  if (carte.enteteVisible === true) {
    poserOmbre(ctx, ombre, "entete");
    bandeEntete(ctx, format, m, th, police, {
      texte: carte.entete,
      accent: carte.enteteAccent,
      logo,
      marque: carte.marque ?? "rien", // la marque est déjà au centre, en grand
      filet: carte.filetEntete === true,
      opacite: carte.enteteOpacite,
      zones,
    });
  }
  if (carte.piedVisible === true) {
    poserOmbre(ctx, ombre, "pied");
    bandePied(ctx, format, m, th, police, {
      index,
      total,
      centre: carte.piedCentre,
      droite: carte.piedDroite,
      fleche: carte.piedFleche ?? "jamais", // c'est la fin : plus rien à glisser
      numero: carte.piedNumero !== false,
      filet: carte.filetPied === true,
      opacite: carte.piedOpacite,
      zones,
    });
  }
  sansOmbre(ctx);
  return [];
}

/* ------------------------------------------------------------- les journées */

/**
 * LE PROFIL D'UNE CASE : la silhouette entière en filet, la journée remplie.
 *
 * Ce n'est pas `dessinerProfil` en petit. Celui-là raconte UNE course découpée
 * en journées ; celui-ci raconte UNE journée SITUÉE dans la course. La même
 * silhouette revient donc dans les quatre cases, et seule la portion colorée se
 * déplace — c'est ce déplacement qui fait lire la progression, bien mieux que
 * quatre profils recadrés qui se ressembleraient tous.
 */
function dessinerProfilCase(
  ctx,
  boite,
  th,
  { profil, totalKm, journees, silhouette = true },
) {
  const points = (profil ?? []).filter(
    (p) => Number.isFinite(p?.km) && Number.isFinite(p?.alt),
  );
  if (points.length < 2) return;
  const total = totalKm > 0 ? totalKm : points[points.length - 1].km;
  if (!(total > 0)) return;

  const alts = points.map((p) => p.alt);
  const min = Math.min(...alts);
  const amplitude = Math.max(1, Math.max(...alts) - min);
  const X = (km) =>
    boite.x + (Math.max(0, Math.min(total, km)) / total) * boite.width;
  const Y = (alt) => boite.y + (1 - (alt - min) / amplitude) * boite.height;
  const base = boite.y + boite.height;

  if (silhouette) {
    ctx.beginPath();
    ctx.moveTo(X(points[0].km), Y(points[0].alt));
    for (const p of points) ctx.lineTo(X(p.km), Y(p.alt));
    ctx.strokeStyle = th.profilRestant;
    ctx.lineWidth = Math.max(1, boite.height * 0.022);
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // UNE aire par journée montrée : la grille n'en passe qu'une, l'étape en passe
  // autant qu'elle en a parcourues. Chacune garde SA couleur — c'est ce qui fait
  // lire une progression au lieu d'un bloc d'un seul tenant.
  for (const { kmDebut, kmFin, couleur } of journees ?? []) {
    const dedans = points.filter((p) => p.km >= kmDebut && p.km <= kmFin);
    if (dedans.length < 2) continue;
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
    ctx.lineWidth = Math.max(2, boite.height * 0.038);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* --------------------------------------------------- les pièces détachées */

/**
 * LES PIÈCES DÉTACHÉES — la trace et son altimétrie, seules, sur fond
 * transparent.
 *
 * Une planche du studio est un TOUT : elle compose la photo, le titre, les
 * chiffres et la trace d'un seul geste, et c'est ce qui en fait la valeur. Mais
 * une slide se monte parfois ailleurs — Canva, une story bricolée au pouce — et
 * il faut alors la trace SEULE, en PNG transparent, à poser sur autre chose.
 * Sans ça il ne restait qu'à découper une capture d'écran, ce qui rend un carré
 * de fond avec.
 *
 * L'ALTIMÉTRIE VIENT TOUJOURS AVEC : les deux se lisent ensemble — où l'on est
 * passé, et ce que ça montait — et les séparer obligerait à les réaligner à la
 * main dans l'outil de montage. Elles partagent donc la largeur et le cadrage,
 * exactement comme dans une case de journée.
 *
 * @param {Array} o.journees - les journées à colorer. Une seule, et c'est « le
 *   bout de la trace » ; toutes, et c'est le tour entier.
 * @param {boolean} o.silhouette - la boucle entière en sourdine derrière.
 * @returns {number} la hauteur réellement dessinée — le profil peut manquer.
 */
export function dessinerPieceTrace(
  ctx,
  boite,
  th,
  { coords, profil, totalKm, journees, silhouette = true, partProfil = 0.24 },
) {
  const avecProfil =
    partProfil > 0.01 && (profil ?? []).filter((p) => p?.km != null).length > 1;
  const ecart = avecProfil ? Math.round(boite.width * 0.04) : 0;
  const hProfil = avecProfil ? Math.round(boite.width * partProfil) : 0;
  const cote = Math.max(0, boite.height - ecart - hProfil);
  const vue = silhouette
    ? { coords, profil, totalKm, journees }
    : fenetreDesJournees({ coords, profil, totalKm, journees });

  dessinerCarteCase(
    ctx,
    { x: boite.x, y: boite.y, width: boite.width, height: cote },
    th,
    { coords: vue.coords, journees: vue.journees, silhouette },
  );
  if (avecProfil) {
    dessinerProfilCase(
      ctx,
      {
        x: boite.x,
        y: boite.y + cote + ecart,
        width: boite.width,
        height: hProfil,
      },
      th,
      {
        profil: vue.profil,
        totalKm: vue.totalKm,
        journees: vue.journees,
        silhouette,
      },
    );
  }
  return cote + ecart + hProfil;
}

/**
 * LA MÊME PIÈCE, CADRÉE SUR LE SEUL BOUT MONTRÉ.
 *
 * Éteindre la silhouette laissait la portion là où elle est dans le tour : un
 * petit trait dans un grand carré vide, puisque le cadrage venait de la trace
 * ENTIÈRE. C'est le bon rendu tant qu'on garde la boucle derrière — les deux
 * pièces se superposent alors au pixel dans l'outil de montage — mais sans
 * elle, plus rien ne justifie le vide.
 *
 * La règle tient donc en une phrase : on cadre sur ce qu'on MONTRE. Le profil
 * suit, rebasé sur le début de la fenêtre, sinon il s'étalerait encore sur les
 * kilomètres qu'on vient de retirer.
 */
function fenetreDesJournees({ coords, profil, totalKm, journees }) {
  const montrees = (journees ?? []).filter((j) => j?.seg?.coords?.length > 1);
  if (montrees.length === 0) return { coords, profil, totalKm, journees };

  const debut = Math.min(...montrees.map((j) => j.kmDebut ?? 0));
  const fin = Math.max(...montrees.map((j) => j.kmFin ?? 0));
  const etendue = fin - debut;
  return {
    coords: montrees.flatMap((j) => j.seg.coords),
    profil:
      etendue > 0
        ? (profil ?? [])
            .filter((p) => p?.km >= debut && p?.km <= fin)
            .map((p) => ({ ...p, km: p.km - debut }))
        : profil,
    totalKm: etendue > 0 ? etendue : totalKm,
    journees:
      etendue > 0
        ? montrees.map((j) => ({
            ...j,
            kmDebut: (j.kmDebut ?? 0) - debut,
            kmFin: (j.kmFin ?? 0) - debut,
          }))
        : montrees,
  };
}

/** La hauteur d'une pièce « trace + altimétrie » pour une largeur donnée : la
 *  carte est CARRÉE, le profil se pose dessous. Mesure et dessin lisent la même
 *  règle, sinon la pièce exportée porterait une bande transparente en trop. */
export function hauteurPieceTrace(
  largeur,
  { partProfil = 0.24, avecProfil = true } = {},
) {
  if (!avecProfil || partProfil <= 0.01) return largeur;
  return Math.round(largeur * (1 + 0.04 + partProfil));
}

/** La vignette d'itinéraire : la boucle entière en sourdine, les journées
 *  montrées par-dessus, chacune à sa couleur. Le cadrage vient de la trace
 *  COMPLÈTE, donc la boucle occupe exactement la même place d'une planche (ou
 *  d'une case) à l'autre — c'est ce qui fait tenir une série. */
function dessinerCarteCase(
  ctx,
  boite,
  th,
  { coords, journees, silhouette = true },
) {
  const marge = Math.round(Math.min(boite.width, boite.height) * 0.08);
  const vue = fitView(coords, {
    width: boite.width,
    height: boite.height,
    fit: {
      x: marge,
      y: marge,
      width: boite.width - marge * 2,
      height: boite.height - marge * 2,
    },
  });
  if (!vue) return;
  const projeter = ([lon, lat]) => {
    const [x, y] = vue.project([lon, lat]);
    return [boite.x + x, boite.y + y];
  };
  const epaisseur = Math.max(1.5, boite.width * 0.022);
  // LA BOUCLE ENTIÈRE, en sourdine, derrière la portion en couleur : c'est elle
  // qui SITUE la journée. On peut l'éteindre — une pièce détachée destinée à un
  // montage n'a pas toujours à porter le tour complet.
  if (silhouette) {
    polyligne(
      ctx,
      decimerPixels(coords.map(projeter)),
      th.cle === "clair"
        ? "rgba(34, 36, 30, 0.24)"
        : "rgba(254, 251, 246, 0.22)",
      epaisseur * 0.7,
      false,
    );
  }
  for (const { seg, couleur } of journees ?? []) {
    if (!(seg?.coords?.length > 1)) continue;
    polyligne(
      ctx,
      decimerPixels(seg.coords.map(projeter)),
      couleur,
      epaisseur,
      true,
    );
  }
}

/** Le texte d'une case, quand personne ne l'a écrit. On part de ce que la
 *  journée sait déjà d'elle-même — le reste (« × Rapace ») s'ajoute à la main. */
/**
 * LA LIGNE DE CHIFFRES D'UNE SEULE JOURNÉE — sa distance, son dénivelé à elle.
 *
 * `ligneFactuelle` dit ce que la trace ENTIÈRE pèse ; sur une planche « Jour 3 »
 * c'est le mauvais chiffre : elle annonce l'aventure, pas l'étape. Mise en gras,
 * parce qu'elle porte alors le contenu, et non une mention de bas de titre.
 */
export function ligneDeJournee(seg) {
  if (!seg) return null;
  const bouts = [
    seg.distanceKm > 0 ? `*${formatKm(seg.distanceKm)} km*` : "",
    seg.dPlusM > 0 ? `*${formatEntier(seg.dPlusM)} m D+*` : "",
  ];
  return bouts.filter(Boolean).join("   ·   ") || null;
}

/**
 * CE QU'ON MET DANS LA COLONNE D'UNE ÉTAPE, pour ne pas partir d'une page
 * blanche : les trois chiffres que la trace connaît, en DONNÉES
 * (`libellé = valeur`), et un quatrième sans valeur — la masse portée ne se
 * déduit d'aucun fichier, et l'oublier serait pire que de la laisser en
 * attente. Sa ligne s'affiche, libellé seul, jusqu'à ce qu'on la remplisse.
 *
 * C'est un point de départ, pas un gabarit : c'est du TEXTE, on y change les
 * libellés, on en ajoute, on en retire, on y mêle une liste ou une phrase, et
 * tout le balisage y marche (couleurs, polices au mot, corps par ligne).
 */
export function colonneDeJournee(seg) {
  return [
    `Distance = ${seg?.distanceKm > 0 ? `${formatKm(seg.distanceKm)} km` : ""}`,
    `Dénivelé positif = ${seg?.dPlusM > 0 ? `${formatEntier(seg.dPlusM)} m` : ""}`,
    `Dénivelé négatif = ${seg?.dMinusM > 0 ? `${formatEntier(seg.dMinusM)} m` : ""}`,
    "Masse moyenne portée = ",
  ].join("\n");
}

export function texteDeJournee(i, seg) {
  const titre = `*Jour ${i + 1}*`;
  if (!seg) return titre;
  return `${titre}\n${formatKm(seg.distanceKm)} km · ${formatEntier(seg.dPlusM)} m D+`;
}

/** Les cases EFFECTIVES : celles de la planche, complétées par les journées
 *  de la trace. Une trace chargée après coup remplit ainsi la grille toute
 *  seule, au lieu de laisser quatre cases vides. */
export function casesEffectives(carte, segments) {
  const voulues = Math.max(
    1,
    Math.round(nombre(carte?.casesN, segments.length || 4)),
  );
  const ecrites = Array.isArray(carte?.cases) ? carte.cases : [];
  const out = [];
  for (let i = 0; i < voulues; i += 1) {
    const c = ecrites[i] ?? {};
    const jour = Number.isInteger(c.jour) ? c.jour : i;
    out.push({
      jour,
      texte:
        typeof c.texte === "string" && c.texte !== ""
          ? c.texte
          : texteDeJournee(i, segments[jour]),
    });
  }
  return out;
}

/**
 * LES JOURNÉES — la planche qui raconte une aventure en une seule image.
 *
 * L'espace utile se découpe en N cases (une par jour, mais rien n'y oblige), et
 * chaque case porte trois choses : où l'on était, le relief qu'on a pris, et ce
 * qu'on en dit. La boucle entière et la silhouette entière reviennent dans
 * CHAQUE case, en sourdine, avec la seule journée en couleur — c'est ce qui
 * fait qu'on lit une progression et non quatre images sans rapport.
 */
function dessinerJournees(ctx, format, o) {
  const {
    carte,
    trace,
    police,
    polices,
    logo,
    m,
    th,
    ombre,
    zones,
    index,
    total,
  } = o;
  const segments = o.segments ?? [];
  const cadre = o.traceCadre ?? trace;
  const couleurs = couleursDesJours(carte, segments);
  const cases = casesEffectives(carte, segments);

  poserOmbre(ctx, ombre, "entete");
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    filet: carte.filetEntete !== false,
    opacite: carte.enteteOpacite,
    zones,
  });

  const align = alignementDe(carte);
  const largeurTexte = format.width - m.pad * 2;
  let yHaut = m.bandeH + Math.round(60 * m.k);
  const poserSurtitre = (premier) => {
    poserOmbre(ctx, ombre, "surtitre");
    ctx.fillStyle = th.accent;
    const base = premier ? yHaut : yHaut + m.surtitre;
    const { dernier, sup } = surtitre(
      ctx,
      m,
      th,
      policeDe(carte, "policeSurtitre", polices),
      carte.surtitre,
      m.pad,
      base,
      {
        align,
        polices,
        filet: carte.surtitreFilet !== false,
        plaque: plaqueDe(carte, th, "surtitre"),
        largeur: largeurTexte,
      },
    );
    zoneTexte(
      zones,
      "surtitre",
      m,
      m.pad,
      largeurTexte,
      base - m.surtitre,
      dernier + m.surtitre * 0.3,
    );
    yHaut = base + sup + m.surtitre * 1.4;
  };
  const poserTitre = () => {
    // Le titre d'une grille est plus court que celui d'une planche de texte :
    // il annonce, il ne porte pas. D'où l'échelle — sinon deux lignes de 65 px
    // mangeaient une case entière.
    poserOmbre(ctx, ombre, "titre");
    const haut = yHaut;
    const bt = baseTitre(m, th, polices, carte, 0.72);
    const ls = lignesRiches(ctx, analyserRiche(carte.titre), largeurTexte, bt);
    const bas = poserLignes(ctx, ls, m.pad, yHaut + bt.taille * 0.86, bt, {
      align,
      largeur: largeurTexte,
    });
    yHaut =
      filetSousTitre(ctx, m, th, carte, bas, {
        align,
        x: m.pad,
        largeur: largeurTexte,
      }) + Math.round(34 * m.k);
    zoneTexte(zones, "titre", m, m.pad, largeurTexte, haut, yHaut);
  };
  for (const [i, quoi] of ordreDuTitre(carte).entries()) {
    if (quoi === "surtitre" && carte.surtitre) poserSurtitre(i === 0);
    if (quoi === "titre" && carte.titre) poserTitre();
  }

  const yBas = m.piedFilet - Math.round(30 * m.k);
  const colonnes = Math.min(
    2,
    Math.max(1, Math.round(nombre(carte.casesColonnes, 1))),
  );
  const rangees = Math.ceil(cases.length / colonnes);
  const gouttiereX = Math.round(34 * m.k);
  const gouttiereY = Math.round(22 * m.k);
  const caseW = (largeurTexte - (colonnes - 1) * gouttiereX) / colonnes;
  const caseH = (yBas - yHaut - (rangees - 1) * gouttiereY) / rangees;
  if (!(caseH > 0)) {
    sansOmbre(ctx);
    return [];
  }

  const bc = baseCorps(m, th, polices, carte);
  // Une légende de case n'est pas un texte suivi : chaque ligne tapée reste une
  // ligne (« Jour 1 × Rapace » puis « 57 km · 4 700 m D+ »).
  const bcCase = {
    ...bc,
    taille: Math.round(nombre(carte.tailleCase, 30) * m.k),
    lignesDures: carte.caseLignesDures !== false,
  };

  cases.forEach((c, i) => {
    const col = i % colonnes;
    const rang = Math.floor(i / colonnes);
    const x = m.pad + col * (caseW + gouttiereX);
    const y = yHaut + rang * (caseH + gouttiereY);
    const couleur = couleurs[c.jour] ?? th.accent;
    const seg = segments[c.jour] ?? null;
    zone(zones, "case", x, y, caseW, caseH, { index: i });

    // Le filet de séparation, au-dessus de chaque rangée sauf la première :
    // c'est lui qui fait une GRILLE et non quatre blocs posés au hasard.
    if (carte.caseFilet !== false && rang > 0 && col === 0) {
      sansOmbre(ctx);
      ctx.fillStyle = th.filet;
      ctx.fillRect(
        m.pad,
        y - gouttiereY / 2,
        largeurTexte,
        Math.max(1, 1.5 * m.k),
      );
    }

    const avecCarte = carte.caseCarte !== false && cadre?.coords?.length > 1;
    const cote = avecCarte ? Math.min(caseH, caseW * 0.34) : 0;
    if (avecCarte) {
      sansOmbre(ctx);
      dessinerCarteCase(
        ctx,
        { x, y: y + (caseH - cote) / 2, width: cote, height: cote },
        th,
        { coords: cadre.coords, journees: seg ? [{ seg, couleur }] : [] },
      );
    }

    const xTexte = x + (avecCarte ? cote + Math.round(26 * m.k) : 0);
    const wTexte = caseW - (avecCarte ? cote + Math.round(26 * m.k) : 0);

    const avecProfil =
      carte.caseProfil !== false && cadre?.profil?.length > 1 && seg;
    const hProfil = avecProfil
      ? Math.min(caseH * 0.42, Math.round(96 * m.k))
      : 0;

    poserOmbre(ctx, ombre, "corps");
    const blocs = blocsDeTexte(ctx, c.texte, wTexte, bcCase);
    const hTexte = hauteurBlocs(blocs, bcCase);
    // Texte et profil se partagent la case : le texte se cale en haut de ce qui
    // reste, le profil garde toujours sa place en bas.
    const dispo = caseH - hProfil;
    poserBlocs(
      ctx,
      blocs,
      xTexte,
      y + Math.max(0, (dispo - hTexte) / 2),
      bcCase,
      {
        align,
        largeur: wTexte,
        puce: carte.puce,
      },
    );

    if (avecProfil) {
      sansOmbre(ctx);
      dessinerProfilCase(
        ctx,
        { x: xTexte, y: y + caseH - hProfil, width: wTexte, height: hProfil },
        th,
        {
          profil: cadre.profil,
          totalKm: cadre.totalKm,
          journees: [{ kmDebut: seg.kmDebut, kmFin: seg.kmFin, couleur }],
        },
      );
    }
  });

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
  return [];
}

/* ------------------------------------------------------- les zones libres */

/**
 * LES ZONES LIBRES — du texte posé OÙ ON VEUT, à la souris.
 *
 * C'est l'échappatoire assumée des gabarits : tout le reste de l'atelier
 * remplit une mise en page qui tient, et c'est ce qui fait que deux carrousels
 * publiés à six mois d'écart se ressemblent. Mais une photo a parfois UN
 * endroit, et un seul, où le texte doit aller — un creux de rocher, un bout de
 * ciel. Aucune grille ne peut le deviner.
 *
 * La position est RELATIVE au format (0 à 1) : la même zone tombe au même
 * endroit qu'on exporte en carrousel, en story ou en carré.
 *
 * Elles sont dessinées EN DERNIER, par-dessus tout le reste — sinon elles ne
 * serviraient à rien sur les gabarits qui posent une image après leur texte.
 */
function dessinerLibres(ctx, format, o) {
  const { carte, polices, m, th, ombre, zones, boites } = o;
  const libres = Array.isArray(carte.libres) ? carte.libres : [];
  for (const [i, z] of libres.entries()) {
    if (!z || z.masquee) continue;
    const largeur = Math.max(
      60,
      (nombre(z.largeur, 0.62) || 0.62) * format.width,
    );
    const x = (Number.isFinite(z.x) ? z.x : 0.1) * format.width;
    const y = (Number.isFinite(z.y) ? z.y : 0.5) * format.height;
    const base = {
      ...baseCorps(m, th, polices, carte),
      taille: Math.round(nombre(z.taille, CORPS.corps) * m.k),
      graisse: z.gras ? 700 : 400,
      couleur: z.couleur || th.encre,
      plaque: z.plaque
        ? plaqueDe({ ...carte, plaque: true, plaque_corps: true }, th, "corps")
        : null,
    };
    poserOmbre(ctx, ombre, "corps");
    const blocs = blocsDeTexte(ctx, z.texte ?? "", largeur, base);
    const hauteur = Math.max(base.taille, hauteurBlocs(blocs, base));
    poserBlocs(ctx, blocs, x, y, base, {
      align: z.align ?? "gauche",
      largeur,
      puce: carte.puce,
    });
    // La boîte sert au glisser-déposer ; la zone, au clic qui ouvre le réglage.
    boites?.push({
      type: "libre",
      index: i,
      x,
      y,
      width: largeur,
      height: hauteur,
    });
    zone(zones, "libre", x, y, largeur, hauteur, { index: i });
  }
  sansOmbre(ctx);
}

/* --------------------------------------------------------------- l'étape */

/**
 * LE TABLEAU DE CHIFFRES D'UNE ÉTAPE — le libellé en petites capitales, la
 * valeur en gros dessous, en colonnes.
 *
 * Il porte les MÊMES données que la fiche (`carte.fiche`) : un libellé, une
 * valeur, un accent. Seule la mise en page change — la fiche empile des lignes
 * pleine largeur, l'étape range en colonnes pour tenir sous une carte. Une
 * seconde structure de données n'aurait rien apporté qu'un second éditeur.
 *
 * Rend le HAUT du bloc : l'appelant compose du bas vers le haut.
 */
/**
 * LA COLONNE DE L'ÉTAPE — à côté de la trace, du texte et rien d'autre.
 *
 * C'était un tableau de libellés et de valeurs. Il rangeait bien, et c'est le
 * problème : chaque ligne coûtait deux corps de haut (le libellé puis la
 * valeur) pour dire trois mots, et une planche d'étape n'a pas cette hauteur à
 * donner. Une zone de texte tient les mêmes chiffres en deux fois moins de
 * place, et surtout elle prend TOUT le balisage — listes, puces, gras, ambre,
 * couleurs nommées, polices au mot, icônes, corps par ligne. On écrit ce qu'on
 * veut dire au lieu de remplir des cases.
 *
 * Rend la hauteur occupée.
 */
function baseDeColonne(m, th, polices, carte) {
  // Plus petit que le récit par défaut : la colonne est une marge de carnet,
  // pas un second paragraphe. `tailleColonne` la reprend en main.
  const nominale = m.corps * 0.8;
  const taille = Math.round(portee(carte.tailleColonne, nominale, m));
  /**
   * UN SEUL CURSEUR POUR TOUTE LA COLONNE.
   *
   * Les données (`Distance = 57,5 km`) empruntaient les corps de la fiche, qui
   * n'a pas de réglage sur une étape : régler « Colonne » ne bougeait donc que
   * le texte libre, et les chiffres — qui sont l'essentiel de ce qu'on y écrit
   * — ne bougeaient pas d'un pixel. Ils suivent maintenant la MÊME échelle, si
   * bien que le curseur redimensionne le bloc entier sans en casser les
   * proportions : libellé atténué en petites capitales, valeur en gros à
   * l'encre pleine.
   */
  const echelle = taille / nominale;
  return {
    ...baseCorps(m, th, polices, carte),
    taille,
    tailleLabel: Math.max(6, Math.round(m.ficheLabel * echelle)),
    tailleValeur: Math.max(8, Math.round(m.ficheValeur * echelle)),
    couleurLabel: th.encreFaible,
    couleurValeur: th.encre,
  };
}

function colonneDeTexte(ctx, m, th, polices, carte, boite, { ombre, zones }) {
  const texte = carte.colonne ?? "";
  if (!texte.trim()) return 0;
  const base = baseDeColonne(m, th, polices, carte);
  const blocs = blocsDeTexte(ctx, texte, boite.width, base);
  // LE BLOC se centre dans sa moitié, PAS ses lignes : les libellés et les
  // valeurs restent alignés entre eux — les centrer chacun ferait un escalier —
  // mais l'ensemble se pose au milieu de la place qu'on lui a donnée, au lieu
  // de se coller contre la trace.
  const naturelle = Math.min(boite.width, largeurBlocs(ctx, blocs, base));
  const x = boite.x + Math.round((boite.width - naturelle) / 2);
  poserOmbre(ctx, ombre, "corps");
  poserBlocs(ctx, blocs, x, boite.y, base, {
    align: alignementDe(carte),
    largeur: naturelle,
    puce: carte.puce,
  });
  sansOmbre(ctx);
  const hauteur = hauteurBlocs(blocs, base);
  zone(
    zones,
    "colonne",
    boite.x,
    boite.y - base.taille,
    boite.width,
    hauteur + base.taille,
  );
  return hauteur;
}

/**
 * L'ÉTAPE — le compte rendu d'une journée, à la façon d'une note de labo.
 *
 * La bande de marque et le filet en haut, le filet et la flèche en bas ; entre
 * les deux, dans l'ordre où on lit : une photo qui se dissout dans le papier, le
 * jour et ce qu'on en dit, la portion de trace parcourue, ses chiffres.
 *
 * La différence avec le gabarit Carte est le point de vue. « Carte » annonce un
 * ITINÉRAIRE : la trace occupe la planche, le texte se pose dessus. « Étape »
 * raconte une JOURNÉE : le récit passe devant, la trace devient une vignette qui
 * situe — et la série se lit comme un carnet, une page par jour.
 *
 * La carte honore `depuis`/`jusquA` comme le gabarit Carte : d'une étape à la
 * suivante, la portion déjà faite reste, chaque journée à SA couleur, et le
 * cadrage vient de la trace complète — la boucle ne bouge donc pas d'une page à
 * l'autre.
 *
 * Ce qui est ÉLASTIQUE, c'est la carte : la photo, le texte et les chiffres
 * prennent ce qu'il leur faut, elle occupe ce qui reste. C'est le seul ordre qui
 * tienne quand le texte fait deux lignes un jour et six le lendemain.
 */
function dessinerEtape(ctx, format, o) {
  const {
    carte,
    trace,
    police,
    polices,
    logo,
    m,
    th,
    ombre,
    zones,
    index,
    total,
  } = o;
  const cadre = o.traceCadre ?? trace;
  const montrees = journeesMontrees(carte, o.segments);
  const journees = montrees.map(({ jour, seg }) => ({
    seg,
    kmDebut: seg.kmDebut,
    kmFin: seg.kmFin,
    couleur: couleurDuJour(carte, jour),
  }));

  zoneDeRepli(zones, format, m, "texte");

  /* --- la photo ----------------------------------------------------------- */
  /* Elle commence SOUS le filet d'en-tête par défaut : un filet posé sur une
     image ne se lit plus comme un filet, et la bande de marque doit rester sur
     le papier. `photoRemontee` lève cette règle par degrés, jusqu'à faire
     toucher le bord haut de la planche — c'est l'autre façon de composer, celle
     où l'image passe devant et la marque se pose dessus.

     Le BAS ne bouge pas : la photo grandit vers le haut. Sans ça, remonter la
     photo aurait déplacé le titre, le récit et la trace d'un même geste, et il
     aurait fallu tout recaler derrière. */
  const departPhoto = m.bandeH + Math.round(16 * m.k);
  const hPhoto = Math.round(format.height * (carte.bandeauPart ?? 0.28));
  const remontee = Math.max(0, Math.min(1, nombre(carte.photoRemontee, 0)));
  const hautPhoto = Math.round(departPhoto * (1 - remontee));
  const hauteurPhoto = departPhoto + hPhoto - hautPhoto;
  /** La photo mord-elle sur la bande de marque ? */
  const sousLaMarque = Boolean(carte.image) && hautPhoto < m.bandeH;
  if (hauteurPhoto > 0) {
    photoFondue(ctx, format, m, th, carte, hautPhoto, hauteurPhoto);
    zone(zones, "photo", 0, hautPhoto, format.width, hauteurPhoto);
  }

  poserOmbre(ctx, ombre, "entete");
  if (sousLaMarque) {
    // Le voile de l'en-tête : le même que celui du bandeau. Sans lui, le nom du
    // labo disparaît dans un ciel clair — et on ne s'en aperçoit qu'une fois la
    // planche publiée.
    sansOmbre(ctx);
    voileEntete(
      ctx,
      format,
      m,
      th,
      intensite(carte.degradeHaut, 0.74),
      portee(carte.degradeHautH, m.bandeH * 1.4, m),
    );
    poserOmbre(ctx, ombre, "entete");
  }
  bandeEntete(ctx, format, m, th, police, {
    texte: carte.entete,
    accent: carte.enteteAccent,
    logo,
    marque: carte.marque,
    // Un filet tracé SUR la photo n'est plus un filet, c'est une rayure.
    filet: carte.filetEntete !== false && !sousLaMarque,
    opacite: carte.enteteOpacite,
    zones,
  });

  /* --- le jour, et ce qu'on en dit ---------------------------------------- */
  const largeur = format.width - m.pad * 2;
  const yTexte = departPhoto + hPhoto + Math.round(46 * m.k);
  const basTexte = blocTitreEtCorps(
    ctx,
    format,
    m,
    th,
    polices,
    carte,
    yTexte,
    largeur,
    {
      ombre,
      zones,
    },
  );

  /* --- LE BLOC DU BAS : la trace et ses chiffres -------------------------- */
  /* Ils sont CÔTE À CÔTE, et ce n'est pas un choix d'esthète. Empilés, sur une
     planche de 1350 qui porte déjà une photo, un titre et un récit, il restait
     à la carte 150 px de haut : une boucle des Écrins y devenait un trait. À
     côté, la carte redevient carrée et lisible, et le tableau tient debout dans
     la colonne de droite. `partCarte` règle le partage — à 0, la carte
     disparaît et les chiffres reprennent toute la largeur. */
  // L'air entre ce qui précède et le filet des données. Il se règle : selon que
  // la planche s'arrête au titre, au surtitre ou à un paragraphe, ce qui touche
  // le filet n'est pas la même chose et n'appelle pas le même écart.
  const hautBloc =
    basTexte + Math.round(m.corps * nombre(carte.avantDonnees, AVANT_DONNEES));
  const basBloc = m.piedFilet - Math.round(48 * m.k);
  const hBloc = Math.max(0, basBloc - hautBloc);

  /* DEUX MOITIÉS, et chacune tient son contenu AU MILIEU. La trace était calée
     contre la marge gauche et les chiffres commençaient au bord de son carré :
     comme la vignette laisse une marge autour de la boucle, les chiffres
     paraissaient collés à elle, et tout le bloc penchait à gauche. `partCarte`
     règle le partage — à 0,5 les deux moitiés sont égales, à 0 la trace
     disparaît et le texte reprend toute la largeur. */
  const part = Math.max(0, Math.min(0.7, nombre(carte.partCarte, 0.5)));
  const avecCarte =
    carte.caseCarte !== false && part > 0.02 && cadre?.coords?.length > 1;
  const avecProfil =
    avecCarte && carte.afficherProfil !== false && cadre?.profil?.length > 1;

  let boiteColonne = { x: m.pad, y: hautBloc, width: largeur };

  if (avecCarte) {
    const moitie = Math.round(largeur * part);
    const ecart = avecProfil ? Math.round(16 * m.k) : 0;
    const hProfil = avecProfil
      ? Math.round(Math.min(hBloc * 0.19, 84 * m.k))
      : 0;
    const cote = Math.max(0, Math.min(hBloc - hProfil - ecart, moitie));
    if (cote > 60 * m.k) {
      const xCarte = m.pad + Math.round((moitie - cote) / 2);
      sansOmbre(ctx);
      dessinerCarteCase(
        ctx,
        { x: xCarte, y: hautBloc, width: cote, height: cote },
        th,
        {
          coords: cadre.coords,
          journees,
        },
      );
      if (avecProfil) {
        dessinerProfilCase(
          ctx,
          {
            x: xCarte,
            y: hautBloc + cote + ecart,
            width: cote,
            height: hProfil,
          },
          th,
          { profil: cadre.profil, totalKm: cadre.totalKm, journees },
        );
      }
      zone(zones, "carte", m.pad, hautBloc, moitie, cote + ecart + hProfil);
      boiteColonne = {
        x: m.pad + moitie,
        y: hautBloc,
        width: largeur - moitie,
      };
    }
  }

  // Les deux colonnes partent de la même ligne — une note de labo s'aligne en
  // haut. Sans vignette, le texte reprend toute la largeur et se centre sur la
  // hauteur du bloc, sinon il flotterait tout en haut d'un grand vide.
  boiteColonne.y = hautBloc;
  if (!avecCarte) {
    const b = baseDeColonne(m, th, polices, carte);
    const h = hauteurBlocs(
      blocsDeTexte(ctx, carte.colonne ?? "", largeur, b),
      b,
    );
    boiteColonne.y = hautBloc + Math.max(0, Math.round((hBloc - h) / 2));
  }
  colonneDeTexte(ctx, m, th, polices, carte, boiteColonne, { ombre, zones });

  // Le filet qui ouvre le bloc de données : la troisième règle de la page, avec
  // celle de l'en-tête et celle du pied. C'est elle qui fait la note de labo —
  // et elle a SON réglage, comme les deux autres, plutôt que d'emprunter celui
  // des séparateurs de la grille des journées.
  if (carte.filetDonnees !== false && hBloc > 0) {
    sansOmbre(ctx);
    ctx.fillStyle = th.filet;
    ctx.fillRect(
      m.pad,
      hautBloc - Math.round(16 * m.k),
      largeur,
      Math.max(1, 1.5 * m.k),
    );
  }

  poserOmbre(ctx, ombre, "pied");
  bandePied(ctx, format, m, th, police, {
    index,
    total,
    centre: carte.piedCentre,
    droite: carte.piedDroite,
    fleche: carte.piedFleche,
    numero: carte.piedNumero !== false,
    filet: carte.filetPied !== false,
    opacite: carte.piedOpacite,
    zones,
  });
  sansOmbre(ctx);
  return [];
}

const RENDUS = {
  carte: dessinerCarte,
  etape: dessinerEtape,
  journees: dessinerJournees,
  bandeau: dessinerBandeau,
  photo: dessinerPhoto,
  texte: dessinerTexte,
  fiche: dessinerFiche,
  cloture: dessinerCloture,
};

/**
 * Dessine UNE planche du carrousel.
 *
 * @returns {{boites: Array, zones: Array}} — `boites` : les étiquettes
 *   déplaçables (vide pour les gabarits qui n'en ont pas) ; `zones` : où
 *   cliquer dans l'image pour ouvrir le réglage correspondant, de la plus
 *   ancienne à la plus récemment dessinée (donc à tester à l'envers).
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

  const zones = [];
  const boitesLibres = [];
  const rendu = RENDUS[options.carte?.gabarit] ?? dessinerTexte;
  const boites = rendu(ctx, format, {
    ...options,
    zones,
    police,
    polices,
    ombre: ombreDe(options.carte, m),
    m,
    th,
    segments: options.segments ?? [],
    index: options.index ?? 0,
    total: options.total ?? 1,
  });
  comblerLesBlancs(zones);
  // Les zones libres passent APRÈS : par-dessus le dessin, et au-dessus de
  // toutes les autres zones au moment du clic.
  dessinerLibres(ctx, format, {
    ...options,
    polices,
    ombre: ombreDe(options.carte, m),
    m,
    th,
    zones,
    boites: boitesLibres,
  });
  // `boites` : les étiquettes déplaçables (vide pour les gabarits qui n'en ont
  // pas). `zones` : où cliquer pour ouvrir quel réglage.
  return { boites: [...(boites ?? []), ...boitesLibres], zones };
}
