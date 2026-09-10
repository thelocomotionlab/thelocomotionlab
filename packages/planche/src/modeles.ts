// packages/planche/src/modeles.ts
//
// LES ONZE MODÈLES — un point de départ, plus un gabarit.
//
// Choisir un modèle INSTANCIE des éléments aux positions et aux styles de la
// charte ; ensuite tout se déplace. C'est la différence de fond avec la v1, où
// la mise en page était figée dans la fonction de rendu et où « bouger le
// titre » n'existait pas.
//
// LA GRAMMAIRE DU COMPTE, commune à presque tous : une bande d'en-tête discrète
// en capitales espacées, un surtitre ouvert d'un filet ambre, un titre en 700,
// un pied paginé « 05 / 10 » avec « GLISSE → » tant qu'il reste une planche.
// Elle est posée par `mobilier()` — un seul endroit, donc deux carrousels à six
// mois d'écart se ressemblent encore.
//
// « REMETTRE LE MODÈLE » réaligne sans rien perdre : les contenus sont repris
// par RÔLE, et seules les positions et les styles reviennent à la charte.

import { CORPS, GRAISSES, LETTRAGE, MARGE, formatDe } from "./charte.ts";
import {
  carteNeuve,
  casesNeuves,
  ficheNeuve,
  filetNeuf,
  marqueNeuve,
  photoNeuve,
  profilNeuf,
  statNeuve,
  texteNeuf,
} from "./fabrique.ts";
import type { Format } from "./charte.ts";
import type {
  Bilan,
  CleFormat,
  CleModele,
  CleTheme,
  Element,
  ElementTexte,
  PlancheImage,
  PlancheSurvol,
  Tranche,
} from "./types.ts";

export type ContexteModele = {
  format: CleFormat;
  theme: CleTheme;
  bilan: Bilan;
  /** Le nom de la trace, quand il y en a une — le titre par défaut d'une carte. */
  nomTrace: string | null;
  /** La trace est-elle VÉCUE : « La sortie » plutôt que « L'itinéraire ». */
  vecue: boolean;
};

export const CONTEXTE_PAR_DEFAUT: ContexteModele = {
  format: "carrousel",
  theme: "sombre",
  bilan: "apres",
  nomTrace: null,
  vecue: false,
};

/* -------------------------------------------------- pixels de charte → fractions */

/** Une boîte donnée en pixels de charte, ramenée en fractions du format. */
function boite(f: Format, x: number, y: number, l: number, h: number) {
  return { x: x / f.width, y: y / f.height, l: l / f.width, h: h / f.height };
}

/** La largeur utile entre les deux marges. */
function utile(f: Format): number {
  return f.width - MARGE * 2;
}

/**
 * Le haut du contenu, sous la bande d'en-tête — et sous la zone qu'Instagram
 * recouvre, en story.
 */
function hautDuContenu(f: Format): number {
  return Math.max(MARGE + 120, (f.zoneSure?.top ?? 0) + 40);
}

/** Le bas du contenu, au-dessus du pied. */
function basDuContenu(f: Format): number {
  return Math.min(f.height - MARGE - 90, (f.zoneSure?.bottom ?? f.height) - 40);
}

/* ------------------------------------------------------------- le mobilier */

export type OptionsMobilier = {
  entete?: boolean;
  pied?: boolean;
};

/**
 * LA BANDE D'EN-TÊTE ET LE PIED, la signature d'un carrousel du labo.
 *
 * Ils sont posés comme des éléments ordinaires : déplaçables, masquables,
 * supprimables. La charte n'est pas une prison — elle donne le point de départ,
 * et « Remettre le modèle » sait revenir.
 */
/** L'allure du pied : les capitales espacées de la charte, en petit. */
const PIED = {
  corps: CORPS.pied,
  graisse: GRAISSES.appuye,
  casse: "capitales" as const,
  lettrage: LETTRAGE.etiquette,
  filetOuvrant: null,
};

export function mobilier(f: Format, o: OptionsMobilier = {}): Element[] {
  const out: Element[] = [];
  const hautEntete = f.zoneSure ? f.zoneSure.top + 24 : MARGE;

  if (o.entete !== false) {
    out.push(marqueNeuve(boite(f, MARGE, hautEntete, 520, CORPS.logo), { variante: "logo-nom" }));
    out.push(
      filetNeuf(boite(f, MARGE, hautEntete + CORPS.logo + 26, utile(f), 2), {
        remplissage: null,
        nom: "Filet d'en-tête",
      } as never),
    );
  }

  if (o.pied !== false) {
    const basPied = (f.zoneSure?.bottom ?? f.height) - MARGE - CORPS.pied;
    out.push(
      filetNeuf(boite(f, MARGE, basPied - 34, utile(f), 2), {
        remplissage: null,
        nom: "Filet de pied",
      } as never),
    );
    // Le pied porte les capitales espacées de la charte, mais son RÔLE est
    // « libre » : ce n'est pas un surtitre. Le rôle dit la place dans la
    // hiérarchie du compte, et c'est lui qui décide de ce qui suit un texte
    // quand on change de modèle — une pagination n'a rien à voler à personne.
    out.push(
      texteNeuf(boite(f, MARGE, basPied, 320, CORPS.pied * 1.4), "{planche} / {planches}", "libre", {
        nom: "Pagination",
        ...PIED,
      } as Partial<ElementTexte>),
    );
    out.push(
      texteNeuf(
        boite(f, f.width - MARGE - 320, basPied, 320, CORPS.pied * 1.4),
        "glisse :fleche:",
        "libre",
        { nom: "Glisse", alignement: "droite", ...PIED } as Partial<ElementTexte>,
      ),
    );
  }
  return out;
}

/**
 * Le surtitre et le titre, le bloc d'entrée du regard.
 *
 * Le titre part sur `{nom}` plutôt que sur le nom recopié à l'instanciation :
 * une trace chargée APRÈS la planche remplit alors le titre toute seule, au lieu
 * de laisser un blanc qu'il faut penser à combler. Sans trace, la variable
 * retombe sur le nom du projet — jamais sur un tiret.
 */
/** La hauteur qu'un en-tête occupe : surtitre, puis titre sur deux lignes. */
const HAUTEUR_ENTETE = CORPS.surtitre * 2.1 + CORPS.titre * 2.4;

function enTete(f: Format, c: ContexteModele, y: number, surtitre?: string): Element[] {
  const mot = surtitre ?? (c.vecue ? "la sortie" : "l'itinéraire");
  return [
    texteNeuf(boite(f, MARGE, y, utile(f), CORPS.surtitre * 1.6), mot, "surtitre"),
    texteNeuf(
      boite(f, MARGE, y + CORPS.surtitre * 2.1, utile(f), CORPS.titre * 2.4),
      "{nom}",
      "titre",
    ),
  ];
}

/* --------------------------------------------------------------- les modèles */

export type Modele = {
  cle: CleModele;
  label: string;
  aide: string;
  /** Les formats où le modèle a du sens. Vide = tous. */
  formats?: CleFormat[];
  elements(f: Format, c: ContexteModele): Element[];
};

const LIGNE_FACTUELLE = "{distance} km  ·  {dplus} m D+  ·  {duree}";

/** L'air entre deux blocs d'une pile, en pixels de planche. */
const ECART_BLOCS = 40;

export const MODELES: Modele[] = [
  {
    cle: "carte",
    label: "Carte",
    aide: "L'itinéraire et son profil, découpés en journées.",
    elements: (f, c) => {
      const haut = hautDuContenu(f);
      const bas = basDuContenu(f);
      const titre = enTete(f, c, haut);
      const yChiffres = haut + CORPS.surtitre * 2.1 + CORPS.titre * 2.6;
      const yCarte = yChiffres + CORPS.corps * 2;
      const hProfil = 150;
      return [
        ...mobilier(f),
        ...titre,
        texteNeuf(
          boite(f, MARGE, yChiffres, utile(f), CORPS.corps * 1.4),
          LIGNE_FACTUELLE,
          "corps",
          { nom: "Chiffres" },
        ),
        carteNeuve(boite(f, MARGE, yCarte, utile(f), bas - yCarte - hProfil - 30)),
        profilNeuf(boite(f, MARGE, bas - hProfil, utile(f), hProfil)),
      ];
    },
  },
  {
    cle: "bandeau",
    label: "Bandeau",
    aide: "Une photo en bandeau haut, le texte dessous.",
    elements: (f, c) => {
      const hautPhoto = f.zoneSure ? f.zoneSure.top : 0;
      const hPhoto = Math.round(f.height * 0.42);
      const y = hautPhoto + hPhoto + 70;
      return [
        photoNeuve(boite(f, 0, hautPhoto, f.width, hPhoto), { nom: "Bandeau" } as never),
        ...mobilier(f),
        ...enTete(f, c, y),
        texteNeuf(
          boite(f, MARGE, y + CORPS.surtitre * 2.1 + CORPS.titre * 2.6, utile(f), CORPS.corps * 6),
          "",
          "corps",
        ),
      ];
    },
  },
  {
    cle: "photo",
    label: "Photo",
    aide: "Une photo plein cadre, le titre posé dessus.",
    elements: (f, c) => {
      const bas = basDuContenu(f);
      return [
        photoNeuve(boite(f, 0, 0, f.width, f.height), {
          fondDePlanche: true,
          nom: "Fond",
          degrades: { haut: 0.55, bas: 0.75, hauteur: 0.38 },
        } as never),
        ...mobilier(f),
        ...enTete(f, c, bas - CORPS.titre * 2.6 - CORPS.surtitre * 2.1),
      ];
    },
  },
  {
    cle: "texte",
    label: "Texte",
    aide: "Un surtitre, un titre, un paragraphe.",
    elements: (f, c) => {
      const haut = hautDuContenu(f) + 60;
      return [
        ...mobilier(f),
        ...enTete(f, c, haut),
        texteNeuf(
          boite(
            f,
            MARGE,
            haut + CORPS.surtitre * 2.1 + CORPS.titre * 2.6,
            utile(f),
            CORPS.corps * 8,
          ),
          "",
          "corps",
        ),
      ];
    },
  },
  {
    cle: "fiche",
    label: "Fiche",
    aide: "Des libellés à gauche, des valeurs en gros à droite.",
    elements: (f, c) => {
      const haut = hautDuContenu(f);
      const yFiche = haut + CORPS.surtitre * 2.1 + CORPS.titre * 2.6;
      const titre = enTete(f, c, haut) as ElementTexte[];
      titre[1]!.filetSousTitre = { largeur: 96, epaisseur: 4, couleur: "" };
      return [
        ...mobilier(f),
        ...titre,
        ficheNeuve(boite(f, MARGE, yFiche + 40, utile(f), basDuContenu(f) - yFiche - 60)),
      ];
    },
  },
  {
    cle: "etape",
    label: "Étape",
    aide: "Le compte rendu d'une journée : la photo fondue, le récit, la portion parcourue et ses chiffres.",
    elements: (f, c) => {
      const bas = basDuContenu(f);
      const hPhoto = Math.round(f.height * 0.26);
      const hautPhoto = f.zoneSure ? f.zoneSure.top : 0;
      const y = hautPhoto + hPhoto + 60;
      const hCarte = Math.round(f.height * 0.2);
      return [
        photoNeuve(boite(f, 0, hautPhoto, f.width, hPhoto), {
          nom: "Photo de l'étape",
          degrades: { haut: 0, bas: 0.9, hauteur: 0.5 },
        } as never),
        ...mobilier(f),
        texteNeuf(boite(f, MARGE, y, utile(f), CORPS.surtitre * 1.6), "jour {jour}", "surtitre"),
        texteNeuf(
          boite(f, MARGE, y + CORPS.surtitre * 2.1, utile(f), CORPS.titre * 1.4),
          "",
          "titre",
        ),
        texteNeuf(
          boite(f, MARGE, y + CORPS.surtitre * 2.1 + CORPS.titre * 1.6, utile(f), CORPS.corps * 5),
          "",
          "corps",
        ),
        carteNeuve(boite(f, MARGE, bas - hCarte, utile(f) * 0.44, hCarte), {
          fond: "aucun",
          nom: "Trace du jour",
        } as never),
        texteNeuf(
          boite(f, MARGE + utile(f) * 0.5, bas - hCarte, utile(f) * 0.5, hCarte),
          "{jour_distance} km\n{jour_dplus} m D+",
          "corps",
          { nom: "Chiffres du jour" },
        ),
      ];
    },
  },
  {
    cle: "journees",
    label: "Journées",
    aide: "L'espace découpé en cases : une journée par case, sa portion de trace et de profil.",
    elements: (f, c) => {
      const haut = hautDuContenu(f);
      const yCases = haut + CORPS.surtitre * 2.1 + CORPS.titre * 1.6;
      return [
        ...mobilier(f),
        ...enTete(f, c, haut, "les journées"),
        casesNeuves(boite(f, MARGE, yCases + 30, utile(f), basDuContenu(f) - yCases - 50)),
      ];
    },
  },
  {
    cle: "cloture",
    label: "Clôture",
    aide: "La marque cerclée, et le mot de la fin.",
    elements: (f) => {
      const cote = Math.round(f.width * 0.3);
      const cy = Math.round(f.height * 0.4);
      return [
        marqueNeuve(boite(f, (f.width - cote) / 2, cy - cote / 2, cote, cote), {
          variante: "cercle",
          nom: "Marque cerclée",
        } as never),
        texteNeuf(
          boite(f, MARGE, cy + cote * 0.75, utile(f), CORPS.titre * 2.4),
          "",
          "titre",
          { alignement: "centre" },
        ),
        // Pas de pied : une clôture ne se numérote pas et n'invite pas à glisser.
        ...mobilier(f, { pied: false }),
      ];
    },
  },
  {
    cle: "silhouette",
    label: "Story · Silhouette",
    aide: "La trace seule sur une photo, en story.",
    formats: ["story"],
    elements: (f, c) => {
      // LA PILE SE CALCULE DEPUIS LE BAS, dans l'ordre où on lit : la
      // silhouette, puis le nom. Poser chaque bloc à une distance choisie à la
      // main faisait se chevaucher le titre et ce qui le précède dès que la
      // charte changeait un corps.
      const bas = basDuContenu(f);
      const hCarte = 420;
      const yCarte = bas - HAUTEUR_ENTETE - ECART_BLOCS - hCarte;
      return [
        photoNeuve(boite(f, 0, 0, f.width, f.height), {
          fondDePlanche: true,
          nom: "Fond",
          degrades: { haut: 0.4, bas: 0.8, hauteur: 0.34 },
        } as never),
        ...mobilier(f, { pied: false }),
        carteNeuve(boite(f, MARGE, yCarte, utile(f), hCarte), {
          fond: "aucun",
          nom: "Silhouette",
          itineraireSourdine: false,
        } as never),
        ...enTete(f, c, yCarte + hCarte + ECART_BLOCS),
      ];
    },
  },
  {
    cle: "chiffres",
    label: "Story · Chiffres",
    aide: "Les chiffres de la sortie sur une photo, en story.",
    formats: ["story"],
    elements: (f, c) => {
      // Trois chiffres, le profil, puis le nom : la pile se calcule depuis le
      // bas pour que rien ne se chevauche quand la charte change un corps.
      const bas = basDuContenu(f);
      const large = Math.round(utile(f) / 3);
      const hChiffres = 150;
      const hProfil = 150;
      const yChiffres = bas - HAUTEUR_ENTETE - ECART_BLOCS - hProfil - ECART_BLOCS - hChiffres;
      const yProfil = yChiffres + hChiffres + ECART_BLOCS;
      return [
        photoNeuve(boite(f, 0, 0, f.width, f.height), {
          fondDePlanche: true,
          nom: "Fond",
          degrades: { haut: 0.4, bas: 0.85, hauteur: 0.36 },
        } as never),
        ...mobilier(f, { pied: false }),
        statNeuve(boite(f, MARGE, yChiffres, large, hChiffres), "distance", "km"),
        statNeuve(boite(f, MARGE + large, yChiffres, large, hChiffres), "dplus", "m D+"),
        statNeuve(boite(f, MARGE + large * 2, yChiffres, large, hChiffres), "duree", "durée"),
        profilNeuf(boite(f, MARGE, yProfil, utile(f), hProfil)),
        ...enTete(f, c, yProfil + hProfil + ECART_BLOCS),
      ];
    },
  },
];

const PAR_CLE = new Map(MODELES.map((m) => [m.cle, m]));

export function modeleDe(cle: CleModele): Modele | null {
  return PAR_CLE.get(cle) ?? null;
}

/** Les modèles proposables dans un format donné. */
export function modelesPour(format: CleFormat): Modele[] {
  return MODELES.filter((m) => !m.formats || m.formats.includes(format));
}

let compteurPlanche = 0;

/** Instancie une planche neuve depuis un modèle. */
export function instancier(
  cle: CleModele,
  c: ContexteModele = CONTEXTE_PAR_DEFAUT,
  tranche: Tranche = { mode: "toutes", jour: 0 },
): PlancheImage {
  const modele = modeleDe(cle);
  const f = formatDe(c.format);
  compteurPlanche += 1;
  return {
    id: `planche-${compteurPlanche.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: "image",
    nom: "",
    modele: cle,
    fond: "",
    tranche,
    elements: modele ? modele.elements(f, c) : mobilier(f),
  };
}

/**
 * SURVOL : la séance rejouée. Une planche à part, parce qu'elle a une durée.
 *
 * Son habillage est fait des MÊMES éléments qu'une planche image — on le
 * compose, on le déplace, on le propage. Ce qui change, c'est ce qu'il y a
 * dessous : une scène 3D au lieu d'un fond.
 */
export function instancierSurvol(c: ContexteModele = CONTEXTE_PAR_DEFAUT): PlancheSurvol {
  const f = formatDe(c.format);
  const large = Math.round(utile(f) / 4);
  compteurPlanche += 1;
  return {
    id: `survol-${compteurPlanche.toString(36)}`,
    type: "survol",
    nom: "Survol",
    modele: "survol",
    scene: {
      fond: "satellite",
      couleurParcourue: "",
      couleurRestante: "",
      epaisseur: 6,
      ciel: true,
    },
    camera: {
      mode: "suivre",
      pitch: 60,
      exageration: 1.3,
      douceur: 4,
      rotationMax: 25,
      zoomAuto: true,
      zoom: 14,
    },
    montage: {
      duree: 30,
      imagesParSeconde: 30,
      vitesse: "distance",
      melange: 0,
      retirerPauses: true,
      debut: null,
      fin: null,
      tenueDepart: 2,
      tenueArrivee: 3,
    },
    hud: [
      ...mobilier(f, { pied: false }),
      statNeuve(boite(f, MARGE, hautDuContenu(f), large, 120), "distance", "km"),
      statNeuve(boite(f, MARGE + large, hautDuContenu(f), large, 120), "allure", "/km"),
      statNeuve(boite(f, MARGE + large * 2, hautDuContenu(f), large, 120), "alt_max", "m"),
      statNeuve(boite(f, MARGE + large * 3, hautDuContenu(f), large, 120), "fc_moy", "bpm"),
      ...enTete(f, c, basDuContenu(f) - 320),
      profilNeuf(boite(f, MARGE, basDuContenu(f) - 140, utile(f), 140)),
    ],
  };
}

/* --------------------------------------------- changer de modèle sans perdre */

/**
 * Ce qui identifie un élément d'un modèle à l'autre.
 *
 * Un texte d'AUTEUR se reconnaît à son RÔLE seul : « Chiffres » d'une carte et
 * « Chiffres du jour » d'une étape disent la même chose à des places
 * différentes, et les distinguer par leur nom ferait perdre le texte au premier
 * changement de modèle. Plusieurs textes du même rôle se suivent dans l'ordre.
 *
 * Le MOBILIER (rôle « libre ») garde son nom : une pagination doit retrouver la
 * pagination, jamais le paragraphe le plus proche.
 */
function signature(e: Element): string {
  if (e.type === "texte") return e.role === "libre" ? `texte:libre:${e.nom}` : `texte:${e.role}`;
  return `${e.type}:${e.nom}`;
}

/** Le contenu d'un élément — ce qui doit survivre à un changement de modèle. */
function reprendre(neuf: Element, ancien: Element): Element {
  if (neuf.type === "texte" && ancien.type === "texte") {
    return { ...neuf, contenu: ancien.contenu };
  }
  if (neuf.type === "photo" && ancien.type === "photo") {
    return { ...neuf, mediaId: ancien.mediaId, cadrage: ancien.cadrage, retournee: ancien.retournee };
  }
  if (neuf.type === "fiche" && ancien.type === "fiche") return { ...neuf, lignes: ancien.lignes };
  if (neuf.type === "stat" && ancien.type === "stat") {
    return { ...neuf, variable: ancien.variable, valeurManuelle: ancien.valeurManuelle };
  }
  if (neuf.type === "carte" && ancien.type === "carte") {
    return { ...neuf, etiquettes: ancien.etiquettes, fond: ancien.fond };
  }
  return neuf;
}

/**
 * Change le modèle d'une planche EN GARDANT ce qui a été écrit.
 *
 * Le mappage se fait par RÔLE, pas par position : un titre reste un titre quand
 * il passe de « Carte » à « Étape », même si sa place change du tout au tout.
 * Ce qui n'a pas de correspondant dans le nouveau modèle est CONSERVÉ à la fin
 * de la liste plutôt que jeté — perdre un texte parce qu'on a changé d'avis sur
 * la mise en page serait le pire des échanges.
 */
export function changerModele(
  planche: PlancheImage,
  cle: CleModele,
  c: ContexteModele = CONTEXTE_PAR_DEFAUT,
): PlancheImage {
  const neuve = instancier(cle, c, planche.tranche);
  const restants = new Map<string, Element[]>();
  for (const e of planche.elements) {
    const s = signature(e);
    if (!restants.has(s)) restants.set(s, []);
    restants.get(s)!.push(e);
  }

  const elements = neuve.elements.map((neuf) => {
    const file = restants.get(signature(neuf));
    const ancien = file?.shift();
    return ancien ? reprendre(neuf, ancien) : neuf;
  });

  // Ce qui portait un contenu et n'a pas trouvé de place le garde : un texte
  // écrit ne disparaît pas parce qu'on a changé de modèle.
  const orphelins = [...restants.values()].flat().filter(porteQuelqueChose);

  return { ...planche, modele: cle, elements: [...elements, ...orphelins] };
}

/**
 * Ce qui mérite de survivre à un changement de modèle : ce que L'AUTEUR a mis.
 *
 * Le MOBILIER n'en est pas. Une pagination porte « {planche} / {planches} » et
 * un pied « glisse → », mais c'est le modèle qui les a écrits, pas Valentin :
 * les garder faisait apparaître le « glisse → » d'un carrousel au bas d'une
 * story, qu'on ne fait pas glisser. Un modèle qui n'a pas de pied n'en veut
 * pas, et le dire est tout ce que ce test doit faire.
 */
function porteQuelqueChose(e: Element): boolean {
  if (e.type === "texte") return e.role !== "libre" && e.contenu.trim() !== "";
  if (e.type === "photo") return e.mediaId !== null;
  if (e.type === "fiche") return e.lignes.length > 0;
  if (e.type === "stat") return e.valeurManuelle !== null;
  return false;
}

/** « Remettre le modèle » : les positions et les styles reviennent à la charte,
 *  les contenus restent. */
export function remettreLeModele(
  planche: PlancheImage,
  c: ContexteModele = CONTEXTE_PAR_DEFAUT,
): PlancheImage {
  return changerModele(planche, planche.modele, c);
}
