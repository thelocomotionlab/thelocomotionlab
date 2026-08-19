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
  FLECHES,
  FORMATS,
  GABARITS,
  MARQUES,
  PALETTE_JOURS,
  POLICES,
  TEXTES_OMBRABLES,
  THEMES,
  casesEffectives,
  chargerFond,
  dessinerCartePartage,
  dureeCourte,
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
const AVEC_PHOTO = ["photo", "bandeau", "cloture"];

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
  pied: { onglet: "texte", champ: () => "pied-centre" },
  fiche: { onglet: "texte", champ: () => "fiche-0" },
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
    /** gauche | centre | droite. La clôture est centrée d'office : c'est un
     *  bloc symétrique autour du logo. */
    alignement: gabarit === "cloture" ? "centre" : "gauche",
    /** Inverse l'ordre du surtitre et du titre. */
    titreDevant: false,
    /** Le filet ambre qui ouvre le surtitre. */
    surtitreFilet: true,
    /** Les filets sous l'en-tête et au-dessus du pied. */
    filetEntete: gabarit !== "cloture",
    filetPied: gabarit !== "cloture",
    /** N'afficher que les n+1 premières journées. `null` = tout. */
    jusquA: null,
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
    bandeauPart: 0.42,
    fiche: gabarit === "fiche" ? ficheParDefaut(trace, segments) : [],
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
  "epaisseurFilet",
  "policeTitre",
  "policeSurtitre",
  "policeCorps",
  "interligneTitre",
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
  "tailleCase",
  "casesColonnes",
  "caseCarte",
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
  const glisseRef = useRef(null);
  /** Un déplacement d'étiquette finit par un `click` : sans ce drapeau, lâcher
   *  une étiquette ouvrirait le panneau de ce qu'il y a dessous. */
  const aGlisseRef = useRef(false);
  const texteRef = useRef(null);
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
  const insererDansTexte = useCallback(
    (balise) => {
      const champ = texteRef.current;
      const actuel = carte?.texte ?? "";
      const debut = champ?.selectionStart ?? actuel.length;
      const fin = champ?.selectionEnd ?? actuel.length;
      majCarte({ texte: actuel.slice(0, debut) + balise + actuel.slice(fin) });
      requestAnimationFrame(() => {
        champ?.focus();
        champ?.setSelectionRange(debut + balise.length, debut + balise.length);
      });
    },
    [carte?.texte, majCarte],
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

  // La nouvelle planche devient l'active : on vient de la créer, c'est elle
  // qu'on veut voir. Son index est la longueur ACTUELLE de la liste.
  const ajouterCarte = useCallback(
    (gabarit) => {
      // Le style de la planche courante est repris : on continue sur la même
      // mise en forme au lieu de repartir de la charte à chaque ajout.
      setCartes((cs) => [
        ...cs,
        carteNeuve(gabarit, trace, segments, bilan, idNeuf(), styleDe(cs[active])),
      ]);
      setActive(cartes.length);
    },
    [trace, segments, bilan, cartes.length, active, idNeuf],
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
      if (carte?.gabarit !== "carte") return;
      const [x, y] = pointCanvas(e);
      // Du dernier au premier : c'est l'étiquette DESSUS qu'on attrape quand
      // deux se recouvrent, celle qu'on voit.
      const boites = boitesRef.current;
      for (let i = boites.length - 1; i >= 0; i -= 1) {
        const b = boites[i];
        if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
          const etq = carte.etiquettes?.[b.index] ?? {};
          glisseRef.current = { index: b.index, x0: x, y0: y, dx0: etq.dx ?? 0, dy0: etq.dy ?? 0 };
          aGlisseRef.current = false;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          return;
        }
      }
    },
    [carte, pointCanvas],
  );

  const onPointerMove = useCallback(
    (e) => {
      const g = glisseRef.current;
      if (!g) return;
      const [x, y] = pointCanvas(e);
      if (Math.abs(x - g.x0) > 2 || Math.abs(y - g.y0) > 2) aGlisseRef.current = true;
      majEtiquette(g.index, { dx: g.dx0 + (x - g.x0), dy: g.dy0 + (y - g.y0) });
    },
    [pointCanvas, majEtiquette],
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
        const id = regle.champ(z);
        // Deux images : la première monte le panneau, la seconde le trouve.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = document.getElementById(id);
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

  return (
    <div
      className={
        // La hauteur du poste de travail : tout l'écran sous la barre du studio.
        // Rien ne défile sauf le panneau — c'est ce qui fait qu'on voit toujours
        // la planche pendant qu'on la règle.
        // Enfant direct de la coque du studio (display:contents) : il prend
        // toute la hauteur qui reste sous la barre. Sur un téléphone, la page
        // défile et c'est l'aperçu qui se colle.
        "flex flex-col bg-brand-paper/35 lg:min-h-0 lg:flex-1 lg:overflow-hidden"
      }
    >
      {/* ---------------------------------------------------------- barre haute */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-brand-field/70 bg-brand-paper/70 px-3 py-2">
        <input
          type="text"
          value={nomProjet}
          placeholder="carrousel sans nom"
          onChange={(e) => setNomProjet(e.target.value)}
          className="min-w-0 flex-1 basis-40 rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-heading text-[15px] font-medium text-brand-text hover:border-brand-field focus:border-brand-primary-dark focus:outline-none"
          aria-label="Nom du projet"
        />
        <select
          value={formatCle}
          onChange={(e) => setFormatCle(e.target.value)}
          className="rounded-lg border border-brand-field bg-brand-paper px-2 py-1.5 font-heading text-[13px] text-brand-text focus:border-brand-primary-dark focus:outline-none"
          aria-label="Format"
        >
          {Object.values(FORMATS).map((f) => (
            <option key={f.cle} value={f.cle}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="flex rounded-full border border-brand-field bg-brand-paper p-0.5">
          {Object.values(THEMES).map((t) => (
            <button
              key={t.cle}
              type="button"
              onClick={() => setThemeCle(t.cle)}
              aria-pressed={themeCle === t.cle}
              className={`rounded-full px-3 py-1 font-heading text-[13px] transition-colors motion-reduce:transition-none ${
                themeCle === t.cle
                  ? "bg-brand-deep text-brand-bg"
                  : "text-brand-text/60 hover:text-brand-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={enregistrer}
          disabled={!nomProjet.trim() || etat.occupe}
          className={BOUTON_SECOND}
        >
          <Save size={15} aria-hidden />
          <span className="hidden sm:inline">Enregistrer</span>
        </button>
        <button
          type="button"
          className={BOUTON_PRINCIPAL}
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
      </header>

      {etat.message && (
        <p className="shrink-0 border-b border-brand-field/60 bg-brand-primary/12 px-4 py-2 font-heading text-[13px] text-brand-primary-dark">
          {etat.message}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ------------------------------------------------------------- scène */}
        {/* En grand écran elle ne défile pas : elle occupe la place qui reste.
            Sur un téléphone, la page défile — la planche se colle alors sous la
            barre du studio pour qu'on la voie pendant qu'on règle. */}
        {/* `contents` en petit écran, et il en faut : gardée, cette boîte
            n'enveloppe QUE la planche — le collage n'a alors aucune course et
            la planche défile hors de l'écran, exactement l'inverse du but sur
            un téléphone. En `contents`, ce qui colle devient un enfant direct
            de la colonne haute (planche + panneau) et retrouve sa course. */}
        <section className="contents lg:order-2 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-col">
          <div className="order-1 sticky top-[var(--apercu-top,84px)] z-20 flex min-h-0 flex-col gap-3 bg-brand-bg/95 px-3 py-3 backdrop-blur lg:static lg:order-none lg:flex-1 lg:bg-transparent lg:backdrop-blur-none">
            {/* Le plan de travail : un aplat neutre derrière la planche, pour
                qu'un fond clair ne se confonde pas avec la page. Il DÉFILE dès
                qu'on zoome — sinon agrandir couperait la planche au lieu de
                permettre d'en regarder un coin. */}
            <div
              onWheel={molette}
              className="flex min-h-0 flex-1 items-center justify-center overflow-auto lg:rounded-xl lg:bg-brand-text/5 lg:p-4"
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
                    zoom == null
                      ? "block h-auto max-h-[40vh] w-auto max-w-full cursor-pointer touch-none rounded-xl bg-brand-text/10 shadow-card lg:max-h-full"
                      : "block h-auto max-w-none shrink-0 cursor-pointer touch-none rounded-xl bg-brand-text/10 shadow-card"
                  }
                />
              )}
            </div>
            <div className="flex shrink-0 items-center justify-center gap-2">
              <Zoom valeur={zoom} onChange={setZoom} mesurer={zoomAffiche} />
            </div>
            <p className={`${AIDE} shrink-0 text-center`}>
              Clique dans la planche pour ouvrir le réglage correspondant.
              {carte?.gabarit === "carte" &&
                segments.length > 0 &&
                " Attrape une étiquette pour la déplacer."}
            </p>

            {/* --------------------------------------- la bande des vignettes */}
            <div className="shrink-0 border-t border-brand-field/60 pt-2">
              <button
                type="button"
                onClick={() => setBandeOuverte((v) => !v)}
                aria-expanded={bandeOuverte}
                className="mb-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-0.5 font-heading text-[11px] text-brand-text/50 hover:bg-brand-primary/10 hover:text-brand-text"
              >
                <ChevronDown
                  size={14}
                  aria-hidden
                  className={`transition-transform motion-reduce:transition-none ${
                    bandeOuverte ? "" : "-rotate-180"
                  }`}
                />
                {cartes.length} planche{cartes.length > 1 ? "s" : ""}
                {cartes.length > 1 && (
                  <span className="hidden opacity-70 sm:inline">— glisse pour réordonner</span>
                )}
              </button>
              <div className={`flex items-end gap-2 overflow-x-auto pb-1 ${bandeOuverte ? "" : "hidden"}`}>
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
                    className={`w-[76px] shrink-0 cursor-grab rounded-lg border p-1 text-left transition-colors select-none motion-reduce:transition-none ${
                      glissee === i ? "cursor-grabbing opacity-60 ring-2 ring-brand-primary-dark" : ""
                    } ${
                      i === active
                        ? "border-brand-primary-dark bg-brand-primary/20"
                        : "border-brand-field bg-brand-paper hover:border-brand-primary/60"
                    }`}
                  >
                    <Vignette
                      carte={c}
                      options={options}
                      format={format}
                      index={i}
                      bilan={bilan}
                    />
                    <span className="mt-1 block truncate font-heading text-[10px] leading-tight text-brand-text/55">
                      {i + 1}. {GABARITS.find((g) => g.cle === c.gabarit)?.label}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => ajouterCarte(carte?.gabarit ?? "texte")}
                  className="flex h-[95px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-field text-brand-text/50 hover:border-brand-primary-dark hover:text-brand-text"
                  aria-label="Ajouter une planche"
                >
                  <Plus size={18} aria-hidden />
                  <span className="font-heading text-[11px]">Ajouter</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- rail + panneau */}
        <div className="order-2 flex min-h-0 shrink-0 flex-col lg:order-1 lg:w-[404px] lg:flex-row lg:border-r lg:border-brand-field/70">
          <nav
            aria-label="Réglages"
            className="flex shrink-0 gap-1 overflow-x-auto border-y border-brand-field/70 bg-brand-paper/60 px-2 py-1.5 lg:w-[80px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-y-0 lg:border-r lg:py-2"
          >
            {ONGLETS.map(({ cle, label, Icone }) => (
              <button
                key={cle}
                type="button"
                onClick={() => setOnglet(cle)}
                aria-current={onglet === cle ? "page" : undefined}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 font-heading text-[11px] transition-colors motion-reduce:transition-none lg:w-full ${
                  onglet === cle
                    ? "bg-brand-primary/25 text-brand-text"
                    : "text-brand-text/55 hover:bg-brand-primary/10 hover:text-brand-text"
                }`}
              >
                <Icone size={19} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto lg:w-[324px]">
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
                  {carte?.gabarit === "carte" && !trace && (
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

                <Groupe titre="Ajouter une planche">
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
                    aide="Sous le titre. Vide sur une carte, elle affiche ce que la trace sait dire ; écris ce que tu veux à la place, ou un espace pour la faire disparaître. Le balisage marche ici aussi."
                  >
                    <input
                      id="ligne-chiffres"
                      type="text"
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
                      className={CHAMP}
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

                <Groupe titre="Listes">
                  <label className={LEGENDE} htmlFor="puce">
                    Puce
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

                {carte?.gabarit === "fiche" && (
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
                {carte?.gabarit === "carte" && trace && (
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
                      {segments.length > 1 && (
                        <>
                          <label className={LEGENDE} htmlFor="jusqu-a">
                            Afficher
                          </label>
                          <select
                            id="jusqu-a"
                            value={carte.jusquA ?? ""}
                            onChange={(e) =>
                              majCarte({
                                jusquA: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className={`${CHAMP} mb-1`}
                          >
                            <option value="">Tout l&rsquo;itinéraire</option>
                            {segments.map((sg, i) => (
                              <option key={`jusqua-${sg.kmDebut}`} value={i}>
                                Jusqu&rsquo;à la journée {i + 1}
                              </option>
                            ))}
                          </select>
                          <p className={AIDE}>
                            Une planche par valeur, et la série révèle l&rsquo;itinéraire jour après
                            jour. Le cadre, lui, ne bouge pas.
                          </p>
                        </>
                      )}
                    </Groupe>

                  </>
                )}

                {["carte", "journees"].includes(carte?.gabarit) && trace && (
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
                    {carte?.gabarit === "fiche" && (
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
          </div>
        </div>
      </div>
    </div>
  );
}
