"use client";

// lib/video.ts
//
// LA VIDÉO, IMAGE PAR IMAGE — jamais en temps réel.
//
// Un enregistrement à la volée dépend de la machine : sur un portable qui rame,
// des images sautent, la trace saccade, et la vidéo publiée n'est pas celle
// qu'on a validée. On dessine donc CHAQUE image à un pas de temps fixe, en
// attendant que les tuiles soient là, et on l'encode. C'est plus lent, et c'est
// le seul moyen d'obtenir le même fichier partout.
//
// TROIS CODECS, LE MÊME CHEMIN. H.264 dans un MP4 est la cible — c'est ce que
// les réseaux avalent sans broncher. Là où il manque (Chromium sans codecs
// propriétaires, certains Linux), on descend sur VP9 puis VP8 dans un WebM :
// autre conteneur, MÊME boucle image par image. Le repli ne sacrifie donc pas
// la propriété qui compte, il change juste d'emballage.
//
// L'AUDIO : certaines apps refusent un MP4 muet. On n'ajoute pourtant aucune
// piste — les muxers produisent un fichier sans audio parfaitement valide, et
// c'est à l'usage de dire si une piste silencieuse devient nécessaire. Mieux
// vaut un manque constaté qu'un ajout par superstition.

import { ArrayBufferTarget as CibleMp4, Muxer as MuxerMp4 } from "mp4-muxer";
import { ArrayBufferTarget as CibleWebm, Muxer as MuxerWebm } from "webm-muxer";

export type Avancement = { image: number; total: number; restantMs: number | null };

export type Encodage = {
  largeur: number;
  hauteur: number;
  imagesParSeconde: number;
  /** Bits par seconde. 12 Mbit/s pour du 1080 × 1920 à 30 i/s. */
  debit: number;
};

/** Ce qu'on sait produire, du meilleur au moins bon. */
type Recette = {
  /** Le nom du codec pour `VideoEncoder`. */
  codec: string;
  conteneur: "mp4" | "webm";
  /** Le nom court que le muxer attend. */
  pourMuxer: "avc" | "V_VP9" | "V_VP8";
  extension: "mp4" | "webm";
};

const RECETTES: Recette[] = [
  // H.264 High 4.2 : lu partout, et suffisant pour du 1080.
  { codec: "avc1.640028", conteneur: "mp4", pourMuxer: "avc", extension: "mp4" },
  { codec: "avc1.42001f", conteneur: "mp4", pourMuxer: "avc", extension: "mp4" },
  { codec: "vp09.00.10.08", conteneur: "webm", pourMuxer: "V_VP9", extension: "webm" },
  { codec: "vp8", conteneur: "webm", pourMuxer: "V_VP8", extension: "webm" },
];

/**
 * La meilleure recette que CE navigateur accepte vraiment.
 *
 * `isConfigSupported` ne suffit pas toujours : un codec annoncé peut refuser de
 * créer son encodeur. On tente donc la création pour de bon — c'est le seul
 * test qui ne mente pas, et il coûte quelques millisecondes.
 */
export async function recetteDisponible(e: Encodage): Promise<Recette | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const r of RECETTES) {
    try {
      const config = { ...configDe(e), codec: r.codec };
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (!supported) continue;
      const essai = new VideoEncoder({ output: () => {}, error: () => {} });
      essai.configure(config);
      essai.close();
      return r;
    } catch {
      // Ce codec ment sur ses capacités : on descend d'un cran.
    }
  }
  return null;
}

function configDe(e: Encodage): VideoEncoderConfig {
  return {
    codec: "avc1.640028",
    width: e.largeur,
    height: e.hauteur,
    bitrate: e.debit,
    framerate: e.imagesParSeconde,
  };
}

export type Sortie = { blob: Blob; extension: "mp4" | "webm"; codec: string };

/**
 * Encode une suite d'images.
 *
 * `dessiner(i)` doit remplir la toile pour l'image `i` — et prendre le temps
 * qu'il faut : c'est là qu'on attend les tuiles. Rien n'est chronométré, tout
 * est compté en images.
 */
export async function encoder(
  toile: HTMLCanvasElement,
  total: number,
  e: Encodage,
  recette: Recette,
  dessiner: (i: number) => Promise<void>,
  surAvancement?: (a: Avancement) => void,
  annule?: () => boolean,
): Promise<Sortie | null> {
  const cible = recette.conteneur === "mp4" ? new CibleMp4() : new CibleWebm();
  const muxer =
    recette.conteneur === "mp4"
      ? new MuxerMp4({
          target: cible as CibleMp4,
          video: { codec: "avc", width: e.largeur, height: e.hauteur },
          // Les métadonnées en tête : c'est ce qui permet à une story de
          // démarrer sans avoir téléchargé le fichier entier.
          fastStart: "in-memory",
        })
      : new MuxerWebm({
          target: cible as CibleWebm,
          video: {
            codec: recette.pourMuxer as "V_VP9" | "V_VP8",
            width: e.largeur,
            height: e.hauteur,
            frameRate: e.imagesParSeconde,
          },
        });

  let souci: unknown = null;
  const encodeur = new VideoEncoder({
    output: (bloc, meta) =>
      (muxer as { addVideoChunk: (b: EncodedVideoChunk, m?: unknown) => void }).addVideoChunk(
        bloc,
        meta,
      ),
    error: (err) => {
      souci = err;
    },
  });
  encodeur.configure({ ...configDe(e), codec: recette.codec });

  const debut = performance.now();
  const microsecondesParImage = 1_000_000 / e.imagesParSeconde;

  try {
    for (let i = 0; i < total; i += 1) {
      if (annule?.() || souci) break;
      await dessiner(i);
      const image = new VideoFrame(toile, {
        timestamp: Math.round(i * microsecondesParImage),
        duration: Math.round(microsecondesParImage),
      });
      // Une image clé toutes les deux secondes : c'est ce qui rend le fichier
      // navigable, et ce qu'attendent les lecteurs des réseaux.
      encodeur.encode(image, { keyFrame: i % (e.imagesParSeconde * 2) === 0 });
      image.close();

      // On laisse l'encodeur respirer tant qu'il est en retard : sans ça, la
      // file grossit jusqu'à saturer la mémoire sur une vidéo d'une minute.
      while (encodeur.encodeQueueSize > 8 && !souci) {
        await new Promise((r) => setTimeout(r, 4));
      }
      const ecoule = performance.now() - debut;
      surAvancement?.({
        image: i + 1,
        total,
        restantMs: i > 3 ? (ecoule / (i + 1)) * (total - i - 1) : null,
      });
    }

    if (annule?.()) return null;
    await encodeur.flush();
    if (souci) throw souci instanceof Error ? souci : new Error(String(souci));
    muxer.finalize();
    const octets = (cible as { buffer: ArrayBuffer }).buffer;
    return {
      blob: new Blob([octets as BlobPart], {
        type: recette.conteneur === "mp4" ? "video/mp4" : "video/webm",
      }),
      extension: recette.extension,
      codec: recette.codec,
    };
  } finally {
    if (encodeur.state !== "closed") encodeur.close();
  }
}
