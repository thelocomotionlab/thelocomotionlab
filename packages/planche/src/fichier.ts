// packages/planche/src/fichier.ts
//
// LE FICHIER `.llstudio` : un projet qui change de navigateur.
//
// IndexedDB vit dans UN navigateur, sur UN appareil : un « effacer les données
// du site » emporte tout, et passer de l'ordinateur au téléphone ne transporte
// rien. Le fichier est la réponse — et il emporte les photos, sans quoi un
// projet rouvert ailleurs serait une suite de cadres vides.
//
// UNE ARCHIVE, PAS UN BLOB OPAQUE. `studio.json` se lit dans un éditeur de
// texte, les photos se récupèrent une par une : dans dix ans, même sans le
// studio, rien n'est perdu.
//
// LE JSON EST DÉGONFLÉ, LES PHOTOS NON. Une séance à 1 Hz fait l'essentiel du
// poids d'un projet — onze heures de sortie, douze mégaoctets de nombres — et
// le DEFLATE la divise par cinq ; un JPEG, lui, ne se dégonfle pas. La
// compression passe par `CompressionStream`, présent dans le navigateur et
// dans Node : rien à installer, et c'est ce qui rend ces deux fonctions
// asynchrones.

import { crc32, ecrireZip, lireZip } from "./zip.ts";
import { estProjetV1, migrerProjet } from "./migration.ts";
import { SCHEMA } from "./types.ts";
import type { Media, Projet } from "./types.ts";

export const EXTENSION = ".llstudio";

/** La version du CONTENANT, indépendante du schéma du document. */
const VERSION = 1;

const MANIFESTE = "studio.json";

/** Un média et ses octets — ce qu'un `.llstudio` transporte en plus du JSON. */
export type MediaEmporte = { media: Media; type: string; octets: Uint8Array };

type Manifeste = {
  format: "llstudio";
  version: number;
  projet: Projet;
  medias: { id: string; fichier: string; type: string }[];
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function nomDeMedia(m: MediaEmporte): string {
  return `medias/${m.media.id}.${EXTENSIONS[m.type] ?? "bin"}`;
}

/**
 * Dégonfle, ou regonfle, avec l'API du moteur — sans dépendance.
 *
 * « deflate-raw » nomme le FORMAT, pas le sens : c'est la classe qui décide
 * lequel des deux on fait.
 */
async function passer(octets: Uint8Array, sens: "gonfler" | "degonfler"): Promise<Uint8Array> {
  const transformation =
    sens === "degonfler" ? new CompressionStream("deflate-raw") : new DecompressionStream("deflate-raw");
  const sortie = new Blob([octets as BlobPart]).stream().pipeThrough(transformation);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}

export async function empaqueter(
  projet: Projet,
  medias: readonly MediaEmporte[],
): Promise<Uint8Array> {
  const manifeste: Manifeste = {
    format: "llstudio",
    version: VERSION,
    projet,
    medias: medias.map((m) => ({ id: m.media.id, fichier: nomDeMedia(m), type: m.type })),
  };
  const json = new TextEncoder().encode(JSON.stringify(manifeste, null, 1));
  return ecrireZip([
    {
      nom: MANIFESTE,
      donnees: await passer(json, "degonfler"),
      methode: 8,
      brut: { taille: json.length, crc: crc32(json) },
    },
    ...medias.map((m) => ({ nom: nomDeMedia(m), donnees: m.octets })),
  ]);
}

/**
 * Relit un `.llstudio`.
 *
 * Un projet au schéma 1 est migré à l'ouverture : un fichier exporté avant la
 * v2 reste un fichier valable, sinon l'archive de secours n'en serait pas une.
 * Un média annoncé mais absent est simplement ignoré — le projet s'ouvre avec
 * un cadre vide, ce qui vaut mieux qu'un refus d'ouvrir.
 */
export async function depaqueter(
  octets: Uint8Array,
): Promise<{ projet: Projet; medias: MediaEmporte[] }> {
  const entrees = lireZip(octets);
  const entree = entrees.get(MANIFESTE);
  if (!entree) throw new Error("Archive sans « studio.json » : ce n'est pas un fichier du studio.");

  const brut =
    entree.methode === 8 ? await passer(entree.donnees, "gonfler") : entree.donnees;
  const manifeste = JSON.parse(new TextDecoder().decode(brut)) as Manifeste;
  const source = manifeste.projet as unknown;
  const projet =
    (source as Projet)?.schema === SCHEMA
      ? (source as Projet)
      : estProjetV1(source)
        ? (migrerProjet(source)?.projet ?? null)
        : null;
  if (!projet) throw new Error("Ce fichier ne contient pas de projet lisible.");

  const medias = await Promise.all(
    (manifeste.medias ?? []).map(async (m) => {
      const e = entrees.get(m.fichier);
      const media = projet.medias.find((x) => x.id === m.id);
      if (!e || !media) return null;
      const donnees = e.methode === 8 ? await passer(e.donnees, "gonfler") : e.donnees;
      return { media, type: m.type, octets: donnees };
    }),
  );
  return { projet, medias: medias.filter((m): m is MediaEmporte => m !== null) };
}
