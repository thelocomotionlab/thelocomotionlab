// packages/ui/src/components/contenu/index.ts
//
// LES COMPOSANTS DES PAGES DE CONTENU, importés depuis
// "@locomotionlab/ui/contenu".
//
// Deux familles : les blocs qui s'écrivent dans le flux d'un billet (Note,
// Protocole, et leurs cartes de renvoi), et les sections d'une page Aventure.
// Les transverses (sommaire, accroche, photo, appel de référence) servent aux
// deux.

// ── Blocs dans le flux ──────────────────────────────────────────────────────
export { default as Note } from "./Note.tsx";
export type { NoteProps } from "./Note.tsx";
export { default as Protocole } from "./Protocole.tsx";
export type { ProtocoleProps } from "./Protocole.tsx";
export { default as BadgeStatut } from "./BadgeStatut.tsx";
export type { BadgeStatutProps } from "./BadgeStatut.tsx";
export { VersProtocole, VersNote } from "./CarteDeBloc.tsx";
export type { CarteDeBlocProps } from "./CarteDeBloc.tsx";

// ── Sections d'aventure ─────────────────────────────────────────────────────
export { default as SectionsAventure } from "./SectionsAventure.tsx";
export type { SectionsAventureProps, RendusDAventure } from "./SectionsAventure.tsx";
export { default as SectionAventure, numeroDeSection } from "./SectionAventure.tsx";
export type { SectionAventureProps } from "./SectionAventure.tsx";
export { default as Caracteristiques } from "./Caracteristiques.tsx";
export { default as Geo } from "./Geo.tsx";
export { default as Preparation } from "./Preparation.tsx";
export { default as Graphe } from "./Graphe.tsx";
export { default as Stresseurs } from "./Stresseurs.tsx";
export { default as Paquetage } from "./Paquetage.tsx";
export type {
  DonneesDePaquetage,
  CategorieDePaquetage,
  ArticleDePaquetage,
} from "./Paquetage.tsx";
export { default as Nutrition } from "./Nutrition.tsx";
export { default as SectionLibre } from "./SectionLibre.tsx";
export type { SectionLibreProps } from "./SectionLibre.tsx";
export { default as Direct, ArchiveDuDirect } from "./Direct.tsx";
export type { DirectProps, ReglageDuDirect } from "./Direct.tsx";
export { default as CarteRecit } from "./CarteRecit.tsx";
export type { CarteRecitProps } from "./CarteRecit.tsx";

// ── Transverses ─────────────────────────────────────────────────────────────
export { default as Sommaire } from "./Sommaire.tsx";
export type { SommaireProps } from "./Sommaire.tsx";
export { default as LigneSeance } from "./LigneSeance.tsx";
export type { LigneSeanceProps, BilletDeSeance } from "./LigneSeance.tsx";
export { default as Tableau } from "./Tableau.tsx";
export { default as Photo } from "./Photo.tsx";
export type { PhotoProps } from "./Photo.tsx";
export { default as Video } from "./Video.tsx";
export { default as Accroche } from "./Accroche.tsx";
export type { AccrocheProps } from "./Accroche.tsx";
export { creerAppelDeReference } from "./AppelDeReference.tsx";
export { creerRegistreDeReferences } from "./references.ts";
export type { RegistreDeReferences } from "./references.ts";
export { default as Bibliographie } from "./Bibliographie.tsx";
export type { EntreeDeBibliographie } from "./Bibliographie.tsx";
export { LIBELLES_DE_SECTION, libelleDeSection } from "./libelles.ts";
