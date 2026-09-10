"use client";

// lib/fichierProjet.ts
//
// LE `.llstudio`, CÔTÉ NAVIGATEUR.
//
// Le format lui-même vit dans `@locomotionlab/planche`, où il est testé sans
// DOM ; ici on ne fait que le pont : lire les Blobs d'IndexedDB, rendre un
// fichier à télécharger, et reposer les photos d'une archive relue.
//
// LES PHOTOS DE L'ARCHIVE ÉCRASENT CELLES DU DÉPÔT à identifiant égal : deux
// projets qui partagent un identifiant de média partagent la même photo, et
// c'est celle du fichier qu'on vient d'ouvrir qui fait foi.

import {
  EXTENSION,
  depaqueter,
  empaqueter,
  type MediaEmporte,
  type Media,
  type Projet,
} from "@locomotionlab/planche";

import { poserMedia, tousLesMedias } from "./depot";
import { enNomDeFichier, telecharger } from "./export";

/** Le nom du fichier : celui du projet, ramené à ce qu'un navigateur accepte. */
export function nomDArchive(projet: Projet): string {
  return `${enNomDeFichier(projet.nom, "projet")}${EXTENSION}`;
}

/** Empaquette le projet ET les photos qu'il utilise — pas toute la photothèque. */
export async function exporter(projet: Projet): Promise<void> {
  const utilises = new Set(projet.medias.map((m) => m.id));
  const stockes = (await tousLesMedias()).filter((m) => utilises.has(m.id));
  const emportes: MediaEmporte[] = await Promise.all(
    stockes.map(async ({ blob, ...media }) => ({
      media: media as Media,
      type: blob.type || "image/jpeg",
      octets: new Uint8Array(await blob.arrayBuffer()),
    })),
  );
  const octets = await empaqueter(projet, emportes);
  telecharger(new Blob([octets as BlobPart], { type: "application/zip" }), nomDArchive(projet));
}

/** Relit une archive et repose ses photos dans le dépôt. */
export async function importer(fichier: File): Promise<Projet> {
  const { projet, medias } = await depaqueter(new Uint8Array(await fichier.arrayBuffer()));
  await Promise.all(
    medias.map((m) =>
      poserMedia(m.media, new Blob([m.octets as BlobPart], { type: m.type })),
    ),
  );
  return projet;
}
