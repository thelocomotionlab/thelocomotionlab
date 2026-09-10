// packages/trace/src/stats.ts
//
// Les statistiques d'un GPX, prêtes à afficher : distance, D+, D−, durée, et la
// silhouette du profil.
//
// Deux sorties, parce que deux usages :
//   • `statsDeGpx`  — les chiffres d'une planche, profil léger (~400 points) ;
//   • `profilDeGpx` — la trace de référence d'une carte posée dans un récit, au
//     format que le direct lit dans un `.track.json` : chaque point du profil
//     porte aussi ses coordonnées (le point jumeau sur la carte au survol) et
//     ses D+/D− accumulés.
//
// Les deux passent par la MÊME chaîne — distance de la montre si elle est là,
// altitude lissée en moyenne glissante, hystérésis à 3 m — et annoncent donc
// exactement les mêmes totaux.

import { deniveleCumule, LISSAGE_ALTITUDE, SEUIL_DENIVELE } from "./denivele.ts";
import { distanceCumulee, parseGpx } from "./gpx.ts";
import { decimer, moyenneGlissante } from "./lissage.ts";
import type { PointProfil, SourceDistance } from "./types.ts";

export type OptionsStats = {
  /** Fenêtre de lissage de l'altitude, en nombre de points. */
  lissage?: number;
  /** Hystérésis du dénivelé, en mètres. */
  seuil?: number;
  /** Nombre de points du profil rendu. */
  points?: number;
};

export type StatsGpx = {
  nom: string | null;
  distanceKm: number;
  dPlusM: number;
  dMinusM: number;
  dureeSecondes: number | null;
  /** L'instant du DÉPART : la première chose qu'affiche une montre, et la seule
   *  qu'on ne retrouve nulle part ailleurs une fois la photo choisie. */
  debutMs: number | null;
  profil: PointProfil[];
  distanceSource: SourceDistance;
};

export function statsDeGpx(xml: unknown, options: OptionsStats = {}): StatsGpx | null {
  const { points, nom } = parseGpx(xml);
  if (points.length < 2) return null;

  const { cumul, source } = distanceCumulee(points);

  // LE PROFIL PORTE LE CUMUL. L'hystérésis tourne sur l'altitude à PLEINE
  // résolution, et son cumul point par point suit jusque dans le profil
  // décimé : c'est ce qui permet ensuite de dire le D+ d'une journée par une
  // soustraction, plutôt que par un second calcul qui n'aurait pas donné le
  // même total.
  const avecAlt = points
    .map((p, i) => ({ km: cumul[i]! / 1000, alt: p.alt }))
    .filter((p): p is { km: number; alt: number } => p.alt !== null);
  const altitudes = avecAlt.map((p) => p.alt);
  const { dPlus, dMinus, cumul: dCumul } =
    altitudes.length > 1
      ? deniveleCumule(
          moyenneGlissante(altitudes, options.lissage ?? LISSAGE_ALTITUDE),
          options.seuil ?? SEUIL_DENIVELE,
        )
      : { dPlus: 0, dMinus: 0, cumul: altitudes.map(() => ({ dp: 0, dm: 0 })) };

  const profil = decimer(
    avecAlt.map((p, i) => ({ km: p.km, alt: p.alt, dp: dCumul[i]!.dp, dm: dCumul[i]!.dm })),
    options.points ?? 400,
  );

  const t0 = points.find((p) => p.tMs !== null)?.tMs ?? null;
  const t1 = [...points].reverse().find((p) => p.tMs !== null)?.tMs ?? null;

  return {
    nom,
    distanceKm: cumul[cumul.length - 1]! / 1000,
    dPlusM: Math.round(dPlus),
    dMinusM: Math.round(dMinus),
    dureeSecondes: t0 !== null && t1 !== null && t1 > t0 ? Math.round((t1 - t0) / 1000) : null,
    debutMs: t0,
    profil,
    distanceSource: source,
  };
}

export type PointProfilDetaille = {
  km: number;
  alt: number;
  lat: number;
  lng: number;
  dp: number;
  dm: number;
};

export type ProfilGpx = {
  totalKm: number;
  dPlusM: number;
  dMinusM: number;
  elevMinM: number;
  elevMaxM: number;
  profile: PointProfilDetaille[];
};

export function profilDeGpx(xml: unknown, options: OptionsStats = {}): ProfilGpx | null {
  const { points } = parseGpx(xml);
  if (points.length < 2) return null;

  const { cumul } = distanceCumulee(points);

  const avecAlt: { alt: number; lat: number; lon: number; km: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.alt !== null) avecAlt.push({ alt: p.alt, lat: p.lat, lon: p.lon, km: cumul[i]! / 1000 });
  }
  if (avecAlt.length < 2) return null;

  const lisses = moyenneGlissante(
    avecAlt.map((x) => x.alt),
    options.lissage ?? LISSAGE_ALTITUDE,
  );
  const { dPlus, dMinus, cumul: cumulDenivele } = deniveleCumule(
    lisses,
    options.seuil ?? SEUIL_DENIVELE,
  );

  let elevMin = Infinity;
  let elevMax = -Infinity;
  for (const a of lisses) {
    if (a < elevMin) elevMin = a;
    if (a > elevMax) elevMax = a;
  }

  const complet: PointProfilDetaille[] = avecAlt.map((x, i) => ({
    km: Number(x.km.toFixed(2)),
    alt: Math.round(lisses[i]!),
    lat: Number(x.lat.toFixed(5)),
    lng: Number(x.lon.toFixed(5)),
    dp: Math.round(cumulDenivele[i]!.dp),
    dm: Math.round(cumulDenivele[i]!.dm),
  }));

  return {
    totalKm: Number((cumul[cumul.length - 1]! / 1000).toFixed(2)),
    dPlusM: Math.round(dPlus),
    dMinusM: Math.round(dMinus),
    elevMinM: Math.round(elevMin),
    elevMaxM: Math.round(elevMax),
    profile: decimer(complet, options.points ?? 400),
  };
}
