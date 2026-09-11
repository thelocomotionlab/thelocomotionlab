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
  angleVers,
  avecBoite,
  centreDe,
  deplacer,
  parPas,
  ciblesDAimant,
  ciblesDeLaPlanche,
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

export { definirVocabulaireDIcones, vocabulaireDIcones } from "./canvas.ts";
export type { Ctx2D, Degrade, SourceImage, Vocabulaire } from "./canvas.ts";

export {
  AIDE_BALISAGE,
  CENTRE_CAPITALES,
  COULEURS_TEXTE,
  ESPACEMENT,
  FLECHE_LARGEUR,
  PUCES_SIMPLES,
  analyserRiche,
  blocsDeTexte,
  decalageAlignement,
  dessinerCapitales,
  dessinerLigneRiche,
  encreDe,
  estPuceTracee,
  flecheTracee,
  fonteDe,
  glypheTrace,
  hauteurBlocs,
  largeurBlocs,
  largeurCapitales,
  largeurIcone,
  largeurLigne,
  lignesRiches,
  morceauxCapitales,
  plaqueDeLigne,
  poserBlocs,
  styleDeLigne,
  texteNu,
} from "./texte.ts";
export type {
  Align,
  Bloc,
  Ligne as LigneTexte,
  Morceau as MorceauTexte,
  MorceauMesure,
  PlaqueRendu,
  StyleTexte,
} from "./texte.ts";

export {
  besoinsDeFond,
  contexteDeRendu,
  dessinerAvecCadre,
  dessinerFond,
  dessinerPlanche,
  segmentsMontres,
} from "./rendu.ts";
export type { ContexteRendu, OptionsContexte } from "./rendu.ts";

export {
  MAX_TUILES,
  attributionDe,
  besoinDeFond,
  cleDuFond,
  coordsDeCadrage,
  dessinerCarte,
  vueDeLaCarte,
} from "./carte.ts";
export type { BesoinDeFond, FondPret } from "./carte.ts";

export {
  TILE_SIZE,
  cadrer,
  decimerPixels,
  normX,
  normY,
  tuilesDeLaVue,
} from "./projection.ts";
export type { Fenetre, Mosaique, OptionsVue, Vue } from "./projection.ts";

export {
  cadrageCouverture,
  cheminDuProfil,
  dessinerElement,
  etendueDeLaPhoto,
  glisserLeCadrage,
  hauteurNaturelle,
  styleDe,
  valeurAffichee,
} from "./elements.ts";

export {
  CONTEXTE_PAR_DEFAUT,
  MODELES,
  changerModele,
  instancier,
  instancierSurvol,
  mobilier,
  modeleDe,
  modelesPour,
  remettreLeModele,
} from "./modeles.ts";
export type { ContexteModele, Modele, OptionsMobilier } from "./modeles.ts";

export {
  carteNeuve,
  casesNeuves,
  dupliquer,
  ficheNeuve,
  filetNeuf,
  iconeNeuve,
  idNeuf,
  marqueNeuve,
  photoNeuve,
  profilNeuf,
  formeNeuve,
  statNeuve,
  styleDuRole,
  texteNeuf,
} from "./fabrique.ts";

export {
  contientUnGroupe,
  degrouper,
  etendreAuxGroupes,
  grouper,
  renouer,
} from "./groupes.ts";

export { apparenceDe, avecApparence } from "./apparence.ts";
export { contexteDuHud } from "./contexte.ts";
export { capLisse, priseDe, priseDEnsemble, prisesDuPlan, zoomSelonVitesse } from "./camera.ts";
export type { Prise } from "./camera.ts";
export { imagesDuMontage, planDeSurvol, pointsRetenus } from "./montage.ts";
export type { PlanDeSurvol } from "./montage.ts";
export { EXTENSION, depaqueter, empaqueter } from "./fichier.ts";
export type { MediaEmporte } from "./fichier.ts";
export { crc32, ecrireZip, lireZip } from "./zip.ts";
export type { Entree } from "./zip.ts";
export type { Apparence } from "./apparence.ts";

export { lireExif } from "./exif.ts";
export type { Exif } from "./exif.ts";

export { estProjetV1, migrerProjet, trancheV1 } from "./migration.ts";
export type { CarteV1, ProjetV1, ResultatMigration } from "./migration.ts";

// Les couleurs de marque, ré-exportées : le chrome du studio les lit sans avoir
// à connaître le chemin de la charte.
export { brandColors } from "@locomotionlab/ui/tokens";

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
  LigneFiche,
  Media,
  ModeCamera,
  Montage,
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
