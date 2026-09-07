// packages/contenu/src/index.ts
//
// LE MODÈLE DE CONTENU DU SITE : schémas, extraction des blocs, résolveur de
// cartes et règles de build. Décrit dans docs/systeme-de-contenu.md, qui fait
// autorité ; ce paquet en est la mise en œuvre.
//
// Ce point d'entrée embarque `charger` et `construire`, qui lisent le disque :
// il est fait pour le script de build. Les modules purs ont leur sous-chemin
// (`@locomotionlab/contenu/resolveur`, `/ancres`, `/blocs`, `/sections`,
// `/sortes`), à importer depuis un composant.

export * from "./sortes.ts";
export * from "./sections.ts";
export * from "./blocs.ts";
export * from "./ancres.ts";
export * from "./extraction.ts";
export * from "./validation.ts";
export * from "./resolveur.ts";
export * from "./charger.ts";
export * from "./construire.ts";
export * as messages from "./messages.ts";
