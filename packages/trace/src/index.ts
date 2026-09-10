// packages/trace/src/index.ts
//
// Barrel public du paquet trace. Les apps importent depuis
// "@locomotionlab/trace" ; les modules feuilles restent accessibles
// individuellement pour qui ne veut qu'un parseur.
//
// Le paquet est PUR : ni DOM, ni React, ni réseau. Il tourne dans le navigateur,
// sous Node et sous les tests sans rien monter.

export {
  cap,
  capMoyen,
  cumulKm,
  ecartAngulaire,
  haversine,
} from "./geo.ts";

export { decimer, medianeGlissante, moyenneGlissante } from "./lissage.ts";

export {
  denivele,
  deniveleCumule,
  LISSAGE_ALTITUDE,
  SEUIL_DENIVELE,
} from "./denivele.ts";
export type { CumulDenivele } from "./denivele.ts";

export { distanceCumulee, parseGpx } from "./gpx.ts";

export { profilDeGpx, statsDeGpx } from "./stats.ts";
export type { OptionsStats, PointProfilDetaille, ProfilGpx, StatsGpx } from "./stats.ts";

export {
  ancreDuSegment,
  coupuresDepuisWaypoints,
  coupuresRegulieres,
  decouperTrace,
  etiquetteParDefaut,
  fusionnerTraces,
  traceDepuisGpx,
  traceDepuisTrackJson,
} from "./trace.ts";

export { pointA, remplirTrous, sansPauses, seanceDepuisGpx } from "./seance.ts";
export type { OptionsSeance } from "./seance.ts";

export type {
  Coord,
  Pause,
  PointBrut,
  PointProfil,
  PointSeance,
  ResumeSeance,
  Seance,
  Segment,
  SourceDistance,
  SourceTrace,
  Trace,
} from "./types.ts";
