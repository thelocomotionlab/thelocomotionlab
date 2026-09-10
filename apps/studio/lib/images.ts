// lib/images.ts
//
// LES PHOTOS DÉCODÉES DE LA SESSION.
//
// Le rendu d'une planche est synchrone : il lui faut des images déjà décodées.
// Ce cache est le pendant de celui des tuiles — le document ne garde qu'un
// identifiant de média, et c'est ici que vit le pixel.
//
// Il se remplit à l'import, et se recharge depuis IndexedDB à l'ouverture d'un
// projet : une photo posée hier doit réapparaître sans qu'on la redonne.

import type { SourceImage } from "@locomotionlab/planche";

import { lireMedia } from "./depot";
import { decoder } from "./medias";

const cache = new Map<string, SourceImage>();
const enCours = new Map<string, Promise<SourceImage | null>>();

export function poser(id: string, image: SourceImage): void {
  cache.set(id, image);
}

export function imagesEnCache(): Map<string, SourceImage> {
  return cache;
}

/** Recharge une photo depuis le dépôt. `null` si elle n'y est plus. */
export async function chargerImage(id: string): Promise<SourceImage | null> {
  const dejaLa = cache.get(id);
  if (dejaLa) return dejaLa;
  const enVol = enCours.get(id);
  if (enVol) return enVol;

  const promesse = (async () => {
    const m = await lireMedia(id);
    if (!m) return null;
    try {
      const image = await decoder(m.blob);
      cache.set(id, image);
      return image as SourceImage;
    } catch {
      // Une photo illisible ne doit pas empêcher d'ouvrir le projet : la
      // planche la montre comme un cadre d'accueil vide.
      return null;
    }
  })().finally(() => enCours.delete(id));

  enCours.set(id, promesse);
  return promesse;
}

/** Charge tout ce qui manque, et dit si quelque chose est arrivé. */
export async function completerLesImages(ids: readonly string[]): Promise<boolean> {
  const manquants = ids.filter((id) => !cache.has(id));
  if (manquants.length === 0) return false;
  const venues = await Promise.all(manquants.map(chargerImage));
  return venues.some(Boolean);
}
