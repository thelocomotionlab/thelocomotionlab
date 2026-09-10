// packages/planche/src/index.ts
//
// Barrel public du modèle de planche. Les apps importent depuis
// "@locomotionlab/planche" ; les modules feuilles restent accessibles
// individuellement.
//
// Le paquet est PUR : ni DOM, ni React. Le rendu canvas viendra s'y poser, mais
// le modèle, la géométrie d'interaction et l'historique se testent sans écran.

export {
  CORPS,
  FORMATS,
  GRAISSES,
  LARGEUR_REFERENCE,
  LETTRAGE,
  MARGE,
  PALETTE_JOURS,
  THEMES,
  couleurDuJour,
  echelleDe,
  formatDe,
  rgba,
  rgbDe,
  themeDe,
} from "./charte.ts";
export type { Format, Theme } from "./charte.ts";

export {
  POIGNEE,
  SEUIL_AIMANT,
  TAILLE_MINIMALE,
  aimanter,
  aligner,
  centreDe,
  ciblesDAimant,
  coinsDe,
  contient,
  elementSous,
  elementsDans,
  enFractions,
  enPixels,
  englobante,
  poigneeSous,
  poignees,
  redimensionner,
  repartir,
  tourner,
} from "./geometrie.ts";
export type {
  Cible,
  ClePoignee,
  Guide,
  ModeAlignement,
  OptionsRedimension,
  OrigineGuide,
  Point,
  ResultatAimant,
} from "./geometrie.ts";

export {
  FENETRE_FUSION,
  PROFONDEUR,
  annuler,
  creer,
  libelleAnnulation,
  libelleRetablissement,
  peutAnnuler,
  peutRefaire,
  pousser,
  refaire,
  sceller,
} from "./historique.ts";
export type { Etape, Historique, OptionsPoussee } from "./historique.ts";

export {
  ABSENT,
  VARIABLES,
  cleDe,
  dureeCourte,
  ficheDe,
  formatAllure,
  formatDate,
  formatEntier,
  formatKm,
  formatVitesse,
  resoudre,
  segmentsDeLaTranche,
  valeurDe,
  variablesCitees,
} from "./variables.ts";
export type { Contexte, FicheVariable } from "./variables.ts";

export { SCHEMA } from "./types.ts";
export type {
  Alignement,
  Bilan,
  Boite,
  BoitePx,
  Camera,
  Casse,
  CleFormat,
  CleModele,
  CleTheme,
  CleVariable,
  Donnees,
  Element,
  ElementCarte,
  ElementCases,
  ElementCommun,
  ElementFiche,
  ElementForme,
  ElementIcone,
  ElementMarque,
  ElementPhoto,
  ElementProfil,
  ElementStat,
  ElementTexte,
  Etiquette,
  Filet,
  FondCarte,
  Ligne,
  LigneFiche,
  Media,
  ModeCamera,
  Montage,
  Morceau,
  Ombre,
  Planche,
  PlancheImage,
  PlancheSurvol,
  Plaque,
  Projet,
  RoleTexte,
  Scene,
  Tranche,
  TypeElement,
} from "./types.ts";
