// Assemble le pipeline médias réel (sharp + ffmpeg) derrière l'interface
// injectable MediaPipeline (les tests fournissent un pipeline factice).

import type { Config } from "../config";
import type { MediaPipeline } from "../journal/ingest";
import type { JournalStore } from "../journal/store";
import { processAudio } from "./audio";
import { processPhoto } from "./photo";
import { processVideo } from "./video";

export function createMediaPipeline(config: Config, store: JournalStore): MediaPipeline {
  const dirs = {
    mediaDir: store.mediaDir,
    sourcesDir: store.sourcesDir,
    tmpDir: store.tmpDir,
  };
  return {
    processPhoto: (source) =>
      processPhoto(source, {
        maxWidth: config.media.photoMaxWidth,
        quality: config.media.photoQuality,
        ...dirs,
      }),
    processAudio: (source, sourceExt) => processAudio(source, sourceExt, dirs),
    processVideo: (source, sourceExt) => processVideo(source, sourceExt, dirs),
  };
}
