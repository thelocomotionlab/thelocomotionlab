// lib/carrouselProjet.js
//
// SAUVEGARDER UN CARROUSEL, ET Y REVENIR.
//
// POURQUOI PAS localStorage. Il ne stocke que du texte, et il plafonne autour
// de 5 Mo — une seule photo de téléphone convertie en base64 le remplit. On
// écrit donc dans IndexedDB, qui accepte les Blobs tels quels : les photos
// gardent leur poids réel, et rien n'est ré-encodé.
//
// CE QUI EST SAUVÉ, ET POURQUOI :
//   • les cartes (textes, réglages, couleurs) — c'est le travail ;
//   • les PHOTOS, en Blob — les recharger une à une serait le plus pénible ;
//   • la TRACE déjà décodée — un GPX de 6 Mo se relit en ~150 ms, mais le
//     découpage en journées et les étiquettes déplacées, eux, ne se refont pas ;
//   • le format, le thème, l'avant/après, les coupures.
// Ce qui n'est PAS sauvé : le fond de carte (il se retélécharge), et l'état
// d'ouverture des sections (ça ne se mémorise pas, ça se rouvre).
//
// L'AUTOSAUVEGARDE est un filet, pas un projet. Elle écrase un unique
// emplacement « en cours » à chaque modification, pour qu'un onglet fermé par
// erreur ne coûte rien. Les projets NOMMÉS, eux, ne bougent que sur demande —
// sinon « enregistrer » ne voudrait plus rien dire.

const BASE = "locomotionlab-studio";
const MAGASIN = "projets";
const EN_COURS = "__en-cours__";
const VERSION_SCHEMA = 1;

function ouvrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN, { keyPath: "nom" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transaction(mode, action) {
  return ouvrir().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(MAGASIN, mode);
        const req = action(tx.objectStore(MAGASIN));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/**
 * Une carte, prête à écrire : l'image devient un Blob, tout le reste est déjà
 * du JSON. `structuredClone` refuserait un ImageBitmap détaché, et un
 * HTMLImageElement n'est de toute façon pas clonable — on passe par un canvas.
 */
async function carteSerialisable(carte) {
  const { image, ...reste } = carte;
  if (!image) return { ...reste, photo: null };
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  c.getContext("2d").drawImage(image, 0, 0);
  const photo = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  return { ...reste, photo };
}

/** Le chemin inverse : un Blob redevient une image utilisable par le canvas. */
async function carteRestauree(carte) {
  const { photo, ...reste } = carte;
  if (!photo) return { ...reste, image: null };
  try {
    return { ...reste, image: await createImageBitmap(photo) };
  } catch {
    // Une photo illisible ne doit pas empêcher d'ouvrir le projet : on rend la
    // carte sans elle plutôt que de tout perdre.
    return { ...reste, image: null, nomImage: "" };
  }
}

export async function serialiserProjet(etat) {
  return {
    schema: VERSION_SCHEMA,
    enregistreLe: new Date().toISOString(),
    format: etat.format,
    theme: etat.theme,
    bilan: etat.bilan,
    coupures: etat.coupures,
    trace: etat.trace,
    traceCadre: etat.traceCadre,
    cartes: await Promise.all(etat.cartes.map(carteSerialisable)),
  };
}

export async function deserialiserProjet(projet) {
  if (!projet || projet.schema !== VERSION_SCHEMA) return null;
  return {
    format: projet.format ?? "carrousel",
    theme: projet.theme ?? "sombre",
    bilan: Boolean(projet.bilan),
    coupures: projet.coupures ?? [],
    trace: projet.trace ?? null,
    traceCadre: projet.traceCadre ?? null,
    cartes: await Promise.all((projet.cartes ?? []).map(carteRestauree)),
  };
}

export async function enregistrerProjet(nom, etat) {
  const projet = await serialiserProjet(etat);
  await transaction("readwrite", (magasin) => magasin.put({ nom, ...projet }));
  return projet;
}

export async function chargerProjet(nom) {
  const brut = await transaction("readonly", (magasin) => magasin.get(nom));
  return deserialiserProjet(brut);
}

export async function supprimerProjet(nom) {
  await transaction("readwrite", (magasin) => magasin.delete(nom));
}

/** Les projets enregistrés, du plus récent au plus ancien, sans leur contenu. */
export async function listerProjets() {
  const tout = await transaction("readonly", (magasin) => magasin.getAll());
  return (tout ?? [])
    .filter((p) => p.nom !== EN_COURS)
    .map((p) => ({ nom: p.nom, enregistreLe: p.enregistreLe, cartes: p.cartes?.length ?? 0 }))
    .sort((a, b) => String(b.enregistreLe).localeCompare(String(a.enregistreLe)));
}

export const enregistrerEnCours = (etat) => enregistrerProjet(EN_COURS, etat);
export const chargerEnCours = () => chargerProjet(EN_COURS);

/* ------------------------------------------------------- export / import */

/**
 * Le fichier de secours. IndexedDB vit dans CE navigateur : un « effacer les
 * données du site » emporte tout. Un `.json` posé dans le cloud, non — et il
 * passe d'un appareil à l'autre.
 *
 * Les photos y sont en base64, ce qui gonfle le fichier d'un tiers. C'est le
 * prix d'un format autoportant : un export sans les photos serait un piège.
 */
export async function exporterProjet(etat) {
  const projet = await serialiserProjet(etat);
  const cartes = await Promise.all(
    projet.cartes.map(async (c) => ({
      ...c,
      photo: c.photo ? await blobEnDataUrl(c.photo) : null,
    })),
  );
  return new Blob([JSON.stringify({ ...projet, cartes }, null, 0)], {
    type: "application/json",
  });
}

function blobEnDataUrl(blob) {
  return new Promise((resolve) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result);
    lecteur.readAsDataURL(blob);
  });
}

async function dataUrlEnBlob(url) {
  return (await fetch(url)).blob();
}

export async function importerProjet(texte) {
  const projet = JSON.parse(texte);
  if (projet?.schema !== VERSION_SCHEMA) return null;
  const cartes = await Promise.all(
    (projet.cartes ?? []).map(async (c) => ({
      ...c,
      photo: typeof c.photo === "string" ? await dataUrlEnBlob(c.photo) : null,
    })),
  );
  return deserialiserProjet({ ...projet, cartes });
}
