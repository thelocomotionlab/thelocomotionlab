// packages/planche/src/types.ts
//
// LE MODÈLE DE DOCUMENT DU STUDIO (schéma 2).
//
// Le changement de fond par rapport au schéma 1 : une planche n'est plus un
// GABARIT avec cent vingt et un réglages plats, c'est une LISTE D'ÉLÉMENTS. Un
// gabarit devient un MODÈLE — un point de départ qui pose des éléments aux
// positions de la charte, après quoi chacun se prend, se déplace et se règle
// pour lui-même. C'est ce qui rend possible la sélection, les poignées, les
// calques et les groupes : il faut d'abord que la chose existe séparément.
//
// LES POSITIONS SONT DES FRACTIONS du format, jamais des pixels. Un carrousel
// 1080×1350 qu'on bascule en story 1080×1920 garde alors ses compositions
// relatives au lieu de tout entasser en haut. Les CORPS, eux, restent en pixels
// d'une planche de 1080 de large : c'est ainsi que la charte les énonce, et
// c'est le rapport au format qui fait la taille perçue.
//
// DEUX FAMILLES DE PLANCHES, un seul document : l'image fixe et Survol. Survol
// impose un modèle qui accepte une durée et un montage ; le porter ici plutôt
// que dans un second document évite d'avoir deux fois les projets, les médias,
// la trace et l'historique.

import type { Seance, Trace } from "@locomotionlab/trace";

export const SCHEMA = 2;

/* ------------------------------------------------------------------ le lot */

export type CleFormat = "carrousel" | "story" | "carre";
export type CleTheme = "sombre" | "clair";

/** L'auteur raconte-t-il ce qui va arriver, ou ce qui a eu lieu. */
export type Bilan = "avant" | "apres";

/* -------------------------------------------------------------- les boîtes */

/** Position et taille, en FRACTIONS du format ([0,1] pour un élément dedans). */
export type Boite = { x: number; y: number; l: number; h: number };

/** La même chose en pixels de planche, une fois le format connu. */
export type BoitePx = { x: number; y: number; l: number; h: number };

/* ------------------------------------------------------------- les éléments */

export type TypeElement =
  | "texte"
  | "photo"
  | "forme"
  | "icone"
  | "marque"
  | "carte"
  | "profil"
  | "stat"
  | "fiche"
  | "cases";

/**
 * Ce que tout élément porte.
 *
 * `verrouille` n'empêche pas de SÉLECTIONNER — seulement de déplacer. Un
 * élément qu'on ne peut pas atteindre est un élément qu'on ne peut pas
 * déverrouiller.
 */
export type ElementCommun = Boite & {
  id: string;
  /** Le nom lisible, celui qu'affiche le panneau Calques. */
  nom: string;
  /** Degrés, sens horaire, autour du centre de la boîte. */
  rotation: number;
  opacite: number;
  verrouille: boolean;
  masque: boolean;
  /**
   * LE GROUPE EST UNE ÉTIQUETTE, pas un conteneur.
   *
   * Un élément conteneur imposerait un arbre — coordonnées relatives, rendu
   * récursif, calques imbriqués — pour un service qui tient en une phrase :
   * prendre l'un, c'est prendre les autres. La même chaîne sur plusieurs
   * éléments suffit, et l'ordre des calques reste la liste à plat qu'il est.
   */
  groupe: string | null;
};

export type Alignement = "gauche" | "centre" | "droite";
export type Casse = "normale" | "capitales";
export type RoleTexte = "surtitre" | "titre" | "corps" | "libre";

export type Ombre = {
  flou: number;
  dx: number;
  dy: number;
  opacite: number;
  /** Vide = l'encre du thème. */
  couleur: string;
};

/** L'aplat posé sous les lettres, ligne par ligne. */
export type Plaque = {
  couleur: string;
  opacite: number;
  /** Marges en CORPS du texte, pas en pixels : elles suivent la taille. */
  margeX: number;
  margeY: number;
  rayon: number;
  degrade: "aucun" | "droite" | "gauche" | "bords";
  fondu: number;
};

export type Filet = { largeur: number; epaisseur: number; couleur: string };

export type ElementTexte = ElementCommun & {
  type: "texte";
  /**
   * LE CONTENU EST DU BALISAGE, pas un arbre.
   *
   * `*gras*`, `[bleu: mot]`, `- point de liste`, `Distance = 57,5 km` : la même
   * chaîne que lit le moteur typographique. Une seconde représentation
   * structurée obligerait à convertir dans les deux sens à chaque rendu, et
   * c'est exactement là que deux modèles finissent par diverger. L'édition en
   * place écrit ce balisage ; il reste lisible, diffable et copiable tel quel.
   */
  contenu: string;
  /**
   * ENTRÉE FAIT UNE LIGNE.
   *
   * Le moteur typographique sait faire les deux : recoller les lignes d'un
   * paragraphe comme le fait Markdown, ou les garder telles quelles. Dans un
   * studio où l'on tape dans l'image, la seconde est la seule qui ne surprenne
   * pas — d'où la valeur par défaut. Les documents de la v1 arrivent avec le
   * réglage qu'ils avaient, pour que leur mise en page ne bouge pas.
   */
  lignesDures: boolean;
  role: RoleTexte;
  /**
   * LE CORPS SE RÉDUIT POUR TENIR DANS LE CADRE.
   *
   * Un titre de modèle a la hauteur de deux lignes, et son contenu est `{nom}` —
   * qui vient d'un fichier GPX, où « GR®54 - Tour de l'Oisans et des Écrins
   * depuis La Chapelle-en-Valgaudemar » est un nom ordinaire. Sans ça il déborde
   * sur ses voisins et sort de la planche, et l'auteur n'a rien tapé qui
   * l'explique. D'où le réglage par défaut sur les titres et les surtitres, et
   * pas sur un corps de texte, où la taille qui change à la frappe surprendrait.
   */
  ajuster: boolean;
  /** La puce des points de liste — une forme tracée ou une clé d'icône. */
  puce: string;
  /** En pixels d'une planche de 1080 de large. */
  corps: number;
  /** 300 → 800 : c'est elle qui fait la hiérarchie, pas une seconde fonte. */
  graisse: number;
  italique: boolean;
  casse: Casse;
  /** Vide = l'encre du thème. */
  couleur: string;
  alignement: Alignement;
  interligne: number;
  /** Interlettrage, en em. */
  lettrage: number;
  ombre: Ombre | null;
  plaque: Plaque | null;
  /** Le filet ambre qui ouvre un surtitre. */
  filetOuvrant: Filet | null;
  /** Le filet court posé sous le titre. */
  filetSousTitre: Filet | null;
};

export type ElementPhoto = ElementCommun & {
  type: "photo";
  mediaId: string | null;
  /** Le cadrage DANS le cadre : décalage en fractions du cadre, et échelle. */
  cadrage: { x: number; y: number; echelle: number };
  retournee: boolean;
  /** Multiplicateurs autour de 1 ; 1 = la photo telle quelle. */
  reglages: { luminosite: number; contraste: number; saturation: number };
  voile: { couleur: string; opacite: number } | null;
  /** Les fondus vers le fond, en haut et en bas, et leur hauteur en fraction. */
  degrades: { haut: number; bas: number; hauteur: number } | null;
  coins: number;
  bordure: Filet | null;
  /** Verrouillée derrière tout, plein cadre : le fond des gabarits Photo,
   *  Étape et Clôture. */
  fondDePlanche: boolean;
};

export type ElementForme = ElementCommun & {
  type: "forme";
  forme: "rectangle" | "cercle" | "ligne" | "filet";
  remplissage: string | null;
  contour: Filet | null;
  coins: number;
};

export type ElementIcone = ElementCommun & {
  type: "icone";
  cle: string;
  couleur: string;
  epaisseur: number;
};

export type ElementMarque = ElementCommun & {
  type: "marque";
  variante: "logo" | "nom" | "logo-nom" | "cercle";
  /** Vide = l'ambre du thème : le logo est ambre, pas à l'encre du texte. */
  teinte: string;
};

/* ------------------------------------------- les éléments liés aux données */

export type FondCarte = "relief" | "topo" | "satellite" | "aucun";

/**
 * QUELLES JOURNÉES SONT MONTRÉES.
 *
 * `toutes` — l'itinéraire entier ; `jusqua` — l'avancement au soir du jour N ;
 * `seule` — la journée N seule, celle qu'on lit pour savoir où l'étape tombe
 * dans le tour. Carte, profil et chiffres d'une planche suivent la même tranche.
 */
export type Tranche = { mode: "toutes" | "jusqua" | "seule"; jour: number };

export type Etiquette = {
  id: string;
  /** L'index de la journée nommée. */
  segment: number;
  texte: string;
  icone: string | null;
  /** Le déplacement à la main depuis l'ancrage calculé, en fractions du cadre. */
  dx: number;
  dy: number;
};

export type ElementCarte = ElementCommun & {
  type: "carte";
  fond: FondCarte;
  /** Une couleur par journée, cyclique. */
  couleurs: string[];
  epaisseur: number;
  etiquettes: Etiquette[];
  depart: boolean;
  arrivee: boolean;
  /** L'itinéraire complet, en sourdine sous la tranche montrée. */
  itineraireSourdine: boolean;
};

export type ElementProfil = ElementCommun & {
  type: "profil";
  /** Une couleur pour TOUT le profil. Vide, chaque journée prend la sienne. */
  remplissage: string;
  /** Ce qu'il reste à parcourir, estompé. */
  restantEstompe: boolean;
  /**
   * Une aire par journée montrée, chacune dans sa couleur — les mêmes que la
   * carte, pour qu'un même jour se retrouve d'une pièce à l'autre.
   */
  parJournee: boolean;
  /** Une couleur par journée, cyclique. Vide = la palette de la charte. */
  couleurs: string[];
};

/** Les variables qu'un texte ou un chiffre peut porter. */
export type CleVariable =
  | "distance"
  | "dplus"
  | "dmoins"
  | "duree"
  | "allure"
  | "vitesse"
  | "fc_moy"
  | "fc_max"
  /** La FC et l'altitude À L'INSTANT : elles ne veulent rien dire sur une
   *  planche fixe, et c'est le survol qui les fait battre. */
  | "fc"
  | "altitude"
  | "cadence"
  | "alt_max"
  | "jour"
  | "jour_distance"
  | "planche"
  | "planches"
  | "jour_dplus"
  | "nom"
  | "date";

export type ElementStat = ElementCommun & {
  type: "stat";
  variable: CleVariable;
  libelle: string | null;
  taille: number;
  /**
   * LE DERNIER MOT À L'AUTEUR : une valeur saisie ici remplace le calcul.
   * La montre a toujours raison sur son propre fichier, et le studio n'a pas à
   * discuter le chiffre que Valentin lit sur son poignet.
   */
  valeurManuelle: string | null;
};

export type LigneFiche = {
  libelle: string;
  /** L'un ou l'autre : une valeur écrite, ou une variable qui la remplit. */
  valeur: string | null;
  variable: CleVariable | null;
  accent: boolean;
};

export type ElementFiche = ElementCommun & {
  type: "fiche";
  lignes: LigneFiche[];
  tailleLibelle: number;
  tailleValeur: number;
};

/**
 * Ce qu'une case dit d'elle-même.
 *
 * `texte` vide, la journée écrit le sien — son numéro et ses chiffres. C'est un
 * point de départ, pas un gabarit : tout le balisage y marche, et « Jour 1 »
 * devient « Jour 1 × Rapace × Lolo » d'une frappe.
 */
export type CaseJournee = { jour: number; texte: string };

export type ElementCases = ElementCommun & {
  type: "cases";
  colonnes: number;
  miniCarte: boolean;
  miniProfil: boolean;
  filet: boolean;
  cases: CaseJournee[];
  /** Le corps du texte d'une case, en pixels d'une planche de 1080 de large. */
  taille: number;
  /** Une couleur par journée, cyclique. Vide = la palette de la charte. */
  couleurs: string[];
};

export type Element =
  | ElementTexte
  | ElementPhoto
  | ElementForme
  | ElementIcone
  | ElementMarque
  | ElementCarte
  | ElementProfil
  | ElementStat
  | ElementFiche
  | ElementCases;

/* ------------------------------------------------------------- les planches */

export type CleModele =
  | "carte"
  | "bandeau"
  | "photo"
  | "texte"
  | "fiche"
  | "etape"
  | "journees"
  | "cloture"
  | "silhouette"
  | "chiffres"
  | "survol";

export type PlancheImage = {
  id: string;
  type: "image";
  nom: string;
  /** Le modèle qui l'a instanciée — ce que « Remettre le modèle » réaligne. */
  modele: CleModele;
  /** Vide = le fond du thème. */
  fond: string;
  /**
   * LA TRANCHE EST UN RÉGLAGE DE LA PLANCHE, et d'elle seule.
   *
   * Carte, profil et chiffres la suivent : une planche d'étape montre le jour
   * trois quand sa voisine montre le tour entier, sans qu'aucun élément ait à
   * porter sa propre idée de la question. Un second réglage sur l'élément
   * ferait deux vérités pour une seule image.
   */
  tranche: Tranche;
  /** Du fond vers l'avant : l'ordre du tableau EST l'ordre des calques. */
  elements: Element[];
};

export type ModeCamera = "suivre" | "orbite" | "ensemble" | "trajet";

export type Camera = {
  mode: ModeCamera;
  /** Degrés d'inclinaison depuis la verticale. */
  pitch: number;
  /** Exagération du relief, 1 → 2. */
  exageration: number;
  /** Constante de temps du lissage du cap, en secondes. */
  douceur: number;
  /** Plafond de rotation, en degrés par seconde — au-delà, ça secoue. */
  rotationMax: number;
  zoomAuto: boolean;
  zoom: number;
};

export type Montage = {
  /** Durée cible de la vidéo, en secondes. */
  duree: number;
  imagesParSeconde: number;
  /** « distance » : le point avance régulièrement ; « temps » : il ralentit
   *  dans les montées. Le curseur mélange les deux. */
  vitesse: "distance" | "temps";
  melange: number;
  retirerPauses: boolean;
  /** Rognage, en secondes de séance. */
  debut: number | null;
  fin: number | null;
  /** Temps d'arrêt sur le départ et sur l'arrivée, en secondes. */
  tenueDepart: number;
  tenueArrivee: number;
};

export type Scene = {
  fond: FondCarte;
  /** Trace parcourue et trace restante. */
  couleurParcourue: string;
  couleurRestante: string;
  epaisseur: number;
  ciel: boolean;
};

export type PlancheSurvol = {
  id: string;
  type: "survol";
  nom: string;
  modele: "survol";
  scene: Scene;
  camera: Camera;
  montage: Montage;
  /** L'habillage : les MÊMES éléments qu'une planche image, posés sur la scène. */
  hud: Element[];
};

export type Planche = PlancheImage | PlancheSurvol;

/* -------------------------------------------------------------- le document */

export type Media = {
  id: string;
  nom: string;
  largeur: number;
  hauteur: number;
  /** Millisecondes epoch, depuis l'EXIF. */
  priseLe: number | null;
  /** Position EXIF, quand la photo en porte une : sert à poser un moment
   *  photo au bon kilomètre d'un survol. */
  gps: { lat: number; lon: number } | null;
};

export type Donnees = {
  trace: Trace | null;
  /** Les coupures de journée, en kilomètres. */
  coupures: number[];
  /** Les étiquettes par défaut des journées, écrasables planche par planche. */
  etiquettes: string[];
  /** La trace qui a servi à cadrer les cartes — figée pour que la série ne
   *  glisse pas d'une planche à l'autre quand on change la tranche. */
  traceCadrage: Trace | null;
  seance: Seance | null;
};

export type Projet = {
  schema: typeof SCHEMA;
  id: string;
  nom: string;
  creeLe: string;
  modifieLe: string;
  format: CleFormat;
  theme: CleTheme;
  bilan: Bilan;
  donnees: Donnees;
  medias: Media[];
  planches: Planche[];
};
