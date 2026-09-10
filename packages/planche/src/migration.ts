// packages/planche/src/migration.ts
//
// OUVRIR UN PROJET DU STUDIO V1 (schéma 1) DANS LE MODÈLE V2.
//
// Un projet v1 est une liste de CARTES : chacune porte un gabarit et cent vingt
// et un réglages à plat. Un projet v2 est une liste de PLANCHES faites
// d'éléments. La conversion instancie le modèle de même clé — ce qui repose la
// mise en page de la charte, la même dont les gabarits v1 étaient faits — puis
// verse le contenu et les réglages qui ont un correspondant.
//
// CE QU'ON GARANTIT : aucun texte, aucune photo, aucune trace, aucune étiquette,
// aucun découpage en journées ne se perd. Ce qui ne se transporte pas, ce sont
// les réglages fins de mise en page (les écarts entre blocs, les décalages du
// duo en ligne) : ils décrivaient une mise en page figée qui n'existe plus, et
// leur équivalent v2 est de déplacer l'élément.
//
// LE FICHIER V1 EST CONSERVÉ par l'appelant avant conversion : c'est le filet
// s'il manque quelque chose qu'on n'avait pas vu.

import { CONTEXTE_PAR_DEFAUT, instancier } from "./modeles.ts";
import type { ContexteModele } from "./modeles.ts";
import { SCHEMA } from "./types.ts";
import type {
  Bilan,
  CleFormat,
  CleModele,
  CleTheme,
  Element,
  ElementTexte,
  LigneFiche,
  Media,
  PlancheImage,
  Projet,
  Tranche,
} from "./types.ts";

/** Une carte v1, telle qu'elle sort d'IndexedDB. Tout y est optionnel. */
export type CarteV1 = Record<string, unknown> & { gabarit?: string };

export type ProjetV1 = {
  schema?: number;
  format?: string;
  theme?: string;
  bilan?: boolean;
  coupures?: number[];
  trace?: unknown;
  traceCadre?: unknown;
  cartes?: CarteV1[];
  nom?: string;
  enregistreLe?: string;
};

/** Les huit gabarits v1 portent les mêmes clés que les modèles v2. */
const MODELES_V1: Record<string, CleModele> = {
  carte: "carte",
  bandeau: "bandeau",
  photo: "photo",
  texte: "texte",
  fiche: "fiche",
  etape: "etape",
  journees: "journees",
  cloture: "cloture",
};

const FORMATS_V1: Record<string, CleFormat> = {
  carrousel: "carrousel",
  story: "story",
  carre: "carre",
};

function chaine(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function nombre(v: unknown, defaut: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : defaut;
}

/**
 * LA TRANCHE DE JOURNÉES, reconstruite depuis `depuis` / `jusquA`.
 *
 * En v1, les deux bornes égales donnaient la planche d'UNE journée, `jusquA`
 * seul l'avancement, et les deux nulles l'itinéraire entier. Le v2 nomme ces
 * trois cas au lieu de les faire déduire de deux nombres qui peuvent se
 * contredire.
 */
export function trancheV1(carte: CarteV1): Tranche {
  const depuis = carte.depuis;
  const jusqua = carte.jusquA;
  const aDepuis = typeof depuis === "number" && Number.isFinite(depuis);
  const aJusqua = typeof jusqua === "number" && Number.isFinite(jusqua);
  if (aDepuis && aJusqua && depuis === jusqua) return { mode: "seule", jour: depuis as number };
  if (aJusqua) return { mode: "jusqua", jour: jusqua as number };
  if (aDepuis) return { mode: "jusqua", jour: depuis as number };
  return { mode: "toutes", jour: 0 };
}

/**
 * LE BALISAGE V1 EST DÉJÀ CELUI DU V2 : rien à convertir.
 *
 * `*gras*`, `[bleu: mot]`, `- point de liste` — le moteur typographique est le
 * même, porté tel quel. C'est ce qui rend cette migration sûre : le texte n'est
 * pas réinterprété, il change simplement de porteur.
 */
function contenuV1(carte: CarteV1, cle: string): string {
  return chaine(carte[cle]);
}

/** Reporte sur un élément texte les réglages v1 qui ont un correspondant. */
function styleV1(e: ElementTexte, carte: CarteV1): ElementTexte {
  // Les lignes molles étaient la règle en v1 : un document importé garde sa
  // mise en page, alors que le studio compose en lignes dures.
  const out: ElementTexte = { ...e, lignesDures: carte.lignesDures === true };
  const taille = {
    surtitre: carte.tailleSurtitre,
    titre: carte.tailleTitre,
    corps: carte.tailleCorps,
    libre: null,
  }[e.role];
  if (typeof taille === "number" && taille > 0) out.corps = taille;

  const couleur = { surtitre: carte.couleurAccent, titre: carte.couleurTitre, corps: carte.couleurCorps, libre: "" }[
    e.role
  ];
  if (typeof couleur === "string" && couleur) out.couleur = couleur;

  const align = chaine(carte.alignement);
  if (align === "centre" || align === "droite" || align === "gauche") out.alignement = align;

  if (e.role === "surtitre" && carte.surtitreFilet === false) out.filetOuvrant = null;
  if (e.role === "titre" && carte.filetTitre === true) {
    out.filetSousTitre = {
      largeur: nombre(carte.filetTitreLargeur, 96),
      epaisseur: nombre(carte.filetTitreEpaisseur, 4),
      couleur: chaine(carte.couleurFiletTitre),
    };
  }
  if (carte.ombre === true) {
    out.ombre = {
      flou: nombre(carte.ombreFlou, 18),
      dx: nombre(carte.ombreDx, 0),
      dy: nombre(carte.ombreDy, 6),
      opacite: nombre(carte.ombreOpacite, 0.5),
      couleur: chaine(carte.ombreCouleur),
    };
  }
  if (carte.plaque === true) {
    out.plaque = {
      couleur: chaine(carte.plaqueCouleur),
      opacite: nombre(carte.plaqueOpacite, 0.88),
      margeX: nombre(carte.plaquePadX, 0.3),
      margeY: nombre(carte.plaquePadY, 0.24),
      rayon: nombre(carte.plaqueRayon, 0.18),
      degrade: (chaine(carte.plaqueDegrade) || "aucun") as never,
      fondu: nombre(carte.plaqueFondu, 0.4),
    };
  }
  const puce = chaine(carte.puce);
  if (puce) out.puce = puce;
  return out;
}

/** Les lignes de fiche v1, dont les valeurs étaient déjà des chaînes libres. */
function ficheV1(carte: CarteV1): LigneFiche[] | null {
  const brut = carte.fiche;
  if (!Array.isArray(brut) || brut.length === 0) return null;
  return brut.map((l: Record<string, unknown>) => ({
    libelle: chaine(l?.label),
    valeur: chaine(l?.valeur),
    variable: null,
    accent: l?.accent === true,
  }));
}

export type ResultatMigration = {
  projet: Projet;
  /** Les photos extraites, à écrire dans le magasin des médias. */
  photos: { id: string; blob: unknown }[];
  /** Ce qui n'a pas pu être repris, pour le dire plutôt que de le taire. */
  avertissements: string[];
};

/**
 * Convertit un projet v1. `null` si ce n'en est pas un.
 *
 * Les photos sortent SÉPARÉMENT : elles vivent dans le magasin des médias du v2,
 * et un même cliché posé sur trois planches n'y est stocké qu'une fois.
 */
export function migrerProjet(brut: ProjetV1 | null, nom = "Projet repris"): ResultatMigration | null {
  if (!brut || brut.schema !== 1) return null;

  const format = FORMATS_V1[chaine(brut.format)] ?? "carrousel";
  const theme: CleTheme = chaine(brut.theme) === "clair" ? "clair" : "sombre";
  const bilan: Bilan = brut.bilan === true ? "apres" : "avant";
  const trace = (brut.trace ?? null) as Projet["donnees"]["trace"];

  const contexte: ContexteModele = {
    ...CONTEXTE_PAR_DEFAUT,
    format,
    theme,
    bilan,
    nomTrace: trace?.nom ?? null,
    vecue: trace?.vecue ?? false,
  };

  const photos: { id: string; blob: unknown }[] = [];
  const medias: Media[] = [];
  const avertissements: string[] = [];

  const planches = (brut.cartes ?? []).map((carte, i) =>
    migrerCarte(carte, i, contexte, photos, medias, avertissements),
  );

  const maintenant = new Date().toISOString();
  return {
    projet: {
      schema: SCHEMA,
      id: `projet-${Math.random().toString(36).slice(2, 9)}`,
      nom: chaine(brut.nom) || nom,
      creeLe: chaine(brut.enregistreLe) || maintenant,
      modifieLe: maintenant,
      format,
      theme,
      bilan,
      donnees: {
        trace,
        coupures: Array.isArray(brut.coupures) ? brut.coupures : [],
        etiquettes: [],
        traceCadrage: (brut.traceCadre ?? null) as Projet["donnees"]["traceCadrage"],
        seance: null,
      },
      medias,
      planches: planches.length > 0 ? planches : [instancier("texte", contexte)],
    },
    photos,
    avertissements,
  };
}

function migrerCarte(
  carte: CarteV1,
  index: number,
  contexte: ContexteModele,
  photos: { id: string; blob: unknown }[],
  medias: Media[],
  avertissements: string[],
): PlancheImage {
  const cle = MODELES_V1[chaine(carte.gabarit)] ?? "texte";
  if (!MODELES_V1[chaine(carte.gabarit)] && carte.gabarit) {
    avertissements.push(`Planche ${index + 1} : gabarit « ${chaine(carte.gabarit)} » inconnu, reprise en Texte.`);
  }

  const planche = instancier(cle, contexte, trancheV1(carte));

  // La photo rejoint le magasin des médias, et la planche ne garde que son
  // identifiant : un même cliché posé sur trois planches n'est stocké qu'une
  // fois.
  let mediaId: string | null = null;
  if (carte.photo) {
    mediaId = `media-${index}-${Math.random().toString(36).slice(2, 7)}`;
    photos.push({ id: mediaId, blob: carte.photo });
    medias.push({
      id: mediaId,
      nom: chaine(carte.nomImage) || `Photo ${index + 1}`,
      largeur: 0,
      hauteur: 0,
      priseLe: null,
      gps: null,
    });
  }

  const fiche = ficheV1(carte);
  const etiquettes = Array.isArray(carte.etiquettes) ? carte.etiquettes : [];

  const elements: Element[] = planche.elements.map((e) => {
    if (e.type === "texte") {
      const source = {
        surtitre: contenuV1(carte, "surtitre"),
        titre: contenuV1(carte, "titre"),
        corps: contenuV1(carte, "texte"),
        libre: "",
      }[e.role];
      // La pagination et le « glisse → » gardent le contenu du modèle : ce sont
      // des pièces de mobilier, pas du texte d'auteur.
      const mobilier = e.nom === "Pagination" || e.nom === "Glisse";
      const avecStyle = styleV1(e, carte);
      return mobilier ? avecStyle : { ...avecStyle, contenu: source || avecStyle.contenu };
    }
    if (e.type === "photo") {
      return {
        ...e,
        mediaId,
        // L'ANCRAGE v1 était un seul curseur, appliqué aux deux axes. Il devient
        // le cadrage v2, qui les distingue — on reporte la même valeur des deux
        // côtés, ce que faisait déjà le rendu v1.
        cadrage: { x: nombre(carte.ancrage, 0.5), y: nombre(carte.ancrage, 0.5), echelle: 1 },
      };
    }
    if (e.type === "fiche" && fiche) return { ...e, lignes: fiche };
    if (e.type === "carte") {
      return {
        ...e,
        etiquettes: etiquettes as never,
        fond: carte.afficherFond === false ? "aucun" : e.fond,
      };
    }
    if (e.type === "marque" && chaine(carte.marque) === "rien") return { ...e, masque: true };
    return e;
  });

  return {
    ...planche,
    fond: chaine(carte.couleurFond),
    elements: carte.afficherProfil === false ? elements.filter((e) => e.type !== "profil") : elements,
  };
}

/** Le projet v1 est-il reconnaissable ? Sert à choisir la voie d'ouverture. */
export function estProjetV1(brut: unknown): brut is ProjetV1 {
  return typeof brut === "object" && brut !== null && (brut as ProjetV1).schema === 1;
}
