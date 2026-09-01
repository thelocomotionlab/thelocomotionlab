// components/outils/CarrouselAtelier.jsx
//
// L'ATELIER CARROUSEL : des planches → un lot d'images à publier.
//
// TOUT SE PASSE DANS LE NAVIGATEUR, comme l'habillage de photo : ni la trace ni
// les photos ne quittent l'appareil, il n'y a donc rien à stocker et rien à
// purger. C'est aussi ce qui permet d'ouvrir l'outil sur le téléphone, au
// bivouac, sans réseau — sauf pour le fond de carte, qui dégrade proprement.
//
// L'ESPACE DE TRAVAIL, emprunté à Canva : une barre en haut (le projet, le
// format, l'export), un rail d'onglets à gauche, le panneau du réglage choisi
// à côté, la planche au centre, et la bande des vignettes dessous. Rien ne
// défile SAUF le panneau — c'est tout l'intérêt : on ne règle plus à l'aveugle,
// et on ne cherche plus un réglage dans un accordéon replié. C'était le défaut
// des deux versions précédentes, et c'est ce qui a fait croire que le filet
// sous le titre « ne marchait pas » : il marchait, sa case était pliée.
//
// CE QUI RESTE DE CANVA S'ARRÊTE À L'ERGONOMIE. On ne pose pas n'importe quoi
// n'importe où : on remplit DES GABARITS. Tout est réglable À L'INTÉRIEUR de la
// mise en page — corps, polices, espacements, couleurs, dégradés, découpage,
// étiquettes — mais la mise en page, elle, tient. C'est ce qui fait que deux
// carrousels publiés à six mois d'écart se ressemblent encore.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CopyPlus,
  Download,
  FolderOpen,
  ImageUp,
  LayoutTemplate,
  Loader2,
  Map as MapIcon,
  Palette,
  Plus,
  RotateCcw,
  Route,
  Save,
  Trash2,
  Type,
  Upload,
} from "lucide-react";

import {
  ALIGNEMENTS,
  CORPS,
  DEGRADES_PLAQUE,
  FLECHES,
  FORMATS,
  GABARITS,
  MARQUES,
  PALETTE_JOURS,
  POLICES,
  TEXTES_OMBRABLES,
  TEXTES_PLAQUABLES,
  THEMES,
  casesEffectives,
  chargerFond,
  dessinerCartePartage,
  dureeCourte,
  colonneDeJournee,
  ligneDeJournee,
  ligneFactuelle,
  texteDeJournee,
  vueDeLaCarte,
} from "@/lib/carrouselCartes";
import {
  coupuresDepuisWaypoints,
  coupuresRegulieres,
  decouperTrace,
  etiquetteParDefaut,
  fusionnerTraces,
  traceDepuisGpx,
  traceDepuisTrackJson,
} from "@/lib/carrouselTrace";
import { AIDE_BALISAGE, ESPACEMENT, PUCES_SIMPLES } from "@/lib/carrouselTexte";
import { CLES_ICONES } from "@/lib/carrouselIcones";
import {
  chargerEnCours,
  chargerProjet,
  enregistrerEnCours,
  enregistrerProjet,
  exporterProjet,
  importerProjet,
  listerProjets,
  supprimerProjet,
} from "@/lib/carrouselProjet";
import { chargerImage } from "@/lib/imageFile";
import { chargerMarqueTeintee } from "@/lib/marque";
import { liveConfig } from "@/lib/liveConfig";
import CoqueAtelier from "@/components/outils/CoqueAtelier";
import {
  AIDE,
  BOUTON_DISCRET,
  BOUTON_PRINCIPAL,
  BOUTON_SECOND,
  CHAMP,
  Case,
  Choix,
  Couleur,
  Curseur,
  Groupe,
  ICONES_PALETTE,
  ICONES_PAR_CLE,
  LEGENDE,
  Nombre,
  Opacite,
  Puce,
  Taille,
  Zoom,
} from "@/components/outils/champsAtelier";

/**
 * LE RAIL — l'ordre dans lequel on compose une planche, pas un classement.
 *
 * On choisit un gabarit, on écrit, on met une photo, on découpe la trace, on
 * règle l'allure, on enregistre. Les composants d'icône sont résolus ICI, une
 * fois : les chercher pendant le rendu en referait un type à chaque passe.
 */
const ONGLETS = [
  { cle: "planche", label: "Planche", Icone: LayoutTemplate },
  { cle: "texte", label: "Texte", Icone: Type },
  { cle: "photo", label: "Photo", Icone: ImageUp },
  { cle: "trace", label: "Trace", Icone: Route },
  { cle: "style", label: "Allure", Icone: Palette },
  { cle: "projet", label: "Projet", Icone: FolderOpen },
];

/** Les gabarits qui portent une photo. */
const AVEC_PHOTO = ["photo", "bandeau", "cloture", "etape"];

/** Les gabarits qui montrent la trace — ceux dont les réglages de carte et de
 *  journées ont un sens. */
const AVEC_TRACE = ["carte", "etape"];

/** Les gabarits qui portent un tableau de libellés et de valeurs. */
const AVEC_FICHE = ["fiche"];

/** Pour chercher une icône sans se soucier des accents ni de la casse. */
const sansAccent = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * CLIQUER DANS L'IMAGE OUVRE LE RÉGLAGE.
 *
 * Le rendu déclare où il a posé chaque chose (cf. `zones` dans
 * lib/carrouselCartes.js) ; il ne reste qu'à dire, pour chaque zone, quel
 * onglet ouvrir et quel champ prendre le focus. C'est le geste de tous les
 * éditeurs, et c'est surtout ce qui évite de chercher dans quel panneau vit le
 * texte qu'on a sous les yeux.
 */
const ZONES = {
  entete: { onglet: "texte", champ: () => "entete" },
  surtitre: { onglet: "texte", champ: () => "surtitre" },
  titre: { onglet: "texte", champ: () => "titre" },
  texte: { onglet: "texte", champ: () => "texte" },
  factuelle: { onglet: "texte", champ: () => "ligne-chiffres" },
  libre: { onglet: "texte", champ: (z) => `libre-${z.index ?? 0}` },
  pied: { onglet: "texte", champ: () => "pied-centre" },
  fiche: { onglet: "texte", champ: () => "fiche-0" },
  colonne: { onglet: "texte", champ: () => "colonne" },
  case: { onglet: "texte", champ: (z) => `case-${z.index ?? 0}` },
  cloture: { onglet: "texte", champ: () => "cercle-taille" },
  photo: { onglet: "photo", champ: () => "ancrage" },
  carte: { onglet: "trace", champ: () => "nb-jours" },
};

/**
 * LES TROIS FAMILLES DE LA CHARTE, lues sur le document.
 *
 * Même lecture que l'habillage : la font-family RÉSOLUE, pas la variable
 * next/font (vide sur documentElement — le canvas partait alors en police
 * système sans que rien ne le signale). Les deux autres viennent des tokens
 * `--font-serif` / `--font-mono`, qui SONT la charte (packages/ui/theme.css) :
 * on ne redéclare aucune police ici.
 */
function policesDuSite() {
  if (typeof document === "undefined")
    return { sans: "sans-serif", serif: "serif", mono: "monospace" };
  const st = getComputedStyle(document.body);
  const token = (nom, secours) => st.getPropertyValue(nom).trim() || secours;
  return {
    sans: st.fontFamily || "sans-serif",
    serif: token("--font-serif", "Georgia, serif"),
    mono: token("--font-mono", "ui-monospace, monospace"),
  };
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation différée : Safari annule le téléchargement si l'URL meurt trop
  // tôt après le clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** La fiche d'une aventure, pré-remplie avec ce que la trace sait déjà. Les
 *  deux dernières lignes, l'atelier ne peut pas les deviner : elles sont là
 *  pour être remplies, pas pour être justes. */
function ficheParDefaut(trace, segments) {
  return [
    { label: "Distance", valeur: trace ? `${Math.round(trace.totalKm)} km` : "", accent: false },
    {
      label: "Dénivelé",
      valeur: trace ? `${trace.dPlusM.toLocaleString("fr-FR")} m` : "",
      accent: false,
    },
    {
      label: "Durée visée",
      valeur: segments?.length > 1 ? `${segments.length} jours` : "",
      accent: false,
    },
    { label: "Sac de départ", valeur: "", accent: false },
    { label: "Ravitaillement", valeur: "aucun", accent: true },
  ];
}

/**
 * `id` est fourni par l'appelant, JAMAIS tiré d'un compteur de module.
 *
 * Un compteur au niveau du module survit d'une requête à l'autre côté serveur :
 * le rendu SSR pouvait sortir « c7 » là où le client, module frais, sortait
 * « c1 ». Des `key` différentes, et React refusait d'hydrater l'arbre — avec un
 * message qui accusait le bouton « Avancer cette carte », très loin de la cause.
 */
function carteNeuve(gabarit, trace, segments, bilan = false, id = "c0", style = null) {
  return {
    id,
    gabarit,
    /* --- contenu --- */
    entete: "",
    enteteAccent: false,
    surtitre: gabarit === "carte" ? (trace?.vecue ? "La sortie" : "L'itinéraire") : "",
    titre: gabarit === "carte" ? (trace?.nom ?? liveConfig.aventure.nom) : "",
    texte: "",
    pied: null,
    piedCentre: "",
    piedDroite: "",
    /* --- mise en forme : vide = la valeur du thème / de la charte --- */
    tailleTitre: null,
    tailleCorps: null,
    tailleSurtitre: null,
    tailleEntete: null,
    taillePied: null,
    epaisseurFilet: null,
    tailleFicheLabel: null,
    tailleFicheValeur: null,
    tailleLogo: null,
    /** Les trois rôles de texte, et leur police (cf. POLICES). */
    policeTitre: "sans",
    policeSurtitre: "sans",
    policeCorps: "sans",
    /** Les espacements. `null` = la valeur de la charte (cf. ESPACEMENT). */
    interligneTitre: null,
    /** L'écart sous le titre, en corps de CE QUI SUIT (cf. blocTitreEtCorps).
     *  Serré d'office sur l'étape : sa page est dense, et 2,2 corps y ouvraient
     *  un trou entre le jour et sa ligne de repères. */
    apresTitre: gabarit === "etape" ? 1.2 : null,
    interligne: null,
    entreBlocs: null,
    respiration: null,
    entreItems: null,
    retraitListe: null,
    alinea: null,
    couleurTitre: "",
    couleurCorps: "",
    couleurAccent: "",
    couleurFond: "",
    enteteOpacite: 1,
    piedOpacite: 1,
    /** Ce que porte la bande d'en-tête : "" (logo + nom), sans-nom, sans-logo, rien. */
    marque: "",
    /** Vide = l'ambre du thème (cf. l'effet de teinture) : le logo est ambre
     *  par défaut, pas à l'encre du texte. */
    couleurLogo: "",
    /** auto | toujours | jamais. « toujours » par défaut : la flèche de swipe
     *  doit être là, y compris sur un carrousel encore à une seule planche. */
    piedFleche: gabarit === "cloture" ? "jamais" : "toujours",
    /** « 03 / 12 » en bas à gauche. Vrai par défaut — c'est la signature d'un
     *  carrousel. On l'éteint planche par planche quand le lot n'est pas une
     *  série : trois photos entre deux journées ne se numérotent pas. */
    piedNumero: true,
    /** gauche | centre | droite. La clôture est centrée d'office : c'est un
     *  bloc symétrique autour du logo. */
    alignement: gabarit === "cloture" ? "centre" : "gauche",
    /** Inverse l'ordre du surtitre et du titre. */
    titreDevant: false,
    /** Le filet ambre qui ouvre le surtitre. */
    surtitreFilet: true,
    /** LA PLAQUE : un aplat sous les lettres, ligne par ligne. L'autre façon de
     *  rendre un texte lisible sur une photo — sans assombrir toute l'image. */
    plaque: false,
    plaque_titre: true,
    plaque_surtitre: true,
    plaque_corps: true,
    plaqueCouleur: "",
    plaqueOpacite: 0.88,
    plaquePadX: 0.3,
    plaquePadY: 0.24,
    plaqueRayon: 0.18,
    /** aucun | droite | gauche | bords — l'aplat s'arrête net ou se dissout. */
    plaqueDegrade: "aucun",
    plaqueFondu: 0.4,
    /** Les zones de texte posées à la main sur la planche. */
    libres: [],
    /** Les filets sous l'en-tête et au-dessus du pied. */
    filetEntete: gabarit !== "cloture",
    filetPied: gabarit !== "cloture",
    /** LA TRANCHE DE JOURNÉES MONTRÉE (cf. `journeesMontrees`).
     *  `jusquA` : la dernière montrée — `null` = jusqu'au bout.
     *  `depuis`  : la première — `null` = depuis le départ. Les deux égales
     *  donnent la planche d'UNE journée, celle qu'on lit pour savoir où
     *  l'étape tombe dans le tour. */
    jusquA: null,
    depuis: null,
    /** La puce des listes : une forme tracée, ou une clé d'icône. */
    puce: "point",
    /** L'ombre portée des textes — ce qui rend un titre clair lisible sur une
     *  photo claire, sans repeindre la photo. */
    ombre: false,
    ombreFlou: 18,
    ombreDx: 0,
    ombreDy: 6,
    ombreOpacite: 0.5,
    ombreCouleur: "",
    /** …et sur QUOI elle porte, texte par texte (cf. TEXTES_OMBRABLES). */
    ombre_titre: true,
    ombre_surtitre: true,
    ombre_corps: true,
    ombre_entete: true,
    ombre_pied: true,
    /** Le filet court sous le titre — allumé d'office sur la fiche. */
    filetTitre: gabarit === "fiche",
    filetTitreLargeur: 96,
    filetTitreEpaisseur: 4,
    couleurFiletTitre: "",
    /* --- propres aux gabarits --- */
    etiquettes: [],
    afficherFond: true,
    afficherProfil: true,
    image: null,
    nomImage: "",
    ancrage: 0.5,
    /** `null` = l'intensité propre au gabarit (cf. `intensite`). */
    degradeHaut: null,
    degradeBas: null,
    /** …et la DISTANCE sur laquelle chacun s'éteint, en pixels de planche. */
    degradeHautH: null,
    degradeBasH: null,
    // L'étape garde une photo plus basse que le bandeau : sous elle il reste le
    // jour, son récit, la trace et ses chiffres — le bandeau, lui, n'a que du
    // texte à loger.
    bandeauPart: gabarit === "etape" ? 0.26 : 0.42,
    /** ÉTAPE — de combien la photo remonte vers le haut de la planche. 0 = sous
     *  le filet d'en-tête, 1 = jusqu'au bord. Elle grandit VERS LE HAUT : son
     *  bas ne bouge pas, donc le titre et la trace restent où ils sont. */
    photoRemontee: null,
    /** ÉTAPE — la part de largeur que prend la vignette d'itinéraire, les
     *  chiffres occupant le reste. `0` la retire et rend toute la largeur au
     *  tableau. `null` = 44 %, le partage qui laisse la boucle carrée. */
    partCarte: null,
    fiche: gabarit === "fiche" ? ficheParDefaut(trace, segments) : [],
    /** ÉTAPE — la colonne à côté de la trace. Du TEXTE, avec tout le balisage :
     *  c'est là qu'on écrit les chiffres du jour, ou tout autre chose. */
    colonne: "",
    tailleColonne: null,
    /* --- journées : l'espace découpé en cases --- */
    casesN: null,
    casesColonnes: 1,
    cases: [],
    tailleCase: 30,
    caseCarte: true,
    caseProfil: true,
    caseFilet: true,
    /* --- clôture --- */
    /** Ce qui passe AU-DESSUS du logo, pièce par pièce. */
    clotureHaut_surtitre: false,
    clotureHaut_titre: false,
    clotureHaut_texte: false,
    tailleCercle: 128,
    epaisseurCercle: 4,
    couleurCercle: "",
    voileCloture: 0.62,
    ...(gabarit === "cloture" ? clotureParDefaut(bilan) : null),
    // Le style de la planche courante EN DERNIER : on continue sur la même mise
    // en forme au lieu de repartir de la charte à chaque ajout.
    ...(style ?? null),
  };
}

/**
 * Le mot de la fin, pré-rempli selon ce que le carrousel raconte : avant le
 * départ on renvoie vers le direct, après on remercie. C'est du texte, il se
 * réécrit — mais partir d'une page blanche pour la dernière planche est
 * exactement le moment où on abandonne.
 */
function clotureParDefaut(bilan) {
  const commun = {
    // La marque est déjà au centre, en grand : la répéter en haut fait doublon.
    marque: "rien",
    cercleVisible: false,
  };
  return bilan
    ? {
        ...commun,
        surtitre: "c'est fini",
        titre: "Merci d'avoir suivi.",
        texte: "Le récit complet arrive sur le site.",
      }
    : {
        ...commun,
        surtitre: "à suivre en direct",
        titre: "Position, carnet de bord, messages.",
        texte: "thelocomotionlab.com/live",
      };
}

/**
 * Les réglages de FORME — ceux qu'une nouvelle planche hérite de celle qu'on
 * vient de régler, et que le bouton « appliquer à toutes » recopie.
 *
 * Le contenu (titre, texte, photo, étiquettes, fiche) n'en fait évidemment pas
 * partie : on hérite d'un LOOK, pas des mots de la planche précédente.
 */
export const CHAMPS_DE_STYLE = [
  "tailleTitre",
  "tailleCorps",
  "tailleSurtitre",
  "tailleEntete",
  "taillePied",
  "tailleLogo",
  "tailleFicheLabel",
  "tailleFicheValeur",
  "tailleColonne",
  "epaisseurFilet",
  "policeTitre",
  "policeSurtitre",
  "policeCorps",
  "interligneTitre",
  "apresTitre",
  "interligne",
  "entreBlocs",
  "respiration",
  "entreItems",
  "retraitListe",
  "alinea",
  "couleurTitre",
  "couleurCorps",
  "couleurAccent",
  "couleurFond",
  "couleurLogo",
  "enteteOpacite",
  "piedOpacite",
  "degradeHaut",
  "degradeBas",
  "marque",
  "enteteAccent",
  "piedFleche",
  "piedNumero",
  "filetEntete",
  "filetPied",
  "alignement",
  "titreDevant",
  "surtitreFilet",
  "puce",
  "filetTitre",
  "filetTitreLargeur",
  "filetTitreEpaisseur",
  "couleurFiletTitre",
  "degradeHautH",
  "degradeBasH",
  "ombre",
  "ombreFlou",
  "ombreDx",
  "ombreDy",
  "ombreOpacite",
  "ombreCouleur",
  "ombre_titre",
  "ombre_surtitre",
  "ombre_corps",
  "ombre_entete",
  "ombre_pied",
  "plaque",
  "plaque_titre",
  "plaque_surtitre",
  "plaque_corps",
  "plaqueCouleur",
  "plaqueOpacite",
  "plaquePadX",
  "plaquePadY",
  "plaqueRayon",
  "plaqueDegrade",
  "plaqueFondu",
  "tailleCase",
  "casesColonnes",
  "caseCarte",
  "partCarte",
  "photoRemontee",
  "caseProfil",
  "caseFilet",
];

function styleDe(carte) {
  if (!carte) return null;
  return Object.fromEntries(CHAMPS_DE_STYLE.filter((c) => c in carte).map((c) => [c, carte[c]]));
}

/**
 * Ce qui passe au-dessus du logo sur une clôture.
 *
 * `clotureHaut` était un menu à quatre entrées ; il est remplacé par trois
 * cases (le texte s'y ajoute, et huit combinaisons ne se nomment pas). Les
 * projets enregistrés portent encore l'ancien réglage : on le lit en secours.
 */
function estAuDessusDuLogo(carte, quoi) {
  const choisi = carte?.[`clotureHaut_${quoi}`];
  if (typeof choisi === "boolean") return choisi;
  const ancien = carte?.clotureHaut ?? "non";
  return quoi !== "texte" && (ancien === quoi || ancien === "les-deux");
}

/** Une planche sur laquelle personne n'a encore rien écrit — on peut la
 *  remplacer sans rien perdre quand une trace arrive. */
function estVierge(c) {
  return !c.titre && !c.texte && !c.entete && !c.surtitre && !c.image && !c.fiche?.length;
}

/**
 * LA VIGNETTE d'une planche : la planche elle-même, en petit.
 *
 * Le même dessin, à l'échelle — pas une approximation en HTML. Toutes les
 * coordonnées du rendu sont exprimées dans le format de la planche : une
 * transformation suffit, et la vignette ne peut pas mentir sur ce qu'on
 * exportera.
 */
function Vignette({ carte, options, format, index, bilan }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const echelle = 132 / format.width;
    canvas.width = Math.round(format.width * echelle);
    canvas.height = Math.round(format.height * echelle);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
    dessinerCartePartage(ctx, { ...options, carte: { ...carte, bilan }, index });
  }, [carte, options, format, index, bilan]);
  return <canvas ref={ref} className="block h-auto w-full rounded-md" />;
}

export default function CarrouselAtelier() {
  const canvasRef = useRef(null);
  const boitesRef = useRef([]);
  const zonesRef = useRef([]);
  /** La poignée de la coque : `{ ouvrir, panneau }` (cf. CoqueAtelier).
   *  `ouvrir` relève la feuille des réglages — un clic dans la planche ouvre le
   *  bon réglage, encore faut-il qu'on le voie. `panneau` rend l'élément qui
   *  défile : le clic y cherche SON champ, pas le premier du document — les
   *  deux ateliers du studio sont montés ensemble, et un `id` n'est unique que
   *  par accident. */
  const feuilleRef = useRef(null);
  const glisseRef = useRef(null);
  /** Un déplacement d'étiquette finit par un `click` : sans ce drapeau, lâcher
   *  une étiquette ouvrirait le panneau de ce qu'il y a dessous. */
  const aGlisseRef = useRef(false);
  const texteRef = useRef(null);
  const colonneRef = useRef(null);
  /** Les identifiants de planches, propres à CETTE instance (cf. carteNeuve). */
  const idRef = useRef(0);
  const idNeuf = useCallback(() => {
    idRef.current += 1;
    return `c${idRef.current}`;
  }, []);

  const [trace, setTrace] = useState(null);
  const [formatCle, setFormatCle] = useState("carrousel");
  const [themeCle, setThemeCle] = useState("sombre");
  // AVANT ou APRÈS : c'est une propriété du CARROUSEL, pas d'une planche.
  // Un carrousel annonce une aventure ou la raconte — jamais les deux.
  const [bilan, setBilan] = useState(false);
  const [coupures, setCoupures] = useState([]);
  /** L'itinéraire COMPLET, jamais dessiné : il ne sert qu'à figer le cadrage. */
  const [traceCadre, setTraceCadre] = useState(null);
  // L'atelier démarre sur une planche de texte : utilisable sans rien charger.
  const [cartes, setCartes] = useState(() => [carteNeuve("texte", null, [], false, "c0")]);
  const [active, setActive] = useState(0);
  const [onglet, setOnglet] = useState("texte");
  /** `null` = ajusté à la fenêtre ; un nombre = le facteur sur les 1080 px du
   *  format (100 % = un pixel d'export pour un pixel d'écran). */
  const [zoom, setZoom] = useState(null);
  /** La bande des vignettes se rabat : sur un petit écran, elle prend la place
   *  de la planche, et on ne change pas de planche à chaque geste. */
  const [bandeOuverte, setBandeOuverte] = useState(true);
  /** Le filtre de la palette d'icônes. À quatre-vingt-dix pictogrammes, la
   *  grille ne se parcourt plus à l'œil : on tape ce qu'on cherche. */
  const [filtreIcones, setFiltreIcones] = useState("");
  /** Ce que fabriquent les boutons « Jour N » : quel gabarit, et l'avancement ou
   *  la journée seule. Ce sont des réglages de l'OUTIL, pas d'une planche — on
   *  fait en général une série entière du même genre, et on ne veut pas le
   *  redire à chaque appui. */
  const [journeeSeule, setJourneeSeule] = useState(false);
  const [gabaritDeJournee, setGabaritDeJournee] = useState("etape");
  const [fond, setFond] = useState(null);
  const [marque, setMarque] = useState(null);
  const [policePrete, setPolicePrete] = useState(false);
  const [etat, setEtat] = useState({ occupe: false, message: "" });
  const [nomProjet, setNomProjet] = useState("");
  const [projets, setProjets] = useState([]);
  /** L'autosauvegarde n'écrit qu'une fois le projet RESTAURÉ : sans ce
   *  verrou, la planche vierge du premier rendu écraserait le travail
   *  enregistré avant même qu'il ait été relu. */
  const pretRef = useRef(false);

  const format = FORMATS[formatCle];
  const theme = THEMES[themeCle];
  const segments = useMemo(() => decouperTrace(trace, coupures), [trace, coupures]);
  const carte = cartes[active] ?? null;
  /** Les cases de la grille, complétées par les journées de la trace. */
  const cases = useMemo(() => casesEffectives(carte, segments), [carte, segments]);
  /** La palette filtrée. Sans accent ni casse : on tape « eclair », on trouve. */
  const icones = useMemo(() => {
    const q = sansAccent(filtreIcones);
    return q ? ICONES_PALETTE.filter(({ cle }) => sansAccent(cle).includes(q)) : ICONES_PALETTE;
  }, [filtreIcones]);

  /* --------------------------------------------------------------- chargements */

  useEffect(() => {
    let vivant = true;
    const { sans, serif, mono } = policesDuSite();
    Promise.all([
      document.fonts.load(`700 65px ${sans}`),
      document.fonts.load(`500 22px ${sans}`),
      document.fonts.load(`400 38px ${sans}`),
      document.fonts.load(`700 65px ${serif}`),
      document.fonts.load(`400 38px ${serif}`),
      document.fonts.load(`700 65px ${mono}`),
      document.fonts.load(`400 38px ${mono}`),
    ])
      .catch(() => {})
      .then(() => vivant && setPolicePrete(true));
    return () => {
      vivant = false;
    };
  }, []);

  // Le logo est AMBRE par défaut — c'est la couleur de marque, pas l'encre du
  // texte. Une planche peut le redéfinir, et il suit alors ce choix.
  useEffect(() => {
    let vivant = true;
    chargerMarqueTeintee(carte?.couleurLogo || theme.accent)
      .then((c) => vivant && setMarque(c))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [theme.accent, carte?.couleurLogo]);

  // Le fond de carte suit la trace ET le format (le cadrage change avec le
  // rapport de l'image). Un chargement plus ancien qui reviendrait après un
  // plus récent est ignoré : `vivant` sert de garde.
  useEffect(() => {
    let vivant = true;
    // Pas de garde synchrone ici : `vueDeLaCarte` rend null sans coordonnées et
    // `chargerFond` l'absorbe. Tout passe donc par la promesse — un setState
    // posé directement dans le corps de l'effet déclencherait un rendu en
    // cascade (et le lint le refuse, à raison).
    chargerFond(vueDeLaCarte((traceCadre ?? trace)?.coords ?? [], formatCle))
      .then((f) => vivant && setFond(f))
      .catch(() => vivant && setFond(null));
    return () => {
      vivant = false;
    };
  }, [trace, traceCadre, formatCle]);

  const instantane = useCallback(
    () => ({ format: formatCle, theme: themeCle, bilan, coupures, trace, traceCadre, cartes }),
    [formatCle, themeCle, bilan, coupures, trace, traceCadre, cartes],
  );

  const appliquerProjet = useCallback((p) => {
    if (!p) return;
    setFormatCle(p.format);
    setThemeCle(p.theme);
    setBilan(p.bilan);
    setCoupures(p.coupures);
    setTrace(p.trace);
    setTraceCadre(p.traceCadre);
    if (p.cartes.length) {
      setCartes(p.cartes);
      setActive(0);
      // Les identifiants repartent au-dessus de ceux restaurés, sinon deux
      // planches finiraient par porter la même clé React.
      idRef.current = p.cartes.length;
    }
  }, []);

  // Reprise du travail en cours : on relit AVANT d'autoriser l'autosauvegarde.
  useEffect(() => {
    let vivant = true;
    chargerEnCours()
      .then((p) => {
        if (vivant && p) appliquerProjet(p);
      })
      .catch(() => {})
      .finally(() => {
        if (vivant) pretRef.current = true;
      });
    listerProjets()
      .then((l) => vivant && setProjets(l))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [appliquerProjet]);

  // Autosauvegarde, différée : on n'écrit pas à chaque frappe.
  useEffect(() => {
    if (!pretRef.current) return undefined;
    const t = setTimeout(() => {
      enregistrerEnCours(instantane()).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [instantane]);

  // Les jonctions d'une fusion l'emportent sur le découpage automatique : ce
  // sont de vraies fins d'étape, pas une estimation.
  const jonctionsRef = useRef(null);
  const setCoupuresApresFusion = useCallback((km) => {
    jonctionsRef.current = km;
  }, []);

  /**
   * @param {object|null} t
   * @param {boolean} deLAventure - vrai seulement pour l'itinéraire de
   *   `liveConfig`. Les waypoints (Arsine 42, Vallouise 84, Valgaudémar 130,6)
   *   ne décrivent QUE cette aventure : les appliquer à un GPX importé
   *   découperait une sortie de 60 km à des kilomètres qui n'ont aucun sens.
   */
  const appliquerTrace = useCallback(
    (t, deLAventure = false) => {
      if (!t) {
        setEtat({ occupe: false, message: "Fichier illisible — attendu un .gpx ou un .track.json." });
        return;
      }
      setTrace(t);
      setBilan(Boolean(t.vecue));
      // Une sortie DÉJÀ FAITE est d'un seul tenant par défaut : elle se raconte,
      // elle ne se planifie plus. Un itinéraire prévu, lui, se découpe.
      const auto = deLAventure
        ? coupuresDepuisWaypoints(liveConfig.aventure.waypoints, t.totalKm)
        : [];
      setCoupures(auto.length ? auto : t.vecue ? [] : coupuresRegulieres(t.totalKm, 2));

      // On ne jette JAMAIS un texte déjà écrit : la planche de l'itinéraire
      // remplace une planche vierge, et s'ajoute derrière les autres.
      setCartes((cs) => {
        const neuve = carteNeuve("carte", t, [], Boolean(t.vecue), idNeuf());
        if (cs.every(estVierge)) return [neuve];
        setActive(cs.length);
        return [...cs, neuve];
      });
      setEtat({ occupe: false, message: "" });
    },
    [idNeuf],
  );

  /**
   * Un fichier, ou PLUSIEURS recollés bout à bout.
   *
   * Le cas qui l'exige : une aventure de quatre jours enregistrée en quatre
   * sorties, parce que la montre s'arrête au bivouac. Les fichiers sont pris
   * dans l'ordre ALPHABÉTIQUE de leur nom — c'est celui des exports de montre
   * (horodatés), et c'est le seul ordre qu'on peut deviner sans se tromper.
   * Les jonctions deviennent les coupures de journée : elles sont exactes, ce
   * sont de vraies fins d'étape.
   */
  const chargerFichierTrace = useCallback(
    async (e) => {
      const fichiers = [...(e.target.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr"));
      if (fichiers.length === 0) return;
      setEtat({
        occupe: true,
        message: fichiers.length > 1 ? `Lecture de ${fichiers.length} traces…` : "Lecture de la trace…",
      });
      try {
        const traces = [];
        for (const file of fichiers) {
          const texte = await file.text();
          const t = file.name.endsWith(".json")
            ? traceDepuisTrackJson(JSON.parse(texte))
            : traceDepuisGpx(texte);
          if (t) traces.push(t);
        }
        const fusion = fusionnerTraces(traces);
        if (fusion?.jonctions?.length) setCoupuresApresFusion(fusion.jonctions);
        appliquerTrace(fusion);
      } catch {
        setEtat({ occupe: false, message: "Fichier illisible — attendu un .gpx ou un .track.json." });
      }
    },
    [appliquerTrace, setCoupuresApresFusion],
  );

  /** La référence ne remplace RIEN : elle se pose à côté, et fige le cadre. */
  const chargerReference = useCallback(async (e) => {
    const fichiers = [...(e.target.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (fichiers.length === 0) return;
    setEtat({ occupe: true, message: "Lecture de la référence…" });
    try {
      const traces = [];
      for (const file of fichiers) {
        const texte = await file.text();
        const t = file.name.endsWith(".json")
          ? traceDepuisTrackJson(JSON.parse(texte))
          : traceDepuisGpx(texte);
        if (t) traces.push(t);
      }
      setTraceCadre(fusionnerTraces(traces));
      setEtat({ occupe: false, message: "" });
    } catch {
      setEtat({ occupe: false, message: "Référence illisible — attendu un .gpx ou un .track.json." });
    }
  }, []);

  const chargerAventure = useCallback(async () => {
    setEtat({ occupe: true, message: "Chargement de l'itinéraire…" });
    try {
      const res = await fetch(liveConfig.aventure.trace);
      appliquerTrace(traceDepuisTrackJson(await res.json()), true);
    } catch {
      setEtat({ occupe: false, message: "Itinéraire de l'aventure introuvable." });
    }
  }, [appliquerTrace]);

  /* ------------------------------------------------------------------- édition */

  const majCarte = useCallback(
    (patch) => setCartes((cs) => cs.map((c, i) => (i === active ? { ...c, ...patch } : c))),
    [active],
  );

  /**
   * Changer de gabarit, en gardant le contenu.
   *
   * La clôture est le seul gabarit dont la mise en page est SYMÉTRIQUE : un
   * bloc autour du logo. Y arriver avec un texte aligné à gauche donne une
   * planche visiblement cassée, alors que personne n'a fait ce choix — il a été
   * hérité. On centre donc en y entrant. Les mots, eux, ne bougent pas.
   */
  const changerGabarit = useCallback(
    (gabarit) =>
      majCarte(
        gabarit === "cloture"
          ? { gabarit, alignement: "centre", centrer: true, marque: "rien" }
          : { gabarit },
      ),
    [majCarte],
  );

  const majLibre = useCallback(
    (i, patch) =>
      setCartes((cs) =>
        cs.map((c, k) => {
          if (k !== active) return c;
          const libres = [...(c.libres ?? [])];
          libres[i] = { ...(libres[i] ?? {}), ...patch };
          return { ...c, libres };
        }),
      ),
    [active],
  );

  /** Une zone neuve se pose au milieu, où on la voit tout de suite : on la
   *  déplace ensuite à la souris, c'est tout l'intérêt. */
  const ajouterLibre = useCallback(
    () =>
      majCarte({
        libres: [
          ...(cartes[active]?.libres ?? []),
          { texte: "Un mot ici.", x: 0.12, y: 0.44, largeur: 0.62, taille: 44, align: "gauche" },
        ],
      }),
    [majCarte, cartes, active],
  );

  const majEtiquette = useCallback(
    (i, patch) =>
      setCartes((cs) =>
        cs.map((c, k) => {
          if (k !== active) return c;
          const etiquettes = [...(c.etiquettes ?? [])];
          etiquettes[i] = { ...(etiquettes[i] ?? {}), ...patch };
          return { ...c, etiquettes };
        }),
      ),
    [active],
  );

  /**
   * Insère une balise LÀ OÙ EST LE CURSEUR, pas à la fin du champ.
   *
   * Ajouter en bout de texte oblige à couper-coller derrière : autant taper la
   * balise à la main. On repose donc le curseur juste après l'insertion, et on
   * rend le focus au champ — la frappe continue sans rien toucher à la souris.
   */
  const insererDans = useCallback(
    (nom, ref, balise) => {
      const champ = ref.current;
      // La valeur se lit sur le CHAMP, pas sur la carte : le textarea est
      // contrôlé, les deux disent donc la même chose — mais passer par le DOM
      // évite de refaire ce rappel à chaque frappe.
      const actuel = champ?.value ?? "";
      const debut = champ?.selectionStart ?? actuel.length;
      const fin = champ?.selectionEnd ?? actuel.length;
      majCarte({ [nom]: actuel.slice(0, debut) + balise + actuel.slice(fin) });
      requestAnimationFrame(() => {
        champ?.focus();
        champ?.setSelectionRange(debut + balise.length, debut + balise.length);
      });
    },
    [majCarte],
  );
  const insererDansTexte = useCallback((b) => insererDans("texte", texteRef, b), [insererDans]);
  const insererDansColonne = useCallback(
    (b) => insererDans("colonne", colonneRef, b),
    [insererDans],
  );

  const majFiche = useCallback(
    (i, patch) =>
      setCartes((cs) =>
        cs.map((c, k) => {
          if (k !== active) return c;
          const fiche = [...(c.fiche ?? [])];
          fiche[i] = { ...(fiche[i] ?? {}), ...patch };
          return { ...c, fiche };
        }),
      ),
    [active],
  );

  const majCase = useCallback(
    (i, patch) =>
      setCartes((cs) =>
        cs.map((c, k) => {
          if (k !== active) return c;
          // On PARTIALISE la liste effective, pas la liste écrite : sans ça,
          // toucher la case 3 d'une grille jamais éditée en effacerait les deux
          // premières (elles n'existent que par défaut).
          const cases = casesEffectives(c, segments).map((x) => ({ ...x }));
          cases[i] = { ...(cases[i] ?? {}), ...patch };
          return { ...c, cases };
        }),
      ),
    [active, segments],
  );

  /** Réécrit toutes les cases depuis les journées de la trace. */
  const regenererCases = useCallback(
    () =>
      setCartes((cs) =>
        cs.map((c, k) =>
          k === active
            ? {
                ...c,
                casesN: segments.length || c.casesN,
                cases: (segments.length ? segments : []).map((seg, i) => ({
                  jour: i,
                  texte: texteDeJournee(i, seg),
                })),
              }
            : c,
        ),
      ),
    [active, segments],
  );

  /**
   * AJOUTER UNE PLANCHE — et choisir OÙ.
   *
   * Par défaut : juste APRÈS celle qu'on regarde. C'est ce qu'on veut presque
   * toujours, parce qu'un carrousel se compose dans l'ordre où il se raconte —
   * la planche « Jour 2 » se pose derrière les photos du jour 1, pas au bout du
   * lot. Ajouter systématiquement à la fin obligeait à la remonter à la main sur
   * toute la bande, geste par geste, et c'est exactement ce qui décourage
   * d'intercaler quoi que ce soit.
   *
   * La nouvelle planche devient l'active : on vient de la créer, c'est elle
   * qu'on veut voir. Son style est celui de la planche courante — on continue
   * sur la même mise en forme au lieu de repartir de la charte à chaque ajout.
   */
  const ajouterCarte = useCallback(
    (gabarit, position = null) => {
      const ou = Math.min(Math.max(position ?? active + 1, 0), cartes.length);
      setCartes((cs) => {
        const neuve = carteNeuve(gabarit, trace, segments, bilan, idNeuf(), styleDe(cs[active]));
        return [...cs.slice(0, ou), neuve, ...cs.slice(ou)];
      });
      setActive(ou);
    },
    [trace, segments, bilan, cartes.length, active, idNeuf],
  );

  /**
   * LES PLANCHES DE JOURNÉE, À LA DEMANDE.
   *
   * Une planche « Jour 3 » se fabriquait jusqu'ici à la main : dupliquer la
   * carte, changer « Afficher » dans l'onglet Trace, réécrire le titre, corriger
   * les chiffres — quatre gestes, à refaire pour chaque jour, et à refaire
   * encore si on ajoute une journée. D'où ce raccourci : un appui, une planche
   * complète, posée derrière celle qu'on regarde.
   *
   * Elle montre l'AVANCEMENT (`jusquA`) : l'itinéraire entier reste en sourdine,
   * les journées acquises sont en couleur, et le cadre ne bouge pas d'une
   * planche à l'autre puisqu'il vient de la trace complète. La série se lit donc
   * comme une progression, même quand des photos s'intercalent entre deux
   * planches — et c'est justement pour ce cas qu'elle existe.
   *
   * Les chiffres sont ceux de LA JOURNÉE, pas de l'aventure entière : sur une
   * planche « Jour 3 », annoncer les 188 km du tour est le mauvais chiffre.
   */
  const ajouterJournees = useCallback(
    (indices, { gabarit = "carte", seule = false } = {}) => {
      if (!trace || indices.length === 0) return;
      const nom = trace.nom ?? liveConfig.aventure.nom;
      const ou = active + 1;
      setCartes((cs) => {
        const style = styleDe(cs[active]);
        const neuves = indices.map((i) => {
          const base = {
            ...carteNeuve(gabarit, trace, segments, bilan, idNeuf(), style),
            jusquA: i,
            // `depuis` égal à `jusquA` : cette étape et rien d'autre.
            depuis: seule ? i : null,
            titre: `Jour ${i + 1}`,
          };
          // L'ÉTAPE est une page de carnet : le nom de l'aventure passe dans le
          // coin haut, à côté de la marque, et le pied ne garde que la flèche —
          // un décompte et le mot « glisse » feraient trois signes pour une
          // seule idée. Ses chiffres partent dans la colonne, en liste.
          return gabarit === "etape"
            ? {
                ...base,
                entete: nom,
                surtitre: "",
                piedNumero: false,
                piedDroite: " ",
                piedFleche: "toujours",
                colonne: colonneDeJournee(segments[i]),
              }
            : { ...base, surtitre: nom, pied: ligneDeJournee(segments[i]) };
        });
        return [...cs.slice(0, ou), ...neuves, ...cs.slice(ou)];
      });
      // La DERNIÈRE des nouvelles : après « toutes les journées », c'est la fin
      // de la série qu'on veut voir, pas son début.
      setActive(ou + indices.length - 1);
    },
    [trace, segments, bilan, active, idNeuf],
  );

  /** Dupliquer : le geste le plus fréquent d'une série (J1, J1+J2, J1+J2+J3…). */
  const dupliquerCarte = useCallback(
    (i) => {
      const id = idNeuf();
      setCartes((cs) => [...cs.slice(0, i + 1), { ...cs[i], id }, ...cs.slice(i + 1)]);
      setActive(i + 1);
    },
    [idNeuf],
  );

  const supprimerCarte = useCallback((i) => {
    setCartes((cs) => (cs.length <= 1 ? cs : cs.filter((_, k) => k !== i)));
    setActive((a) => Math.max(0, a >= i ? a - 1 : a));
  }, []);

  /**
   * Déplace une planche à la position `vers`, et GARDE LA SÉLECTION DESSUS.
   *
   * L'ancienne version décidait de bouger l'index actif d'après un drapeau posé
   * DANS l'updater de `setCartes` — qui ne s'exécute pas au moment où on le
   * lit. Le drapeau était donc toujours faux : la sélection ne suivait jamais,
   * et c'est la planche qui venait de prendre la place qui paraissait
   * sélectionnée. On borne donc ici, avec la longueur qu'on connaît déjà.
   */
  const deplacerVers = useCallback(
    (depuis, vers) => {
      const cible = Math.min(Math.max(vers, 0), cartes.length - 1);
      if (cible === depuis) return;
      setCartes((cs) => {
        const out = [...cs];
        out.splice(cible, 0, ...out.splice(depuis, 1));
        return out;
      });
      setActive(cible);
    },
    [cartes.length],
  );

  const deplacerCarte = useCallback(
    (i, delta) => deplacerVers(i, i + delta),
    [deplacerVers],
  );

  /* ------------------------------------------- glisser-déposer des vignettes */

  /**
   * RÉORDONNER À LA MAIN.
   *
   * À la souris, le glissement part au premier mouvement. Au DOIGT, il part
   * après un appui maintenu : sans ce délai, la bande ne pourrait plus défiler
   * latéralement — le geste est le même, et c'est celui qu'on fait le plus
   * souvent. C'est la convention de toutes les listes réordonnables mobiles.
   */
  const bougeRef = useRef(null);
  const [glissee, setGlissee] = useState(null);

  const finGlissement = useCallback(() => {
    const g = bougeRef.current;
    if (g?.minuterie) clearTimeout(g.minuterie);
    bougeRef.current = null;
    setGlissee(null);
  }, []);

  const debutGlissement = useCallback((e, i) => {
    // Le bouton droit ou un second doigt n'ouvrent rien.
    if (e.button != null && e.button !== 0) return;
    const cible = e.currentTarget;
    const g = { index: i, x0: e.clientX, y0: e.clientY, actif: false, minuterie: null, cible };
    bougeRef.current = g;
    if (e.pointerType === "touch") {
      g.minuterie = setTimeout(() => {
        if (bougeRef.current !== g) return;
        g.actif = true;
        cible.setPointerCapture?.(e.pointerId);
        setGlissee(g.index);
      }, 240);
    }
  }, []);

  const pendantGlissement = useCallback(
    (e) => {
      const g = bougeRef.current;
      if (!g) return;
      const bouge = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
      if (!g.actif) {
        // Au doigt, un vrai mouvement AVANT la fin du délai est un défilement :
        // on rend la main à la bande.
        if (e.pointerType === "touch") {
          if (bouge > 10) finGlissement();
          return;
        }
        if (bouge < 6) return;
        g.actif = true;
        g.cible.setPointerCapture?.(e.pointerId);
        setGlissee(g.index);
      }
      // La vignette SOUS le doigt donne la position visée : on suit le DOM,
      // pas une arithmétique de largeurs qui se désaccorderait au premier
      // changement de style.
      const sous = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-vignette]");
      const vers = sous ? Number(sous.dataset.vignette) : null;
      if (vers != null && Number.isInteger(vers) && vers !== g.index) {
        deplacerVers(g.index, vers);
        g.index = vers;
        setGlissee(vers);
      }
    },
    [deplacerVers, finGlissement],
  );

  const finDuGeste = useCallback(
    (i) => {
      const g = bougeRef.current;
      const aGlisse = Boolean(g?.actif);
      finGlissement();
      // Un simple appui SÉLECTIONNE ; un glissement a déjà tout fait.
      if (!aGlisse) setActive(i);
    },
    [finGlissement],
  );

  const chargerPhoto = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setEtat({ occupe: true, message: "Lecture de la photo…" });
      try {
        const bitmap = await chargerImage(file);
        majCarte({ image: bitmap, nomImage: file.name });
        setEtat({ occupe: false, message: "" });
      } catch (err) {
        setEtat({
          occupe: false,
          message: err?.message?.startsWith("Ce HEIC")
            ? err.message
            : "Photo illisible — essaie un JPEG, un PNG ou un HEIC.",
        });
      }
    },
    [majCarte],
  );

  /* ------------------------------------------------------------------ projets */

  const rafraichirProjets = useCallback(
    () =>
      listerProjets()
        .then(setProjets)
        .catch(() => {}),
    [],
  );

  const enregistrer = useCallback(async () => {
    const nom = nomProjet.trim();
    if (!nom) return;
    setEtat({ occupe: true, message: "Enregistrement…" });
    try {
      await enregistrerProjet(nom, instantane());
      await rafraichirProjets();
      setEtat({ occupe: false, message: `« ${nom} » enregistré.` });
    } catch {
      setEtat({ occupe: false, message: "Enregistrement impossible sur cet appareil." });
    }
  }, [nomProjet, instantane, rafraichirProjets]);

  const ouvrirProjet = useCallback(
    async (nom) => {
      setEtat({ occupe: true, message: "Ouverture…" });
      try {
        appliquerProjet(await chargerProjet(nom));
        setNomProjet(nom);
        setEtat({ occupe: false, message: "" });
      } catch {
        setEtat({ occupe: false, message: "Projet illisible." });
      }
    },
    [appliquerProjet],
  );

  const telechargerProjet = useCallback(async () => {
    const blob = await exporterProjet(instantane());
    telecharger(blob, `${(nomProjet.trim() || "carrousel").replace(/[^\w-]+/g, "-")}.json`);
  }, [instantane, nomProjet]);

  const importer = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setEtat({ occupe: true, message: "Import…" });
      try {
        appliquerProjet(await importerProjet(await file.text()));
        setNomProjet(file.name.replace(/\.json$/i, ""));
        setEtat({ occupe: false, message: "" });
      } catch {
        setEtat({ occupe: false, message: "Fichier de projet illisible." });
      }
    },
    [appliquerProjet],
  );

  /** Recopie la mise en forme de la planche courante sur TOUTES les autres. */
  const diffuserStyle = useCallback(() => {
    const style = styleDe(cartes[active]);
    if (style) setCartes((cs) => cs.map((c) => ({ ...c, ...style })));
  }, [cartes, active]);

  /* -------------------------------------------------------------------- rendu */

  const options = useMemo(
    () => ({
      format: formatCle,
      theme: themeCle,
      trace,
      traceCadre,
      segments,
      police: policesDuSite().sans,
      polices: policesDuSite(),
      logo: marque,
      fond,
      total: cartes.length,
      // `policePrete` ne sert à rien au dessin : il est là pour que l'aperçu se
      // REFASSE une fois les fontes chargées, sinon la première planche reste
      // mesurée à la police système.
      policePrete,
    }),
    [formatCle, themeCle, trace, traceCadre, segments, marque, fond, cartes.length, policePrete],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !carte) return;
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rendu = dessinerCartePartage(ctx, {
      ...options,
      carte: { ...carte, bilan },
      index: active,
    });
    boitesRef.current = rendu?.boites ?? [];
    zonesRef.current = rendu?.zones ?? [];
  }, [carte, options, format, active, bilan]);

  /* ------------------------------------------- glisser-déposer des étiquettes */

  const pointCanvas = useCallback((e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * canvas.width,
      ((e.clientY - r.top) / r.height) * canvas.height,
    ];
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      const [x, y] = pointCanvas(e);
      // Du dernier au premier : c'est la boîte DESSUS qu'on attrape quand deux
      // se recouvrent, celle qu'on voit. Les zones libres sont poussées en
      // dernier, donc elles gagnent — ce qui est bien ce qu'on veut d'un
      // calque posé par-dessus.
      const boites = boitesRef.current;
      for (let i = boites.length - 1; i >= 0; i -= 1) {
        const b = boites[i];
        if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) continue;
        if (b.type === "libre") {
          const z = carte?.libres?.[b.index] ?? {};
          glisseRef.current = {
            type: "libre",
            index: b.index,
            x0: x,
            y0: y,
            dx0: Number.isFinite(z.x) ? z.x : 0.1,
            dy0: Number.isFinite(z.y) ? z.y : 0.5,
          };
        } else {
          if (carte?.gabarit !== "carte") continue;
          const etq = carte.etiquettes?.[b.index] ?? {};
          glisseRef.current = {
            type: "etiquette",
            index: b.index,
            x0: x,
            y0: y,
            dx0: etq.dx ?? 0,
            dy0: etq.dy ?? 0,
          };
        }
        aGlisseRef.current = false;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        return;
      }
    },
    [carte, pointCanvas],
  );

  const onPointerMove = useCallback(
    (e) => {
      const g = glisseRef.current;
      if (!g) return;
      const canvas = canvasRef.current;
      const [x, y] = pointCanvas(e);
      if (Math.abs(x - g.x0) > 2 || Math.abs(y - g.y0) > 2) aGlisseRef.current = true;
      if (g.type === "libre") {
        // La position d'une zone libre est RELATIVE : elle reste au même
        // endroit quel que soit le format d'export.
        const borne = (v) => Math.min(0.98, Math.max(-0.02, v));
        majLibre(g.index, {
          x: borne(g.dx0 + (x - g.x0) / canvas.width),
          y: borne(g.dy0 + (y - g.y0) / canvas.height),
        });
        return;
      }
      majEtiquette(g.index, { dx: g.dx0 + (x - g.x0), dy: g.dy0 + (y - g.y0) });
    },
    [pointCanvas, majEtiquette, majLibre],
  );

  const onPointerUp = useCallback(() => {
    glisseRef.current = null;
  }, []);

  /**
   * Un clic dans la planche ouvre le réglage de ce qu'on a cliqué.
   *
   * Les zones sont testées de la DERNIÈRE à la première : la dernière dessinée
   * est celle du dessus, donc celle qu'on voit et qu'on croit cliquer.
   */
  const onClick = useCallback(
    (e) => {
      if (aGlisseRef.current) {
        aGlisseRef.current = false;
        return;
      }
      const [x, y] = pointCanvas(e);
      const zones = zonesRef.current;
      for (let i = zones.length - 1; i >= 0; i -= 1) {
        const z = zones[i];
        if (x < z.x || x > z.x + z.width || y < z.y || y > z.y + z.height) continue;
        const regle = ZONES[z.champ];
        if (!regle) return;
        setOnglet(regle.onglet);
        feuilleRef.current?.ouvrir();
        const id = regle.champ(z);
        // Deux images : la première monte le panneau, la seconde le trouve.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = feuilleRef.current?.panneau()?.querySelector(`#${CSS.escape(id)}`);
            if (!el) return;
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            el.focus({ preventScroll: true });
          }),
        );
        return;
      }
    },
    [pointCanvas],
  );

  /** Le zoom EFFECTIF de l'aperçu, mesuré sur le canvas — c'est de là que
   *  repart le premier « + » quand on était encore en « Ajuster ». */
  const zoomAffiche = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas?.clientWidth ? canvas.clientWidth / format.width : null;
  }, [format.width]);

  /** Ctrl/⌘ + molette : le geste de zoom de tous les éditeurs. Sans la touche,
   *  la molette fait ce qu'elle doit faire — défiler. */
  const molette = useCallback(
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const actuel = zoom ?? zoomAffiche() ?? 0.4;
      const suivant = Math.min(3, Math.max(0.1, actuel * (e.deltaY > 0 ? 0.9 : 1.1)));
      setZoom(Math.round(suivant * 100) / 100);
    },
    [zoom, zoomAffiche],
  );

  /* ------------------------------------------------------------------- export */

  const exporter = useCallback(
    async (indices) => {
      setEtat({ occupe: true, message: "Fabrication des images…" });
      const hors = document.createElement("canvas");
      hors.width = format.width;
      hors.height = format.height;
      const ctx = hors.getContext("2d");
      const horodatage = Date.now();

      for (const i of indices) {
        // `index` reste celui de la planche DANS LE CARROUSEL : la pagination du
        // pied doit dire « 03 / 10 » même si on n'exporte que celle-là.
        dessinerCartePartage(ctx, { ...options, carte: { ...cartes[i], bilan }, index: i });
        const blob = await new Promise((r) => hors.toBlob(r, "image/jpeg", 0.92));
        if (blob) {
          const numero = String(indices.indexOf(i) + 1).padStart(2, "0");
          telecharger(blob, `carrousel-${horodatage}-${numero}.jpg`);
          await new Promise((r) => setTimeout(r, 260)); // Safari perd les téléchargements en rafale
        }
      }
      setEtat({ occupe: false, message: "" });
    },
    [cartes, options, format, bilan],
  );

  /* --------------------------------------------------------------------- vues */

  const aPhoto = AVEC_PHOTO.includes(carte?.gabarit);
  const gabarit = GABARITS.find((g) => g.cle === carte?.gabarit);

  /**
   * LE FORMAT ET LE THÈME — deux réglages du LOT, pas d'une planche.
   *
   * Le même fragment sert deux fois : dans la barre haute sur grand écran, et
   * en tête du panneau « Projet » sur téléphone, où la barre n'a plus la place.
   * Écrit une fois : deux copies auraient divergé au premier format ajouté.
   */
  const reglagesDuLot = (
    <>
      <select
        value={formatCle}
        onChange={(e) => setFormatCle(e.target.value)}
        className="w-full rounded-lg border border-brand-field bg-brand-paper px-2 py-2 font-heading text-[16px] text-brand-text focus:border-brand-primary-dark focus:outline-none lg:w-auto lg:py-1.5 lg:text-[13px]"
        aria-label="Format"
      >
        {Object.values(FORMATS).map((f) => (
          <option key={f.cle} value={f.cle}>
            {f.label}
          </option>
        ))}
      </select>
      <div className="flex w-full rounded-full border border-brand-field bg-brand-paper p-0.5 lg:w-auto">
        {Object.values(THEMES).map((t) => (
          <button
            key={t.cle}
            type="button"
            onClick={() => setThemeCle(t.cle)}
            aria-pressed={themeCle === t.cle}
            className={`flex-1 rounded-full px-3 py-1.5 font-heading text-[14px] transition-colors motion-reduce:transition-none lg:flex-none lg:py-1 lg:text-[13px] ${
              themeCle === t.cle
                ? "bg-brand-deep text-brand-bg"
                : "text-brand-text/60 hover:text-brand-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  );

  /**
   * LA TRANCHE DE JOURNÉES, telle que le menu la dit — et l'inverse.
   *
   * Le modèle porte deux bornes (`depuis`, `jusquA`) parce que le rendu en a
   * besoin ; le menu, lui, n'expose que les trois cas qui ont un sens. La
   * traduction tient ici, en deux fonctions qui se répondent.
   */
  const trancheAffichee =
    carte?.jusquA == null
      ? ""
      : `${carte.depuis === carte.jusquA ? "seule" : "jusqu"}:${carte.jusquA}`;

  const trancheDepuisLeMenu = (valeur) => {
    if (valeur === "") return { jusquA: null, depuis: null };
    const [mode, n] = valeur.split(":");
    const jour = Number(n);
    return { jusquA: jour, depuis: mode === "seule" ? jour : null };
  };

  /**
   * LES OUTILS DE LA SCÈNE : le zoom, et la bande des vignettes qu'on replie.
   *
   * Écrits une fois, montés deux : sur téléphone la coque les pose dans la barre
   * de la feuille (une rangée qui fait aussi poignée — c'est autant de rendu à
   * la planche), en grand écran ils reprennent leur place sous l'aperçu.
   */
  const outilsDeScene = (
    <>
      <Zoom valeur={zoom} onChange={setZoom} mesurer={zoomAffiche} />
      <button
        type="button"
        onClick={() => setBandeOuverte((v) => !v)}
        aria-expanded={bandeOuverte}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-field bg-brand-paper px-2.5 py-1.5 font-heading text-[12px] text-brand-text/60 hover:text-brand-text"
      >
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform motion-reduce:transition-none ${
            bandeOuverte ? "" : "-rotate-180"
          }`}
        />
        <span>{cartes.length}</span>
        <span className="hidden sm:inline">planche{cartes.length > 1 ? "s" : ""}</span>
      </button>
    </>
  );

  // LA BARRE HAUTE tient sur UNE ligne sur téléphone. Elle en prenait trois —
  // nom, format, thème, enregistrer, exporter — et les trois étaient prises sur
  // la planche. Ce qui n'y tient plus n'est pas perdu : le format, le thème et
  // l'enregistrement ouvrent le panneau « Projet », qui est déjà l'endroit où
  // vivent le nom du projet et les sauvegardes.
  return (
    <CoqueAtelier
      message={etat.message}
      onglets={ONGLETS}
      onglet={onglet}
      setOnglet={setOnglet}
      feuilleRef={feuilleRef}
      outils={outilsDeScene}
      barre={
        <>
          <input
            type="text"
            value={nomProjet}
            placeholder="carrousel sans nom"
            onChange={(e) => setNomProjet(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-heading text-[16px] font-medium text-brand-text hover:border-brand-field focus:border-brand-primary-dark focus:outline-none lg:basis-40 lg:text-[15px]"
            aria-label="Nom du projet"
          />
          <div className="hidden items-center gap-2 lg:flex">{reglagesDuLot}</div>
          <button
            type="button"
            onClick={enregistrer}
            disabled={!nomProjet.trim() || etat.occupe}
            className={`${BOUTON_SECOND} max-lg:hidden`}
          >
            <Save size={15} aria-hidden />
            Enregistrer
          </button>
          <button
            type="button"
            className={`${BOUTON_PRINCIPAL} shrink-0 max-lg:px-4 max-lg:py-2`}
            disabled={etat.occupe}
            onClick={() => exporter(cartes.map((_, i) => i))}
          >
            {etat.occupe ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Download size={16} aria-hidden />
            )}
            Exporter ({cartes.length})
          </button>
        </>
      }
      scene={
        <>
          {/* Le plan de travail : un aplat neutre derrière la planche, pour
              qu'un fond clair ne se confonde pas avec la page. Il DÉFILE dès
              qu'on zoome — sinon agrandir couperait la planche au lieu de
              permettre d'en regarder un coin. */}
          <div
            onWheel={molette}
            className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-brand-bg/50 p-2 lg:m-3 lg:mb-0 lg:rounded-xl lg:bg-brand-text/5 lg:p-4"
          >
            {carte && (
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={onClick}
                style={zoom == null ? undefined : { width: `${format.width * zoom}px` }}
                className={
                  // `max-h-full` et non `max-h-[40vh]` : la scène a maintenant
                  // une hauteur à elle, et la planche doit remplir CE qui reste
                  // — elle grandit quand on referme la feuille des réglages.
                  zoom == null
                    ? "block h-auto max-h-full w-auto max-w-full cursor-pointer touch-none rounded-lg bg-brand-text/10 shadow-card lg:rounded-xl"
                    : "block h-auto max-w-none shrink-0 cursor-pointer touch-none rounded-lg bg-brand-text/10 shadow-card lg:rounded-xl"
                }
              />
            )}
          </div>

          <div className="hidden shrink-0 items-center justify-center gap-2 px-3 py-1.5 lg:flex">
            {outilsDeScene}
          </div>

          <p className={`${AIDE} hidden shrink-0 px-3 pb-1 text-center lg:block`}>
            Clique dans la planche pour ouvrir le réglage correspondant.
            {carte?.libres?.length > 0 && " Attrape une zone libre pour la placer."}
            {carte?.gabarit === "carte" &&
              segments.length > 0 &&
              " Attrape une étiquette pour la déplacer."}
          </p>

          {/* --------------------------------------- la bande des vignettes */}
          {/* `hidden` plutôt qu'un démontage : replier la bande ne doit pas
              redessiner N vignettes ni perdre où on en était dans le défilé. */}
          <div
            className={`shrink-0 border-t border-brand-field/60 px-2 py-1 lg:py-1.5 ${
              bandeOuverte ? "" : "hidden"
            }`}
          >
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {cartes.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  data-vignette={i}
                  onPointerDown={(e) => debutGlissement(e, i)}
                  onPointerMove={pendantGlissement}
                  onPointerUp={() => finDuGeste(i)}
                  onPointerCancel={finGlissement}
                  aria-current={i === active ? "true" : undefined}
                  className={`w-[42px] shrink-0 cursor-grab rounded-md border p-0.5 text-left transition-colors select-none motion-reduce:transition-none lg:w-[76px] lg:rounded-lg lg:p-1 ${
                    glissee === i ? "cursor-grabbing opacity-60 ring-2 ring-brand-primary-dark" : ""
                  } ${
                    i === active
                      ? "border-brand-primary-dark bg-brand-primary/20"
                      : "border-brand-field bg-brand-paper hover:border-brand-primary/60"
                  }`}
                >
                  <Vignette carte={c} options={options} format={format} index={i} bilan={bilan} />
                  {/* L'étiquette ne survit pas au doigt : à 9 px elle ne se
                      lisait plus, et sa rangée coûtait autant que la vignette.
                      L'anneau dit laquelle est active, la position dit laquelle
                      est laquelle. */}
                  <span className="mt-1 hidden truncate font-heading text-[10px] leading-tight text-brand-text/55 lg:block">
                    {i + 1}. {GABARITS.find((g) => g.cle === c.gabarit)?.label}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => ajouterCarte(carte?.gabarit ?? "texte", cartes.length)}
                className="flex h-[54px] w-[42px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-brand-field text-brand-text/50 hover:border-brand-primary-dark hover:text-brand-text lg:h-[95px] lg:w-[76px] lg:rounded-lg"
                aria-label="Ajouter une planche à la fin"
              >
                <Plus size={18} aria-hidden />
                <span className="hidden font-heading text-[11px] lg:inline">Ajouter</span>
              </button>
            </div>
          </div>
        </>
      }
    >
            {/* ==================================================== PLANCHE */}
            {onglet === "planche" && (
              <>
                <Groupe titre={`Planche ${active + 1} sur ${cartes.length}`} aide={gabarit?.aide}>
                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {GABARITS.map((g) => (
                      <button
                        key={g.cle}
                        type="button"
                        onClick={() => changerGabarit(g.cle)}
                        aria-pressed={carte?.gabarit === g.cle}
                        className={`rounded-xl border px-3 py-2 text-left font-heading text-[14px] transition-colors motion-reduce:transition-none ${
                          carte?.gabarit === g.cle
                            ? "border-brand-primary-dark bg-brand-primary/20 text-brand-text"
                            : "border-brand-field bg-brand-paper text-brand-text/70 hover:border-brand-primary/60"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {AVEC_TRACE.includes(carte?.gabarit) && !trace && (
                    <p className={`${AIDE} mb-3`}>
                      Ce gabarit a besoin d&rsquo;une trace — onglet « Trace ».
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => deplacerCarte(active, -1)}
                      disabled={active === 0}
                      className={BOUTON_DISCRET}
                    >
                      <ArrowLeft size={14} aria-hidden />
                      Reculer
                    </button>
                    <button
                      type="button"
                      onClick={() => deplacerCarte(active, 1)}
                      disabled={active === cartes.length - 1}
                      className={BOUTON_DISCRET}
                    >
                      <ArrowRight size={14} aria-hidden />
                      Avancer
                    </button>
                    <button
                      type="button"
                      onClick={() => dupliquerCarte(active)}
                      className={BOUTON_DISCRET}
                    >
                      <CopyPlus size={14} aria-hidden />
                      Dupliquer
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerCarte(active)}
                      disabled={cartes.length <= 1}
                      className={BOUTON_DISCRET}
                    >
                      <Trash2 size={14} aria-hidden />
                      Supprimer
                    </button>
                  </div>
                </Groupe>

                <Groupe
                  titre="Ajouter une planche"
                  aide={`Elle se pose EN ${active + 2}ᵉ position, juste derrière celle-ci — un carrousel se compose dans l'ordre où il se raconte. Le « + » de la bande, lui, ajoute toujours à la fin.`}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {GABARITS.map((g) => (
                      <button
                        key={g.cle}
                        type="button"
                        onClick={() => ajouterCarte(g.cle)}
                        className={BOUTON_DISCRET}
                      >
                        <Plus size={13} aria-hidden />
                        {g.label}
                      </button>
                    ))}
                  </div>
                </Groupe>

                {/* LES PLANCHES DE JOURNÉE : le raccourci du carrousel d'après
                    l'aventure. Ici et pas dans l'onglet « Trace » — c'est un
                    geste de composition (ajouter des planches), pas un réglage
                    de la trace, et c'est ici qu'on vient quand on cherche à
                    ajouter quelque chose. */}
                {trace && segments.length > 1 && (
                  <Groupe
                    titre="Planches de journée"
                    aide="Une planche par appui : la carte de ce jour-là, son titre, ses chiffres à elle. Le cadre ne bouge pas d'une planche à l'autre, la série se lit d'un bloc — même avec des photos intercalées."
                  >
                    <div className="mb-3">
                      <Choix
                        label="Le gabarit"
                        valeur={gabaritDeJournee}
                        options={[
                          { cle: "etape", label: "Étape" },
                          { cle: "carte", label: "Carte pleine" },
                        ]}
                        onChange={setGabaritDeJournee}
                      />
                      <p className={`${AIDE} mt-1.5`}>
                        {gabaritDeJournee === "etape"
                          ? "Une page de carnet : la photo fondue, le jour et son récit, la portion de trace, ses chiffres. Le pied ne garde que la flèche."
                          : "La trace pleine planche, le jour et ses chiffres posés dessus."}
                      </p>
                    </div>
                    <div className="mb-3">
                      <Choix
                        label="Ce qu'elle met en couleur"
                        valeur={journeeSeule}
                        options={[
                          { cle: false, label: "L’avancement" },
                          { cle: true, label: "Cette journée seule" },
                        ]}
                        onChange={setJourneeSeule}
                      />
                      <p className={`${AIDE} mt-1.5`}>
                        {journeeSeule
                          ? "L’étape et rien d’autre, sur l’itinéraire resté en sourdine : on voit où elle tombe dans le tour."
                          : "Tout ce qui est fait jusqu’à ce jour-là : la série révèle l’itinéraire au fur et à mesure."}
                      </p>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {segments.map((sg, i) => (
                        <button
                          key={`journee-${sg.kmDebut}`}
                          type="button"
                          onClick={() =>
                            ajouterJournees([i], { gabarit: gabaritDeJournee, seule: journeeSeule })
                          }
                          className={BOUTON_DISCRET}
                          title={`Jour ${i + 1} — ${sg.distanceKm.toFixed(1)} km, ${sg.dPlusM} m D+`}
                        >
                          <Plus size={13} aria-hidden />
                          Jour {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        ajouterJournees(
                          segments.map((_, i) => i),
                          { gabarit: gabaritDeJournee, seule: journeeSeule },
                        )
                      }
                      className={`${BOUTON_SECOND} w-full`}
                    >
                      <Route size={15} aria-hidden />
                      {`Les ${segments.length} journées d’un coup`}
                    </button>
                  </Groupe>
                )}

                <Groupe
                  titre="Exporter"
                  aide="Un JPEG par planche, dans l'ordre du carrousel. La pagination du pied reste celle du lot."
                >
                  <button
                    type="button"
                    className={`${BOUTON_SECOND} w-full`}
                    disabled={etat.occupe || !carte}
                    onClick={() => exporter([active])}
                  >
                    <Download size={15} aria-hidden />
                    Cette planche seulement
                  </button>
                </Groupe>
              </>
            )}

            {/* ====================================================== TEXTE */}
            {onglet === "texte" && (
              <>
                <Groupe titre="En-tête et surtitre">
                  <label className={LEGENDE} htmlFor="entete">
                    En-tête <span className="font-normal opacity-60">— coin haut droit</span>
                  </label>
                  <input
                    id="entete"
                    type="text"
                    value={carte?.entete ?? ""}
                    placeholder="matériel — détail"
                    onChange={(e) => majCarte({ entete: e.target.value })}
                    className={CHAMP}
                  />
                  <Case
                    classe="mb-3 mt-1 text-[13px]"
                    label="en ambre"
                    coche={carte?.enteteAccent}
                    onChange={(v) => majCarte({ enteteAccent: v })}
                  />
                  <label className={LEGENDE} htmlFor="surtitre">
                    Surtitre <span className="font-normal opacity-60">— après le filet ambre</span>
                  </label>
                  <input
                    id="surtitre"
                    type="text"
                    value={carte?.surtitre ?? ""}
                    placeholder="pourquoi ce tour"
                    onChange={(e) => majCarte({ surtitre: e.target.value })}
                    className={CHAMP}
                  />
                  <Case
                    classe="mt-2"
                    label="Filet ambre devant le surtitre"
                    coche={carte?.surtitreFilet !== false}
                    onChange={(v) => majCarte({ surtitreFilet: v })}
                  />
                </Groupe>

                <Groupe titre="Composition">
                  <div className="mb-3">
                    <Choix
                      label="Alignement du texte"
                      valeur={carte?.alignement ?? (carte?.centrer ? "centre" : "gauche")}
                      options={ALIGNEMENTS.map((a) => ({ cle: a.cle, label: a.label }))}
                      onChange={(v) => majCarte({ alignement: v, centrer: v === "centre" })}
                    />
                  </div>
                  {/* Le surtitre ouvre le bloc par défaut : un filet, une
                      catégorie, puis le titre. Inversé, le titre devient
                      l'accroche et le surtitre la range en dessous. */}
                  <Case
                    label="Titre avant le surtitre"
                    coche={carte?.titreDevant}
                    onChange={(v) => majCarte({ titreDevant: v })}
                  />
                </Groupe>

                {["carte", "photo"].includes(carte?.gabarit) && (
                  <Groupe
                    titre="Ligne de chiffres"
                    aide="Sous le titre. Vide sur une carte, elle affiche ce que la trace sait dire ; écris ce que tu veux à la place, ou un espace pour la faire disparaître. Le balisage marche ici aussi, et un retour à la ligne aussi — c'est là que tient la description d'une journée."
                  >
                    <textarea
                      id="ligne-chiffres"
                      rows={2}
                      value={carte.pied ?? ""}
                      placeholder={
                        carte.gabarit === "carte" && trace
                          ? ligneFactuelle(trace, bilan)
                          : "188 km · 12 279 m D+"
                      }
                      onChange={(e) =>
                        // Le champ VIDÉ rend la main à la trace (`null`), pas au
                        // silence : c'est ce qu'on attend d'un placeholder.
                        majCarte({ pied: e.target.value === "" ? null : e.target.value })
                      }
                      className={`${CHAMP} resize-y`}
                      aria-label="Ligne de chiffres"
                    />
                    {carte.pied != null && (
                      <button
                        type="button"
                        onClick={() => majCarte({ pied: null })}
                        className="mt-1 font-heading text-[12px] text-brand-text/50 underline"
                      >
                        revenir aux chiffres de la trace
                      </button>
                    )}
                  </Groupe>
                )}

                {carte?.gabarit === "cloture" && (
                  <Groupe
                    titre="La clôture"
                    aide="La marque porte déjà son rond : l'anneau extérieur sert à faire un halo, pas à entourer."
                  >
                    <Case
                      classe="mb-3"
                      label="Anneau autour du logo"
                      coche={carte.cercleVisible}
                      onChange={(v) => majCarte({ cercleVisible: v })}
                    />
                    {/* « Merci d'avoir suivi » ANNONCÉ puis signé se lit comme
                        une fin ; signé puis annoncé se lit comme un en-tête. */}
                    <div className="mb-3">
                      <span className={LEGENDE}>Au-dessus du logo</span>
                      <div className="flex flex-col gap-1.5">
                        {[
                          ["surtitre", "Surtitre"],
                          ["titre", "Titre"],
                          ["texte", "Texte"],
                        ].map(([cle, label]) => (
                          <Case
                            key={cle}
                            label={label}
                            coche={estAuDessusDuLogo(carte, cle)}
                            onChange={(v) => majCarte({ [`clotureHaut_${cle}`]: v })}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <Curseur
                        id="cercle-taille"
                        label="Rayon"
                        valeur={carte.tailleCercle}
                        defaut={128}
                        min={60}
                        max={260}
                        pas={2}
                        format={(v) => `${Math.round(v)} px`}
                        onChange={(v) => majCarte({ tailleCercle: v ?? 128 })}
                      />
                    </div>
                    <div className="mb-3">
                      <Curseur
                        id="cercle-trait"
                        label="Épaisseur du trait"
                        valeur={carte.epaisseurCercle}
                        defaut={4}
                        min={1}
                        max={16}
                        pas={1}
                        format={(v) => `${Math.round(v)} px`}
                        onChange={(v) => majCarte({ epaisseurCercle: v ?? 4 })}
                      />
                    </div>
                    <Couleur
                      label="Couleur du cercle"
                      valeur={carte.couleurCercle}
                      defaut={theme.encre}
                      onChange={(v) => majCarte({ couleurCercle: v })}
                    />
                    <div className="mt-3 flex flex-col gap-1.5">
                      <Case
                        label="Ligne sous l'en-tête"
                        coche={carte.filetEntete === true}
                        onChange={(v) => majCarte({ filetEntete: v })}
                      />
                      <Case
                        label="Ligne au-dessus du pied"
                        coche={carte.filetPied === true}
                        onChange={(v) => majCarte({ filetPied: v })}
                      />
                    </div>
                  </Groupe>
                )}

                <Groupe titre="Titre">
                  <input
                    id="titre"
                    type="text"
                    value={carte?.titre ?? ""}
                    placeholder="le titre de la planche"
                    onChange={(e) => majCarte({ titre: e.target.value })}
                    className={`${CHAMP} mb-2`}
                    aria-label="Titre"
                  />
                  <p className={`${AIDE} mb-3`}>Le balisage marche aussi ici.</p>
                  {/* LE FILET, EN PLEINE VUE. Il existait déjà, replié au fond
                      d'un accordéon de mise en forme : personne ne l'a jamais
                      trouvé, et on a cru qu'il ne se dessinait pas. */}
                  <Case
                    classe="mb-2"
                    label="Filet sous le titre"
                    coche={carte?.filetTitre}
                    onChange={(v) => majCarte({ filetTitre: v })}
                  />
                  {carte?.filetTitre && (
                    <div className="mb-3 grid grid-cols-2 gap-2 pl-6">
                      <Taille
                        id="ft-largeur"
                        label="Longueur"
                        valeur={carte.filetTitreLargeur}
                        defaut={96}
                        max={900}
                        onChange={(v) => majCarte({ filetTitreLargeur: v })}
                      />
                      <Taille
                        id="ft-epaisseur"
                        label="Épaisseur"
                        valeur={carte.filetTitreEpaisseur}
                        defaut={4}
                        min={1}
                        max={40}
                        onChange={(v) => majCarte({ filetTitreEpaisseur: v })}
                      />
                      <div className="col-span-2">
                        <Couleur
                          label="Couleur du filet"
                          valeur={carte?.couleurFiletTitre}
                          defaut={theme.accent}
                          onChange={(v) => majCarte({ couleurFiletTitre: v })}
                        />
                      </div>
                    </div>
                  )}
                </Groupe>

                <Groupe
                  titre="Texte"
                  aide="Une ligne vide sépare deux paragraphes ; chaque ligne vide en plus aère. « > » décale un paragraphe entier. En début de ligne, « | » centre et « -- » réduit — pour CETTE ligne seulement."
                >
                  <p className="mb-1 whitespace-pre-line font-mono text-[12px] leading-snug text-brand-text/50">
                    {AIDE_BALISAGE}
                  </p>
                  <textarea
                    ref={texteRef}
                    id="texte"
                    rows={6}
                    value={carte?.texte ?? ""}
                    onChange={(e) => majCarte({ texte: e.target.value })}
                    className={`${CHAMP} resize-y`}
                  />
                  <div className="mb-3 mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => insererDansTexte("\n- ")}
                      className={BOUTON_DISCRET}
                    >
                      + point de liste
                    </button>
                    <button
                      type="button"
                      onClick={() => insererDansTexte("\n- :")}
                      className={BOUTON_DISCRET}
                      title="Un point dont la puce est l'icône qu'on nomme : « - :sac: sac 30 L »"
                    >
                      + point à icône
                    </button>
                    <button
                      type="button"
                      onClick={() => insererDansTexte("\n\n\n")}
                      className={BOUTON_DISCRET}
                      title="Une ligne vide de plus = une respiration de plus"
                    >
                      + respiration
                    </button>
                    <button
                      type="button"
                      onClick={() => insererDansTexte("\n> ")}
                      className={BOUTON_DISCRET}
                      title="Un paragraphe décalé — une note, une citation"
                    >
                      + retrait
                    </button>
                    <button
                      type="button"
                      onClick={() => insererDansTexte(":fleche:")}
                      className={BOUTON_DISCRET}
                      title="La flèche du swipe, la même que celle du pied de page"
                    >
                      + flèche
                    </button>
                    {/* LOCAL, pas global : ces préfixes ne valent que pour la
                        ligne où on les met. L'alignement et le corps de la
                        planche, eux, restent dans « Composition » et « Allure ». */}
                    <button
                      type="button"
                      onClick={() => insererDansTexte("\n| ")}
                      className={BOUTON_DISCRET}
                      title="Centrer CETTE ligne seulement (|> à droite, |< à gauche)"
                    >
                      + ligne centrée
                    </button>
                    <button
                      type="button"
                      onClick={() => insererDansTexte("\n-- ")}
                      className={BOUTON_DISCRET}
                      title="Réduire CETTE ligne seulement (++ pour agrandir, répétables)"
                    >
                      + ligne plus petite
                    </button>
                  </div>

                  {/* LA PALETTE EST VISUELLE. Une liste de clés (`col`, `neige`,
                      `riviere`…) demandait de se souvenir de ce que chaque mot
                      dessine ; on cherchait un pictogramme dans un glossaire. On
                      montre donc le dessin, et le mot dessous. */}
                  <p className={LEGENDE}>Icônes — les mêmes que les repères de /live</p>
                  <input
                    type="search"
                    value={filtreIcones}
                    placeholder="chercher — loupe, col, sac…"
                    onChange={(e) => setFiltreIcones(e.target.value)}
                    className={`${CHAMP} mb-1.5`}
                    aria-label="Chercher une icône"
                  />
                  <div className="grid max-h-52 grid-cols-4 gap-1 overflow-y-auto rounded-xl border border-brand-field/70 p-1.5 sm:grid-cols-5">
                    {icones.map(({ cle, Icone }) => (
                      <button
                        key={cle}
                        type="button"
                        onClick={() => insererDansTexte(`:${cle}:`)}
                        className="flex flex-col items-center gap-1 rounded-lg border border-brand-field bg-brand-paper px-1 py-2 text-brand-text/70 transition-colors hover:border-brand-primary-dark hover:text-brand-text motion-reduce:transition-none"
                        title={`Insérer :${cle}:`}
                      >
                        <Icone size={18} aria-hidden />
                        <span className="w-full truncate text-center font-heading text-[10px] leading-none opacity-70">
                          {cle}
                        </span>
                      </button>
                    ))}
                    {icones.length === 0 && (
                      <p className={`${AIDE} col-span-full px-1 py-2`}>
                        Aucune icône ne porte ce nom.
                      </p>
                    )}
                  </div>
                </Groupe>

                {carte?.gabarit === "etape" && (
                  <Groupe
                    titre="La colonne"
                    aide="À côté de la trace. Une ligne « Libellé = valeur » se compose comme une fiche : le libellé en petites capitales, la valeur en gros dessous. Le reste est du texte — listes, puces à icône, gras, ambre, couleurs et polices au mot, corps par ligne."
                  >
                    <textarea
                      ref={colonneRef}
                      id="colonne"
                      rows={5}
                      value={carte?.colonne ?? ""}
                      placeholder={"Distance = 57,5 km\nDénivelé positif = 4 356 m"}
                      onChange={(e) => majCarte({ colonne: e.target.value })}
                      className={`${CHAMP} resize-y`}
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => insererDansColonne("\nLibellé = ")}
                        className={BOUTON_DISCRET}
                        title="Le libellé en petites capitales, la valeur en gros dessous"
                      >
                        + donnée
                      </button>
                      <button
                        type="button"
                        onClick={() => insererDansColonne("\n- ")}
                        className={BOUTON_DISCRET}
                      >
                        + point de liste
                      </button>
                      <button
                        type="button"
                        onClick={() => insererDansColonne("\n- :")}
                        className={BOUTON_DISCRET}
                        title="Un point dont la puce est l'icône qu'on nomme : « - :sac: 8,4 kg »"
                      >
                        + point à icône
                      </button>
                      <button
                        type="button"
                        onClick={() => insererDansColonne(":fleche:")}
                        className={BOUTON_DISCRET}
                        title="La flèche du swipe, la même que celle du pied de page"
                      >
                        + flèche
                      </button>
                      <button
                        type="button"
                        onClick={() => insererDansColonne("[mono: ]")}
                        className={BOUTON_DISCRET}
                        title="La police « instrument » pour un chiffre — [serif: …] pour l'accent"
                      >
                        + en mono
                      </button>
                      <button
                        type="button"
                        onClick={() => insererDansColonne("\n-- ")}
                        className={BOUTON_DISCRET}
                        title="Réduire CETTE ligne seulement (++ pour agrandir, répétables)"
                      >
                        + ligne plus petite
                      </button>
                      {/* La journée MONTRÉE, pas une autre : c'est `jusquA` qui
                          dit de quelle étape la planche parle. Le texte déjà
                          écrit est REMPLACÉ — d'où l'infobulle qui le dit. */}
                      {segments[carte.jusquA ?? segments.length - 1] && (
                        <button
                          type="button"
                          className={BOUTON_DISCRET}
                          onClick={() =>
                            majCarte({
                              colonne: colonneDeJournee(
                                segments[carte.jusquA ?? segments.length - 1],
                              ),
                            })
                          }
                          title="Réécrit la colonne depuis les chiffres du jour — ce qui y est écrit est perdu"
                        >
                          <RotateCcw size={13} aria-hidden />
                          chiffres du jour
                        </button>
                      )}
                    </div>
                  </Groupe>
                )}

                <Groupe
                  titre="Zones libres"
                  aide="Du texte posé OÙ TU VEUX : ajoute-le, puis attrape-le sur la planche pour le placer. La position est relative au cadre, donc la même zone tombe au même endroit en carrousel, en story ou en carré."
                >
                  <div className="flex flex-col gap-3">
                    {(carte?.libres ?? []).map((z, i) => (
                      <div key={`libre-bloc-${i}`} className="rounded-xl border border-brand-field/70 p-2">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="font-heading text-[12px] font-medium text-brand-text/55">
                            Zone {i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => majLibre(i, { masquee: !z.masquee })}
                            className={`${BOUTON_DISCRET} ml-auto`}
                          >
                            {z.masquee ? "Afficher" : "Masquer"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              majCarte({ libres: carte.libres.filter((_, k) => k !== i) })
                            }
                            className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark"
                            aria-label={`Supprimer la zone ${i + 1}`}
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                        <textarea
                          id={`libre-${i}`}
                          rows={2}
                          value={z.texte ?? ""}
                          onChange={(e) => majLibre(i, { texte: e.target.value })}
                          className={`${CHAMP} mb-2 resize-y`}
                          aria-label={`Texte de la zone ${i + 1}`}
                        />
                        <div className="mb-2 grid grid-cols-2 gap-2">
                          <Taille
                            id={`libre-t-${i}`}
                            label="Corps"
                            valeur={z.taille}
                            defaut={CORPS.corps}
                            onChange={(v) => majLibre(i, { taille: v })}
                          />
                          <div>
                            <span className={LEGENDE}>Couleur</span>
                            <Couleur
                              label={`Couleur de la zone ${i + 1}`}
                              valeur={z.couleur}
                              defaut={theme.encre}
                              onChange={(v) => majLibre(i, { couleur: v })}
                            />
                          </div>
                        </div>
                        <div className="mb-2">
                          <Curseur
                            id={`libre-l-${i}`}
                            label="Largeur"
                            valeur={z.largeur}
                            defaut={0.62}
                            min={0.15}
                            max={1}
                            pas={0.02}
                            format={(v) => `${Math.round(v * 100)} %`}
                            onChange={(v) => majLibre(i, { largeur: v ?? 0.62 })}
                          />
                        </div>
                        <div className="mb-2">
                          <Choix
                            valeur={z.align ?? "gauche"}
                            options={ALIGNEMENTS.map((a) => ({ cle: a.cle, label: a.label }))}
                            onChange={(v) => majLibre(i, { align: v })}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Case
                            label="En gras"
                            coche={z.gras}
                            onChange={(v) => majLibre(i, { gras: v })}
                          />
                          <Case
                            label="Fond sous le texte"
                            coche={z.plaque}
                            onChange={(v) => majLibre(i, { plaque: v })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={ajouterLibre}
                    className={`${BOUTON_SECOND} mt-3 w-full`}
                  >
                    <Plus size={15} aria-hidden />
                    Une zone de plus
                  </button>
                </Groupe>

                <Groupe
                  titre="Listes"
                  aide="La puce de la planche vaut pour tous les points. Pour en changer UN seul, nomme-la en tête du point : « - :sac: sac 30 L » met le sac en puce. Ça marche avec les icônes comme avec les formes tracées."
                >
                  <label className={LEGENDE} htmlFor="puce">
                    Puce par défaut
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      id="puce"
                      value={carte?.puce ?? "point"}
                      onChange={(e) => majCarte({ puce: e.target.value })}
                      className={CHAMP}
                    >
                      {PUCES_SIMPLES.map((pc) => (
                        <option key={pc.cle} value={pc.cle}>
                          {pc.label}
                        </option>
                      ))}
                      {CLES_ICONES.map((cle) => (
                        <option key={cle} value={cle}>
                          Icône · {cle}
                        </option>
                      ))}
                    </select>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-field bg-brand-paper text-brand-accent-ink">
                      <Puce cle={carte?.puce ?? "point"} Icone={ICONES_PAR_CLE[carte?.puce]} />
                    </span>
                  </div>
                </Groupe>

                {carte?.gabarit === "journees" && (
                  <Groupe
                    titre="Les cases"
                    aide="Une case par journée. Chaque case porte sa portion de trace, sa portion de profil et son texte — le balisage marche ici aussi, les sauts de ligne compris."
                  >
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <Taille
                        id="cases-n"
                        label="Nombre de cases"
                        valeur={carte.casesN ?? cases.length}
                        defaut={cases.length}
                        min={1}
                        max={10}
                        onChange={(v) => majCarte({ casesN: v })}
                      />
                      <div>
                        <span className={LEGENDE}>Colonnes</span>
                        <Choix
                          valeur={carte.casesColonnes ?? 1}
                          options={[
                            { cle: 1, label: "1" },
                            { cle: 2, label: "2" },
                          ]}
                          onChange={(v) => majCarte({ casesColonnes: v })}
                        />
                      </div>
                    </div>
                    <div className="mb-3 flex flex-col gap-1.5">
                      <Case
                        label="Portion de trace"
                        coche={carte.caseCarte !== false}
                        onChange={(v) => majCarte({ caseCarte: v })}
                      />
                      <Case
                        label="Portion de profil"
                        coche={carte.caseProfil !== false}
                        onChange={(v) => majCarte({ caseProfil: v })}
                      />
                      <Case
                        label="Filet entre les rangées"
                        coche={carte.caseFilet !== false}
                        onChange={(v) => majCarte({ caseFilet: v })}
                      />
                    </div>
                    <div className="mb-3">
                      <Taille
                        id="t-case"
                        label="Corps du texte des cases"
                        valeur={carte.tailleCase}
                        defaut={30}
                        onChange={(v) => majCarte({ tailleCase: v })}
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      {cases.map((c, i) => (
                        <div key={`case-${i}`} className="rounded-xl border border-brand-field/70 p-2">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="font-heading text-[12px] font-medium text-brand-text/55">
                              Case {i + 1}
                            </span>
                            <select
                              value={c.jour}
                              onChange={(e) => majCase(i, { jour: Number(e.target.value) })}
                              className={`${CHAMP} ml-auto w-auto py-1 text-[13px]`}
                              aria-label={`Journée de la case ${i + 1}`}
                            >
                              {segments.length === 0 && <option value={i}>aucune trace</option>}
                              {segments.map((sg, k) => (
                                <option key={`c${i}-j${sg.kmDebut}`} value={k}>
                                  Journée {k + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            id={`case-${i}`}
                            rows={2}
                            value={c.texte}
                            onChange={(e) => majCase(i, { texte: e.target.value })}
                            className={`${CHAMP} resize-y`}
                            aria-label={`Texte de la case ${i + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={regenererCases}
                      disabled={segments.length === 0}
                      className={`${BOUTON_SECOND} mt-3 w-full`}
                    >
                      <RotateCcw size={14} aria-hidden />
                      Réécrire depuis les journées
                    </button>
                  </Groupe>
                )}

                {AVEC_FICHE.includes(carte?.gabarit) && (
                  <Groupe
                    titre="Les lignes de la fiche"
                    aide="Un libellé à gauche, une valeur en gros à droite. Les valeurs sont du texte libre."
                  >
                    <div className="mb-2 flex flex-col gap-2">
                      {(carte.fiche ?? []).map((l, i) => (
                        <div key={`fiche-${i}`} className="flex items-center gap-1.5">
                          <input
                            id={`fiche-${i}`}
                            type="text"
                            value={l.label}
                            placeholder="libellé"
                            onChange={(e) => majFiche(i, { label: e.target.value })}
                            className={`${CHAMP} flex-1`}
                            aria-label={`Libellé de la ligne ${i + 1}`}
                          />
                          <input
                            type="text"
                            value={l.valeur}
                            placeholder="valeur"
                            onChange={(e) => majFiche(i, { valeur: e.target.value })}
                            className={`${CHAMP} flex-1`}
                            aria-label={`Valeur de la ligne ${i + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => majFiche(i, { accent: !l.accent })}
                            className={`rounded-lg border px-2 py-1.5 font-heading text-[13px] ${
                              l.accent
                                ? "border-brand-accent-dark bg-brand-accent/25 text-brand-accent-ink"
                                : "border-brand-field text-brand-text/40"
                            }`}
                            aria-label={`Valeur en ambre, ligne ${i + 1}`}
                          >
                            A
                          </button>
                          <button
                            type="button"
                            onClick={() => majCarte({ fiche: carte.fiche.filter((_, k) => k !== i) })}
                            className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark"
                            aria-label={`Supprimer la ligne ${i + 1}`}
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={BOUTON_SECOND}
                      onClick={() =>
                        majCarte({
                          fiche: [...(carte.fiche ?? []), { label: "", valeur: "", accent: false }],
                        })
                      }
                    >
                      <Plus size={15} aria-hidden />
                      Une ligne de plus
                    </button>
                  </Groupe>
                )}

                <Groupe titre="Pied de page">
                  <Case
                    classe="mb-3"
                    label={
                      <>
                        Numéroter cette planche{" "}
                        <span className="text-brand-text/45">
                          ({String(active + 1).padStart(2, "0")} / {String(cartes.length).padStart(2, "0")})
                        </span>
                      </>
                    }
                    coche={carte?.piedNumero !== false}
                    onChange={(v) => majCarte({ piedNumero: v })}
                  />
                  <label className={LEGENDE} htmlFor="fleche">
                    Flèche de swipe
                  </label>
                  <select
                    id="fleche"
                    value={carte?.piedFleche ?? "auto"}
                    onChange={(e) => majCarte({ piedFleche: e.target.value })}
                    className={`${CHAMP} mb-2`}
                    aria-label="Flèche de swipe"
                  >
                    {FLECHES.map((f) => (
                      <option key={f.cle} value={f.cle}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      id="pied-centre"
                      type="text"
                      value={carte?.piedCentre ?? ""}
                      placeholder="au milieu"
                      onChange={(e) => majCarte({ piedCentre: e.target.value })}
                      className={CHAMP}
                      aria-label="Pied de page, au milieu"
                    />
                    <input
                      id="pied-droite"
                      type="text"
                      value={carte?.piedDroite ?? ""}
                      placeholder="à droite (défaut : glisse →)"
                      onChange={(e) => majCarte({ piedDroite: e.target.value })}
                      className={CHAMP}
                      aria-label="Pied de page, à droite"
                    />
                  </div>
                </Groupe>
              </>
            )}

            {/* ====================================================== PHOTO */}
            {onglet === "photo" && (
              <>
                {!aPhoto && (
                  <Groupe titre="Photo">
                    <p className={AIDE}>
                      Les gabarits « Photo », « Bandeau » et « Clôture » portent une image.
                      Change de gabarit dans l&rsquo;onglet « Planche ».
                    </p>
                  </Groupe>
                )}
                {aPhoto && (
                  <Groupe titre="L'image">
                    <label className={`${BOUTON_SECOND} mb-3 w-full cursor-pointer`}>
                      <ImageUp size={16} aria-hidden />
                      <span className="truncate">{carte.nomImage || "Choisir une photo"}</span>
                      <input
                        type="file"
                        accept="image/*,.heic"
                        onChange={chargerPhoto}
                        className="sr-only"
                      />
                    </label>
                    <Curseur
                      id="ancrage"
                      label="Cadrage"
                      valeur={carte.ancrage}
                      defaut={0.5}
                      min={0}
                      max={1}
                      pas={0.01}
                      format={(v) => `${Math.round(v * 100)} %`}
                      onChange={(v) => majCarte({ ancrage: v ?? 0.5 })}
                    />
                    {carte.gabarit === "etape" && (
                      <>
                        <div className="mt-3">
                          <Curseur
                            id="etape-part"
                            label="Hauteur de la photo"
                            valeur={carte.bandeauPart}
                            defaut={0.26}
                            min={0.1}
                            max={0.55}
                            pas={0.01}
                            format={(v) => `${Math.round(v * 100)} %`}
                            onChange={(v) => majCarte({ bandeauPart: v ?? 0.26 })}
                          />
                        </div>
                        <div className="mt-3">
                          <Curseur
                            id="etape-remontee"
                            label="Remonter la photo"
                            valeur={carte.photoRemontee}
                            defaut={0}
                            min={0}
                            max={1}
                            pas={0.05}
                            format={(v) =>
                              v < 0.03 ? "sous l’en-tête" : v > 0.97 ? "jusqu’en haut" : `${Math.round(v * 100)} %`
                            }
                            onChange={(v) => majCarte({ photoRemontee: v ?? 0 })}
                          />
                          <p className={`${AIDE} mt-1`}>
                            Elle grandit vers le HAUT — son bas ne bouge pas, donc le titre et la
                            trace restent en place. Passé la bande de marque, un voile revient sous
                            le logo et le filet s&rsquo;efface : un trait sur une photo n&rsquo;est
                            plus un filet.
                          </p>
                        </div>
                      </>
                    )}
                    {carte.gabarit === "bandeau" && (
                      <div className="mt-3">
                        <Curseur
                          id="bandeau-part"
                          label="Hauteur du bandeau"
                          valeur={carte.bandeauPart}
                          defaut={0.42}
                          min={0.2}
                          max={0.7}
                          pas={0.01}
                          format={(v) => `${Math.round(v * 100)} %`}
                          onChange={(v) => majCarte({ bandeauPart: v ?? 0.42 })}
                        />
                      </div>
                    )}
                    {carte.gabarit === "cloture" && carte.image && (
                      <div className="mt-3">
                        <Curseur
                          id="cloture-voile"
                          label="Voile sur la photo"
                          valeur={carte.voileCloture}
                          defaut={0.62}
                          min={0}
                          max={1}
                          pas={0.02}
                          format={(v) => `${Math.round(v * 100)} %`}
                          onChange={(v) => majCarte({ voileCloture: v ?? 0.62 })}
                        />
                      </div>
                    )}
                  </Groupe>
                )}

              </>
            )}

            {/* ====================================================== TRACE */}
            {onglet === "trace" && (
              <>
                <Groupe
                  titre="Charger une trace"
                  aide="Facultatif — seul le gabarit « Carte » en a besoin. Plusieurs fichiers d'un coup sont recollés bout à bout, dans l'ordre de leur nom, et chaque jonction devient une fin de journée."
                >
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={chargerAventure} className={BOUTON_SECOND}>
                      <MapIcon size={16} aria-hidden />
                      {liveConfig.aventure.nom}
                    </button>
                    <label className={`${BOUTON_SECOND} cursor-pointer`}>
                      <Route size={16} aria-hidden />
                      Un ou plusieurs .gpx
                      <input
                        type="file"
                        multiple
                        accept=".gpx,.json,application/gpx+xml,application/json"
                        onChange={chargerFichierTrace}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  {trace && (
                    <p className="mt-3 font-heading text-[13px] text-brand-text/60">
                      {trace.totalKm.toFixed(1).replace(".", ",")} km · {trace.dPlusM} m D+
                      {trace.coords.length === 0 && " · sans coordonnées (gabarit Carte indisponible)"}
                    </p>
                  )}
                </Groupe>

                <Groupe
                  titre="Trace de référence (cadrage)"
                  aide="Jamais dessinée. Elle fixe le cadre de la carte et l'échelle du profil, pour qu'une série J1, J1+J2, J1+J2+J3… ne saute pas d'une planche à l'autre."
                >
                  <label className={`${BOUTON_SECOND} w-full cursor-pointer`}>
                    <Route size={16} aria-hidden />
                    {traceCadre ? `${Math.round(traceCadre.totalKm)} km — cadre figé` : "Aucune"}
                    <input
                      type="file"
                      multiple
                      accept=".gpx,.json,application/gpx+xml,application/json"
                      onChange={chargerReference}
                      className="sr-only"
                    />
                  </label>
                  {traceCadre && (
                    <button
                      type="button"
                      onClick={() => setTraceCadre(null)}
                      className="mt-1 font-heading text-[12px] text-brand-text/50 underline"
                    >
                      retirer la référence
                    </button>
                  )}
                </Groupe>

                {trace && (
                  <Groupe
                    titre="Ce carrousel raconte"
                    aide={
                      trace.vecue
                        ? `Trace horodatée (${dureeCourte(trace.dureeSecondes)}) — l'atelier a supposé « après ».`
                        : undefined
                    }
                  >
                    <Choix
                      valeur={bilan}
                      options={[
                        { cle: false, label: "Avant le départ" },
                        { cle: true, label: "Après l'aventure" },
                      ]}
                      onChange={setBilan}
                    />
                  </Groupe>
                )}

                {/* Le découpage en journées sert AUX DEUX gabarits qui en
                    parlent : la carte le colorie, la grille en fait ses cases. */}
                {AVEC_TRACE.includes(carte?.gabarit) && trace && (
                  <>
                    <Groupe titre="La carte">
                      <div className="mb-3 flex flex-col gap-1.5">
                        <Case
                          label={
                            <>
                              Fond de carte topo
                              {!fond && trace.coords.length > 0 && (
                                <span className="text-brand-text/45"> (indisponible hors ligne)</span>
                              )}
                            </>
                          }
                          coche={carte.afficherFond !== false}
                          onChange={(v) => majCarte({ afficherFond: v })}
                        />
                        <Case
                          label="Profil altimétrique"
                          coche={carte.afficherProfil !== false}
                          onChange={(v) => majCarte({ afficherProfil: v })}
                        />
                      </div>
                      {carte.gabarit === "etape" && (
                        <div className="mb-3">
                          <Curseur
                            id="part-carte"
                            label="Largeur de la vignette"
                            valeur={carte.partCarte}
                            defaut={0.5}
                            min={0}
                            max={0.7}
                            pas={0.02}
                            format={(v) => (v < 0.03 ? "aucune" : `${Math.round(v * 100)} %`)}
                            onChange={(v) => majCarte({ partCarte: v })}
                          />
                          <p className={`${AIDE} mt-1`}>
                            La planche se coupe en deux : la trace à gauche, les chiffres à
                            droite, chacun centré sur SA moitié. À zéro, la vignette
                            dispara&icirc;t et le texte reprend toute la largeur.
                          </p>
                        </div>
                      )}
                      {segments.length > 1 && (
                        <>
                          <label className={LEGENDE} htmlFor="jusqu-a">
                            Afficher
                          </label>
                          {/* UN seul menu pour les trois cas : le tout, un
                              avancement, une étape isolée. Deux réglages côte à
                              côte auraient laissé fabriquer des combinaisons qui
                              ne veulent rien dire (« de J3 à J1 »). */}
                          <select
                            id="jusqu-a"
                            value={trancheAffichee}
                            onChange={(e) => majCarte(trancheDepuisLeMenu(e.target.value))}
                            className={`${CHAMP} mb-1`}
                          >
                            <option value="">Tout l&rsquo;itinéraire</option>
                            <optgroup label="L’avancement">
                              {segments.map((sg, i) => (
                                <option key={`jusqua-${sg.kmDebut}`} value={`jusqu:${i}`}>
                                  Jusqu&rsquo;à la journée {i + 1}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Une seule journée">
                              {segments.map((sg, i) => (
                                <option key={`seule-${sg.kmDebut}`} value={`seule:${i}`}>
                                  La journée {i + 1} seule
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <p className={AIDE}>
                            Une planche par valeur, et le cadre ne bouge pas d&rsquo;une planche à
                            l&rsquo;autre. « Avancement » révèle l&rsquo;itinéraire jour après jour ;
                            « une seule journée » montre l&rsquo;étape sur l&rsquo;itinéraire resté
                            en sourdine. La journée garde sa couleur et son étiquette dans les deux
                            cas.
                          </p>
                        </>
                      )}
                    </Groupe>

                  </>
                )}

                {[...AVEC_TRACE, "journees"].includes(carte?.gabarit) && trace && (
                  <>
                    <Groupe titre="Les journées">
                      <label className={LEGENDE} htmlFor="nb-jours">
                        Nombre de journées
                      </label>
                      <div className="mb-3 flex items-center gap-2">
                        <Nombre
                          id="nb-jours"
                          min={1}
                          max={12}
                          valeur={segments.length}
                          onChange={(v) =>
                            setCoupures(coupuresRegulieres(trace.totalKm, Math.round(v)))
                          }
                          classe={`${CHAMP} w-24`}
                        />
                        <button
                          type="button"
                          className={BOUTON_SECOND}
                          onClick={() =>
                            setCoupures(
                              coupuresDepuisWaypoints(liveConfig.aventure.waypoints, trace.totalKm),
                            )
                          }
                        >
                          Depuis les bivouacs
                        </button>
                      </div>

                      <p className={LEGENDE}>Fin de chaque journée, en kilomètres</p>
                      <div className="mb-3 flex flex-col gap-2">
                        {coupures.map((km, i) => (
                          <div key={`coupure-${i}`} className="flex items-center gap-2">
                            <span className="w-10 font-heading text-[13px] text-brand-text/55">
                              J{i + 1} →
                            </span>
                            <Nombre
                              pas="0.1"
                              valeur={Number(km.toFixed(1))}
                              onChange={(v) =>
                                setCoupures((cs) =>
                                  cs.map((c, k) => (k === i ? v : c)).sort((a, b) => a - b),
                                )
                              }
                              classe={`${CHAMP} w-28`}
                              aria-label={`Fin de la journée ${i + 1}, en kilomètres`}
                            />
                            <span className="font-heading text-[13px] text-brand-text/45">km</span>
                            <button
                              type="button"
                              onClick={() => setCoupures((cs) => cs.filter((_, k) => k !== i))}
                              className="ml-auto rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark"
                              aria-label={`Supprimer la coupure J${i + 1}`}
                            >
                              <Trash2 size={15} aria-hidden />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className={BOUTON_SECOND}
                          onClick={() =>
                            setCoupures((cs) =>
                              [
                                ...cs,
                                Math.min(
                                  trace.totalKm - 1,
                                  (cs[cs.length - 1] ?? 0) + trace.totalKm / 4,
                                ),
                              ].sort((a, b) => a - b),
                            )
                          }
                        >
                          <Plus size={15} aria-hidden />
                          Une journée de plus
                        </button>
                      </div>

                      {/* La COULEUR de chaque journée sert aux deux gabarits :
                          elle colore la trace sur la carte, et la portion mise
                          en avant dans chaque case de la grille. */}
                      <p className={LEGENDE}>Étiquettes et couleurs des journées</p>
                      <div className="flex flex-col gap-2">
                        {segments.map((seg, i) => {
                          const etq = carte.etiquettes?.[i] ?? {};
                          return (
                            <div key={`etq-${seg.kmDebut}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={etq.texte ?? etiquetteParDefaut(i)}
                                onChange={(e) => majEtiquette(i, { texte: e.target.value })}
                                className={`${CHAMP} flex-1`}
                                aria-label={`Étiquette de la journée ${i + 1}`}
                              />
                              <input
                                type="color"
                                value={etq.couleur ?? PALETTE_JOURS[i % PALETTE_JOURS.length]}
                                onChange={(e) => majEtiquette(i, { couleur: e.target.value })}
                                className="h-9 w-9 cursor-pointer rounded-lg border border-brand-field bg-transparent"
                                aria-label={`Couleur de la journée ${i + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => majEtiquette(i, { dx: 0, dy: 0 })}
                                className="rounded-full p-1.5 text-brand-text/45 hover:bg-brand-primary/15"
                                aria-label={`Replacer l'étiquette ${i + 1}`}
                              >
                                <RotateCcw size={14} aria-hidden />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className={`${AIDE} mt-2`}>
                        {segments
                          .map((s, i) => `J${i + 1} ${s.distanceKm.toFixed(1)} km / ${s.dPlusM} m D+`)
                          .join("  ·  ")}
                      </p>
                      <p className={`${AIDE} mt-2`}>
                        Une planche par journée s&rsquo;ajoute en un appui depuis
                        l&rsquo;onglet « Planche ».
                      </p>
                    </Groupe>
                  </>
                )}
              </>
            )}

            {/* ====================================================== ALLURE */}
            {onglet === "style" && (
              <>
                <Groupe
                  titre="Polices"
                  aide="Les trois familles de la charte. Le titre, le surtitre et le texte se règlent séparément."
                >
                  <div className="flex flex-col gap-3">
                    {[
                      { champ: "policeTitre", label: "Titre" },
                      { champ: "policeSurtitre", label: "Surtitre et libellés" },
                      { champ: "policeCorps", label: "Texte" },
                    ].map(({ champ, label }) => (
                      <Choix
                        key={champ}
                        label={label}
                        valeur={carte?.[champ] ?? "sans"}
                        options={POLICES.map((p) => ({ cle: p.cle, label: p.label.split(" —")[0] }))}
                        onChange={(v) => majCarte({ [champ]: v })}
                      />
                    ))}
                  </div>
                </Groupe>

                <Groupe
                  titre="Corps"
                  aide="En pixels d'une planche de 1080 de large. Les valeurs de la charte : titre 65, texte 38, filet ambre 10."
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Taille
                      id="t-titre"
                      label="Titre"
                      valeur={carte?.tailleTitre}
                      defaut={CORPS.titre}
                      onChange={(v) => majCarte({ tailleTitre: v })}
                    />
                    <Taille
                      id="t-corps"
                      label="Texte"
                      valeur={carte?.tailleCorps}
                      defaut={CORPS.corps}
                      onChange={(v) => majCarte({ tailleCorps: v })}
                    />
                    <Taille
                      id="t-surtitre"
                      label="Surtitre"
                      valeur={carte?.tailleSurtitre}
                      defaut={CORPS.surtitre}
                      onChange={(v) => majCarte({ tailleSurtitre: v })}
                    />
                    <Taille
                      id="t-filet"
                      label="Filet ambre"
                      valeur={carte?.epaisseurFilet}
                      defaut={CORPS.filet}
                      onChange={(v) => majCarte({ epaisseurFilet: v })}
                    />
                    <Taille
                      id="t-entete"
                      label="En-tête"
                      valeur={carte?.tailleEntete}
                      defaut={CORPS.entete}
                      onChange={(v) => majCarte({ tailleEntete: v })}
                    />
                    <Taille
                      id="t-pied"
                      label="Pied"
                      valeur={carte?.taillePied}
                      defaut={CORPS.pied}
                      onChange={(v) => majCarte({ taillePied: v })}
                    />
                    <Taille
                      id="t-logo"
                      label="Logo"
                      valeur={carte?.tailleLogo}
                      defaut={CORPS.logo}
                      onChange={(v) => majCarte({ tailleLogo: v })}
                    />
                    {carte?.gabarit === "etape" && (
                      <Taille
                        id="t-colonne"
                        label="Colonne"
                        valeur={carte?.tailleColonne}
                        defaut={Math.round(CORPS.corps * 0.8)}
                        onChange={(v) => majCarte({ tailleColonne: v })}
                      />
                    )}
                    {AVEC_FICHE.includes(carte?.gabarit) && (
                      <>
                        <Taille
                          id="t-fiche-l"
                          label="Fiche · libellés"
                          valeur={carte?.tailleFicheLabel}
                          defaut={CORPS.ficheLabel}
                          onChange={(v) => majCarte({ tailleFicheLabel: v })}
                        />
                        <Taille
                          id="t-fiche-v"
                          label="Fiche · valeurs"
                          valeur={carte?.tailleFicheValeur}
                          defaut={CORPS.ficheValeur}
                          onChange={(v) => majCarte({ tailleFicheValeur: v })}
                        />
                      </>
                    )}
                  </div>
                </Groupe>

                <Groupe
                  titre="Espacements"
                  aide="En parts du corps du texte. La respiration est la hauteur d'une ligne sautée en plus ; l'alinéa décale la première ligne de chaque paragraphe."
                >
                  <div className="flex flex-col gap-3">
                    <Curseur
                      id="e-titre"
                      label="Interligne du titre"
                      valeur={carte?.interligneTitre}
                      defaut={1.16}
                      min={0.85}
                      max={2}
                      pas={0.02}
                      onChange={(v) => majCarte({ interligneTitre: v })}
                    />
                    <Curseur
                      id="e-apres-titre"
                      label="Sous le titre"
                      valeur={carte?.apresTitre}
                      defaut={2.2}
                      min={0}
                      max={4}
                      pas={0.1}
                      format={(v) => `${v.toFixed(1)} corps`}
                      onChange={(v) => majCarte({ apresTitre: v })}
                    />
                    <Curseur
                      id="e-interligne"
                      label="Interligne du texte"
                      valeur={carte?.interligne}
                      defaut={ESPACEMENT.interligne}
                      min={1}
                      max={2.6}
                      pas={0.05}
                      onChange={(v) => majCarte({ interligne: v })}
                    />
                    <Curseur
                      id="e-blocs"
                      label="Entre deux paragraphes"
                      valeur={carte?.entreBlocs}
                      defaut={ESPACEMENT.entreBlocs}
                      min={0}
                      max={3}
                      pas={0.05}
                      onChange={(v) => majCarte({ entreBlocs: v })}
                    />
                    <Curseur
                      id="e-respiration"
                      label="Respiration (ligne sautée)"
                      valeur={carte?.respiration}
                      defaut={ESPACEMENT.respiration}
                      min={0}
                      max={4}
                      pas={0.05}
                      onChange={(v) => majCarte({ respiration: v })}
                    />
                    <Curseur
                      id="e-items"
                      label="Entre deux points de liste"
                      valeur={carte?.entreItems}
                      defaut={ESPACEMENT.entreItems}
                      min={0}
                      max={2}
                      pas={0.05}
                      onChange={(v) => majCarte({ entreItems: v })}
                    />
                    <Curseur
                      id="e-retrait"
                      label="Retrait des listes"
                      valeur={carte?.retraitListe}
                      defaut={ESPACEMENT.retraitListe}
                      min={0.4}
                      max={4}
                      pas={0.1}
                      onChange={(v) => majCarte({ retraitListe: v })}
                    />
                    <Curseur
                      id="e-alinea"
                      label="Alinéa (1re ligne)"
                      valeur={carte?.alinea}
                      defaut={ESPACEMENT.alinea}
                      min={0}
                      max={4}
                      pas={0.1}
                      onChange={(v) => majCarte({ alinea: v })}
                    />
                  </div>
                </Groupe>

                <Groupe
                  titre="Dégradés et voiles"
                  aide="1 = le voile de la charte, 0 l'éteint. La carte les a aussi : un fond topo enneigé n'a pas la densité d'un fond de forêt."
                >
                  <div className="flex flex-col gap-3">
                    <Curseur
                      id="d-haut"
                      label="Dégradé de l'en-tête"
                      valeur={carte?.degradeHaut === false ? 0 : carte?.degradeHaut}
                      defaut={carte?.gabarit === "carte" ? 0.8 : carte?.gabarit === "bandeau" ? 0.74 : 0.72}
                      min={0}
                      max={1}
                      pas={0.02}
                      format={(v) => `${Math.round(v * 100)} %`}
                      onChange={(v) => majCarte({ degradeHaut: v })}
                    />
                    <Curseur
                      id="d-haut-h"
                      label="Distance du dégradé (haut)"
                      valeur={carte?.degradeHautH}
                      defaut={carte?.gabarit === "photo" ? 240 : 224}
                      min={40}
                      max={1000}
                      pas={10}
                      format={(v) => `${Math.round(v)} px`}
                      onChange={(v) => majCarte({ degradeHautH: v })}
                    />
                    <Curseur
                      id="d-bas"
                      label={carte?.gabarit === "bandeau" ? "Fondu du bandeau" : "Voile du pied"}
                      valeur={carte?.degradeBas === false ? 0 : carte?.degradeBas}
                      defaut={1}
                      min={0}
                      max={1}
                      pas={0.02}
                      format={(v) => `${Math.round(v * 100)} %`}
                      onChange={(v) => majCarte({ degradeBas: v })}
                    />
                    <Curseur
                      id="d-bas-h"
                      label="Distance du dégradé (bas)"
                      valeur={carte?.degradeBasH}
                      defaut={carte?.gabarit === "bandeau" ? 238 : 783}
                      min={40}
                      max={1350}
                      pas={10}
                      format={(v) => `${Math.round(v)} px`}
                      onChange={(v) => majCarte({ degradeBasH: v })}
                    />
                    <Opacite
                      id="o-entete"
                      label="Opacité de l'en-tête"
                      valeur={carte?.enteteOpacite}
                      onChange={(v) => majCarte({ enteteOpacite: v })}
                    />
                    <Opacite
                      id="o-pied"
                      label="Opacité du pied"
                      valeur={carte?.piedOpacite}
                      onChange={(v) => majCarte({ piedOpacite: v })}
                    />
                  </div>
                </Groupe>

                <Groupe
                  titre="Fond sous le texte"
                  aide="L'autre façon de rendre un texte lisible sur une photo : au lieu d'assombrir toute l'image d'un dégradé, on pose un aplat SOUS les lettres, ligne par ligne. La photo reste entière."
                >
                  <Case
                    classe="mb-3"
                    label="Poser un fond sous les lettres"
                    coche={carte?.plaque}
                    onChange={(v) => majCarte({ plaque: v })}
                  />
                  {carte?.plaque && (
                    <div className="flex flex-col gap-3">
                      <Couleur
                        label="Couleur du fond"
                        valeur={carte.plaqueCouleur}
                        defaut={theme.fond}
                        onChange={(v) => majCarte({ plaqueCouleur: v })}
                      />
                      <Opacite
                        id="plq-op"
                        label="Opacité"
                        valeur={carte.plaqueOpacite}
                        defaut={0.88}
                        onChange={(v) => majCarte({ plaqueOpacite: v })}
                      />
                      <Curseur
                        id="plq-px"
                        label="Marge latérale"
                        valeur={carte.plaquePadX}
                        defaut={0.3}
                        min={0}
                        max={1.2}
                        pas={0.02}
                        onChange={(v) => majCarte({ plaquePadX: v })}
                      />
                      <Curseur
                        id="plq-py"
                        label="Marge verticale"
                        valeur={carte.plaquePadY}
                        defaut={0.24}
                        min={0}
                        max={1}
                        pas={0.02}
                        onChange={(v) => majCarte({ plaquePadY: v })}
                      />
                      <Curseur
                        id="plq-r"
                        label="Coins arrondis"
                        valeur={carte.plaqueRayon}
                        defaut={0.18}
                        min={0}
                        max={0.6}
                        pas={0.02}
                        onChange={(v) => majCarte({ plaqueRayon: v })}
                      />
                      {/* Un aplat s'arrête net et se lit comme une étiquette ;
                          le fondu le dissout dans la photo. La rallonge se
                          prend AU-DELÀ du texte, jamais dessous. */}
                      <Choix
                        label="Bord du fond"
                        valeur={carte.plaqueDegrade ?? "aucun"}
                        options={DEGRADES_PLAQUE.map((d) => ({ cle: d.cle, label: d.label }))}
                        onChange={(v) => majCarte({ plaqueDegrade: v })}
                      />
                      {(carte.plaqueDegrade ?? "aucun") !== "aucun" && (
                        <Curseur
                          id="plq-f"
                          label="Longueur du fondu"
                          valeur={carte.plaqueFondu}
                          defaut={0.4}
                          min={0.05}
                          max={1.2}
                          pas={0.05}
                          format={(v) => `${Math.round(v * 100)} %`}
                          onChange={(v) => majCarte({ plaqueFondu: v })}
                        />
                      )}
                      <div>
                        <span className={LEGENDE}>Sur quels textes</span>
                        <div className="flex flex-col gap-1.5">
                          {TEXTES_PLAQUABLES.map(({ cle, label }) => (
                            <Case
                              key={cle}
                              label={label}
                              coche={carte[`plaque_${cle}`] !== false}
                              onChange={(v) => majCarte({ [`plaque_${cle}`]: v })}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </Groupe>

                <Groupe
                  titre="Ombre des textes"
                  aide="Elle ne décore pas : elle fait le contraste SOUS les lettres, là où un voile assombrirait toute la photo. C'est ce qui rend un titre clair lisible sur un névé."
                >
                  <Case
                    classe="mb-3"
                    label="Ombre portée sur les textes"
                    coche={carte?.ombre}
                    onChange={(v) => majCarte({ ombre: v })}
                  />
                  {carte?.ombre && (
                    <div className="flex flex-col gap-3">
                      <Curseur
                        id="omb-flou"
                        label="Flou"
                        valeur={carte.ombreFlou}
                        defaut={18}
                        min={0}
                        max={80}
                        pas={1}
                        format={(v) => `${Math.round(v)} px`}
                        onChange={(v) => majCarte({ ombreFlou: v })}
                      />
                      <Curseur
                        id="omb-dy"
                        label="Décalage vertical"
                        valeur={carte.ombreDy}
                        defaut={6}
                        min={-40}
                        max={40}
                        pas={1}
                        format={(v) => `${Math.round(v)} px`}
                        onChange={(v) => majCarte({ ombreDy: v })}
                      />
                      <Curseur
                        id="omb-dx"
                        label="Décalage horizontal"
                        valeur={carte.ombreDx}
                        defaut={0}
                        min={-40}
                        max={40}
                        pas={1}
                        format={(v) => `${Math.round(v)} px`}
                        onChange={(v) => majCarte({ ombreDx: v })}
                      />
                      <Opacite
                        id="omb-op"
                        label="Densité"
                        valeur={carte.ombreOpacite}
                        defaut={0.5}
                        onChange={(v) => majCarte({ ombreOpacite: v })}
                      />
                      <Couleur
                        label="Couleur de l'ombre"
                        valeur={carte.ombreCouleur}
                        defaut="#000000"
                        onChange={(v) => majCarte({ ombreCouleur: v })}
                      />
                      {/* Séparément : un titre en très gros sur une photo veut
                          une ombre franche ; la pagination du pied, en 22 px,
                          n'en veut aucune — une ombre l'épaissit jusqu'à la
                          rendre sale. */}
                      <div>
                        <span className={LEGENDE}>Sur quels textes</span>
                        <div className="flex flex-col gap-1.5">
                          {TEXTES_OMBRABLES.map(({ cle, label }) => (
                            <Case
                              key={cle}
                              label={label}
                              coche={carte[`ombre_${cle}`] !== false}
                              onChange={(v) => majCarte({ [`ombre_${cle}`]: v })}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </Groupe>

                <Groupe titre="Bande d'en-tête">
                  <label className={LEGENDE} htmlFor="marque">
                    Ce qu&rsquo;elle porte
                  </label>
                  <select
                    id="marque"
                    value={carte?.marque ?? ""}
                    onChange={(e) => majCarte({ marque: e.target.value })}
                    className={`${CHAMP} mb-3`}
                  >
                    {MARQUES.map((mq) => (
                      <option key={mq.cle} value={mq.cle}>
                        {mq.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-col gap-1.5">
                    <Case
                      label="Ligne sous l'en-tête"
                      coche={carte?.filetEntete !== false}
                      onChange={(v) => majCarte({ filetEntete: v })}
                    />
                    <Case
                      label="Ligne au-dessus du pied"
                      coche={carte?.filetPied !== false}
                      onChange={(v) => majCarte({ filetPied: v })}
                    />
                  </div>
                </Groupe>

                <Groupe titre="Couleurs">
                  <div className="grid grid-cols-2 gap-3">
                    <Couleur
                      label="Titre"
                      valeur={carte?.couleurTitre}
                      defaut={theme.encre}
                      onChange={(v) => majCarte({ couleurTitre: v })}
                    />
                    <Couleur
                      label="Texte"
                      valeur={carte?.couleurCorps}
                      defaut="#BBBBBB"
                      onChange={(v) => majCarte({ couleurCorps: v })}
                    />
                    <Couleur
                      label="Ambre"
                      valeur={carte?.couleurAccent}
                      defaut={theme.accent}
                      onChange={(v) => majCarte({ couleurAccent: v })}
                    />
                    <Couleur
                      label="Fond"
                      valeur={carte?.couleurFond}
                      defaut={theme.fond}
                      onChange={(v) => majCarte({ couleurFond: v })}
                    />
                    <Couleur
                      label="Logo"
                      valeur={carte?.couleurLogo}
                      defaut={theme.accent}
                      onChange={(v) => majCarte({ couleurLogo: v })}
                    />
                    <Couleur
                      label="Filet du titre"
                      valeur={carte?.couleurFiletTitre}
                      defaut={theme.accent}
                      onChange={(v) => majCarte({ couleurFiletTitre: v })}
                    />
                  </div>
                </Groupe>

                <Groupe
                  titre="Propager"
                  aide="Une NOUVELLE planche hérite déjà de cette allure. Ce bouton sert à l'autre cas : avoir changé d'avis alors que les planches existent déjà."
                >
                  <button
                    type="button"
                    onClick={diffuserStyle}
                    disabled={cartes.length < 2}
                    className={`${BOUTON_SECOND} w-full`}
                  >
                    Appliquer cette allure aux {Math.max(0, cartes.length - 1)} autres
                  </button>
                </Groupe>
              </>
            )}

            {/* ====================================================== PROJET */}
            {onglet === "projet" && (
              <>
                {/* Sur téléphone, la barre haute n'a la place que du nom et de
                    l'export : le format et le thème du lot vivent ici. */}
                <div className="lg:hidden">
                  <Groupe titre="Format et thème">
                    <div className="flex flex-col gap-2">{reglagesDuLot}</div>
                  </Groupe>
                </div>

                <Groupe
                  titre="Projets"
                  aide="Le travail en cours est gardé tout seul sur cet appareil — fermer l'onglet ne coûte rien. Un projet NOMMÉ, lui, ne bouge que quand tu l'enregistres."
                >
                  <div className="mb-3 flex gap-2">
                    <input
                      type="text"
                      value={nomProjet}
                      placeholder="nom du projet"
                      onChange={(e) => setNomProjet(e.target.value)}
                      className={CHAMP}
                      aria-label="Nom du projet, panneau"
                    />
                    <button
                      type="button"
                      onClick={enregistrer}
                      disabled={!nomProjet.trim() || etat.occupe}
                      className={BOUTON_SECOND}
                    >
                      <Save size={15} aria-hidden />
                      Enregistrer
                    </button>
                  </div>
                  {projets.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {projets.map((pr) => (
                        <div key={pr.nom} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => ouvrirProjet(pr.nom)}
                            className="flex-1 rounded-lg border border-brand-field bg-brand-paper px-3 py-2 text-left font-heading text-[14px] text-brand-text hover:border-brand-primary-dark"
                          >
                            {pr.nom}
                            <span className="ml-2 text-[12px] text-brand-text/45">
                              {pr.cartes} carte{pr.cartes > 1 ? "s" : ""}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => supprimerProjet(pr.nom).then(rafraichirProjets)}
                            className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark"
                            aria-label={`Supprimer le projet ${pr.nom}`}
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Groupe>

                <Groupe
                  titre="Fichier de secours"
                  aide="IndexedDB vit dans CE navigateur : un « effacer les données du site » emporte tout."
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={telechargerProjet}
                      className={`${BOUTON_SECOND} flex-1`}
                    >
                      <Download size={15} aria-hidden />
                      Exporter
                    </button>
                    <label className={`${BOUTON_SECOND} flex-1 cursor-pointer`}>
                      <Upload size={15} aria-hidden />
                      Importer
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={importer}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </Groupe>
              </>
            )}
    </CoqueAtelier>
  );
}
