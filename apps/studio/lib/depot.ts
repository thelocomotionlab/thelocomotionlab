// lib/depot.ts
//
// CE QUI RESTE QUAND ON FERME L'ONGLET.
//
// POURQUOI PAS localStorage : il ne stocke que du texte, et plafonne autour de
// 5 Mo — une seule photo de téléphone convertie en base64 le remplit. On écrit
// donc dans IndexedDB, qui accepte les Blobs tels quels : les photos gardent
// leur poids réel, et rien n'est ré-encodé.
//
// DEUX MAGASINS, et la frontière compte. Les PROJETS sont du JSON pur — texte,
// positions, trace, séance. Les MÉDIAS sont des Blobs, adressés par
// identifiant. Un même cliché posé sur trois planches n'est donc stocké qu'une
// fois, et dupliquer une planche ne duplique pas ses photos.
//
// L'AUTOSAUVEGARDE EST UN FILET, PAS UN PROJET. Elle écrase un unique
// emplacement « en cours » à chaque modification, pour qu'un onglet fermé par
// erreur ne coûte rien. Les projets NOMMÉS ne bougent que sur demande — sinon
// « enregistrer » ne voudrait plus rien dire.

import type { Media, Projet } from "@locomotionlab/planche";

const BASE = "locomotionlab-studio";
const VERSION = 2;
const PROJETS = "projets";
const MEDIAS = "medias";

/** L'emplacement du brouillon courant. */
export const EN_COURS = "__en-cours__";

export type MediaStocke = Media & { blob: Blob };

let ouverture: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (ouverture) return ouverture;
  ouverture = new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // La v1 du studio avait un magasin « projets » au schéma 1, avec les
      // photos DANS les cartes. On le laisse en place : c'est le filet dont la
      // migration a besoin, et l'effacer avant d'avoir converti serait le seul
      // geste irréversible de toute l'opération.
      if (!db.objectStoreNames.contains(PROJETS)) db.createObjectStore(PROJETS, { keyPath: "nom" });
      if (!db.objectStoreNames.contains(MEDIAS)) db.createObjectStore(MEDIAS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return ouverture;
}

function transaction<T>(
  magasin: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return ouvrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(magasin, mode);
        const req = action(tx.objectStore(magasin));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/* ------------------------------------------------------------------ projets */

type Enregistrement = { nom: string; projet: Projet; enregistreLe: string };

export async function enregistrer(nom: string, projet: Projet): Promise<void> {
  await transaction(PROJETS, "readwrite", (s) =>
    s.put({ nom, projet, enregistreLe: new Date().toISOString() } satisfies Enregistrement),
  );
}

export async function charger(nom: string): Promise<Projet | null> {
  const brut = (await transaction(PROJETS, "readonly", (s) => s.get(nom))) as
    | Enregistrement
    | undefined;
  // Un enregistrement sans `projet` vient du schéma 1 : c'est à la migration de
  // le lire, pas à cette fonction de le rendre à moitié.
  return brut?.projet?.schema === 2 ? brut.projet : null;
}

export async function supprimer(nom: string): Promise<void> {
  await transaction(PROJETS, "readwrite", (s) => s.delete(nom));
}

/** Renomme un enregistrement : on relit, on réécrit sous l'autre clé, on efface. */
export async function renommer(de: string, vers: string): Promise<void> {
  const projet = await charger(de);
  if (!projet) return;
  await enregistrer(vers, projet);
  if (de !== vers) await supprimer(de);
}

/** Tous les médias stockés, avec leurs octets — ce qu'un `.llstudio` emporte. */
export async function tousLesMedias(): Promise<MediaStocke[]> {
  const tout = (await transaction(MEDIAS, "readonly", (s) => s.getAll())) as
    | MediaStocke[]
    | undefined;
  return tout ?? [];
}

/** Les projets enregistrés, du plus récent au plus ancien, sans leur contenu. */
export async function lister(): Promise<
  { nom: string; enregistreLe: string; planches: number; schema: number }[]
> {
  const tout = (await transaction(PROJETS, "readonly", (s) => s.getAll())) as
    | (Enregistrement & { schema?: number; cartes?: unknown[] })[]
    | undefined;
  return (tout ?? [])
    .filter((p) => p.nom !== EN_COURS)
    .map((p) => ({
      nom: p.nom,
      enregistreLe: p.enregistreLe ?? "",
      planches: p.projet?.planches?.length ?? p.cartes?.length ?? 0,
      schema: p.projet?.schema ?? p.schema ?? 1,
    }))
    .sort((a, b) => b.enregistreLe.localeCompare(a.enregistreLe));
}

/* ------------------------------------------------------------------- médias */

export async function poserMedia(media: Media, blob: Blob): Promise<void> {
  await transaction(MEDIAS, "readwrite", (s) => s.put({ ...media, blob }));
}

export async function lireMedia(id: string): Promise<MediaStocke | null> {
  const m = (await transaction(MEDIAS, "readonly", (s) => s.get(id))) as MediaStocke | undefined;
  return m ?? null;
}

export async function oublierMedia(id: string): Promise<void> {
  await transaction(MEDIAS, "readwrite", (s) => s.delete(id));
}

/**
 * Ce que le studio occupe sur cet appareil.
 *
 * IndexedDB vit dans CE navigateur : un « effacer les données du site »
 * emporte tout. Le dire est le minimum ; le fichier de secours est la réponse.
 */
export async function usage(): Promise<{ utilise: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { usage: utilise = 0, quota = 0 } = await navigator.storage.estimate();
    return { utilise, quota };
  } catch {
    return null;
  }
}
