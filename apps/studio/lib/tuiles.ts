// lib/tuiles.ts
//
// ALLER CHERCHER LES TUILES, et les assembler en une mosaïque.
//
// Le rendu d'une planche est SYNCHRONE ; les tuiles viennent du réseau. La
// carte dit ce dont elle a besoin, ce module va le chercher, et le rendu lit
// une image déjà là. C'est ce qui permettra d'exporter une vidéo image par
// image sans jamais attendre au milieu d'un rendu.
//
// LE CACHE EST GLOBAL À LA SESSION : deux planches qui cadrent le même terrain
// au même zoom partagent leur mosaïque, et changer de thème ou de texte ne
// retélécharge rien.

import type { BesoinDeFond, FondPret } from "@locomotionlab/planche";

const TAILLE = 256;

const cache = new Map<string, FondPret>();
const enCours = new Map<string, Promise<FondPret | null>>();

/**
 * Une tuile, ou `null`.
 *
 * `crossOrigin = "anonymous"` EST OBLIGATOIRE : sans lui la tuile chargerait
 * mais SOUILLERAIT le canvas, et `toBlob` lèverait au moment d'exporter —
 * l'échec arriverait donc au pire moment. Avec, une tuile sans en-tête CORS
 * échoue proprement ici, et la carte se rabat sur son aplat.
 */
function chargerTuile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Assemble la mosaïque d'un besoin. `null` si AUCUNE tuile n'arrive — la carte
 * reste alors lisible sur son aplat. Une carte ne doit jamais échouer à cause
 * du réseau.
 */
export async function chargerFond(besoin: BesoinDeFond): Promise<FondPret | null> {
  const dejaLa = cache.get(besoin.cle);
  if (dejaLa) return dejaLa;
  const enVol = enCours.get(besoin.cle);
  if (enVol) return enVol;

  const promesse = (async () => {
    const mosaique = document.createElement("canvas");
    mosaique.width = besoin.colonnes * TAILLE;
    mosaique.height = besoin.rangs * TAILLE;
    const ctx = mosaique.getContext("2d");
    if (!ctx) return null;

    const arrivees = await Promise.all(
      besoin.urls.map(async (url, i) => {
        const img = await chargerTuile(url);
        if (!img) return false;
        const dx = (i % besoin.colonnes) * TAILLE;
        const dy = Math.floor(i / besoin.colonnes) * TAILLE;
        ctx.drawImage(img, dx, dy, TAILLE, TAILLE);
        return true;
      }),
    );
    if (!arrivees.some(Boolean)) return null;

    const pret: FondPret = { image: mosaique, coupeX: besoin.coupeX, coupeY: besoin.coupeY };
    cache.set(besoin.cle, pret);
    return pret;
  })().finally(() => enCours.delete(besoin.cle));

  enCours.set(besoin.cle, promesse);
  return promesse;
}

/** Les mosaïques déjà en cache, à passer au contexte de rendu. */
export function fondsEnCache(): Map<string, FondPret> {
  return cache;
}

/** Charge tout ce qui manque, et dit si quelque chose est arrivé. */
export async function completerLesFonds(besoins: BesoinDeFond[]): Promise<boolean> {
  const manquants = besoins.filter((b) => !cache.has(b.cle));
  if (manquants.length === 0) return false;
  const venus = await Promise.all(manquants.map(chargerFond));
  return venus.some(Boolean);
}
