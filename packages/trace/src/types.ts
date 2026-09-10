// packages/trace/src/types.ts
//
// LES DEUX LECTURES D'UN MÊME FICHIER.
//
// Une trace se lit de deux façons, et le studio a besoin des deux :
//
//   • EN KILOMÈTRES — `Trace`. C'est la lecture des planches image : un
//     itinéraire, son profil, et des coupures de journée posées à un kilomètre
//     donné. Elle marche sur une trace PRÉVUE, qui n'a aucun horodatage ; c'est
//     pour ça qu'elle est kilométrique et pas horaire.
//
//   • EN SECONDES — `Seance`. C'est la lecture de Survol : ce qui s'est passé,
//     seconde par seconde, avec l'allure qui tombe dans la montée et la
//     fréquence cardiaque qui monte. Elle EXIGE une montre.
//
// Les deux sortent du même `PointBrut`, et les deux annoncent les mêmes
// chiffres : `dPlusM` d'une `Seance` et `dPlusM` d'une `Trace` passent par la
// même hystérésis sur la même altitude lissée (cf. denivele.ts). Deux chaînes
// de calcul auraient fini par afficher deux D+ pour une seule sortie.

/** Un couple `[longitude, latitude]` — l'ordre de GeoJSON, celui du dépôt. */
export type Coord = [number, number];

/** Un point tel que le fichier le donne, sans rien lisser ni compléter. */
export type PointBrut = {
  lat: number;
  lon: number;
  /** Mètres. `null` si le fichier ne porte pas d'altitude sur ce point. */
  alt: number | null;
  /** Millisecondes epoch. `null` sur un itinéraire tracé à la main. */
  tMs: number | null;
  /** Distance CUMULÉE mesurée par la montre, en mètres (`gpxdata:distance`). */
  dist: number | null;
  /** Battements par minute (`gpxtpx:hr`). */
  fc: number | null;
  /** Pas ou tours par minute (`gpxtpx:cad`). */
  cadence: number | null;
};

/** Un point de la silhouette altimétrique. */
export type PointProfil = { km: number; alt: number };

/** D'où vient la distance annoncée — la montre fait foi quand elle parle. */
export type SourceDistance = "montre" | "geometrie";

/** Ce qui a produit la trace. */
export type SourceTrace = "gpx" | "track.json" | "fusion";

/**
 * L'itinéraire, lu en kilomètres.
 *
 * `cumul[i]` est le kilomètre du point `coords[i]` : c'est lui qui fait le lien
 * entre la carte et le profil, et donc qui permet de couper une journée au même
 * endroit sur les deux.
 */
export type Trace = {
  nom: string | null;
  totalKm: number;
  dPlusM: number;
  dMinusM: number;
  profil: PointProfil[];
  coords: Coord[];
  cumul: number[];
  dureeSecondes: number | null;
  /**
   * VÉCUE ou PRÉVUE. Un GPX horodaté vient d'une montre : il raconte quelque
   * chose qui a eu lieu, et le studio bascule ses mots sur le bilan. Un tracé
   * Komoot n'a pas d'heure : c'est un projet, il s'annonce.
   */
  vecue: boolean;
  source: SourceTrace;
  /** Kilomètres de raccord d'une fusion — les coupures de journée naturelles. */
  jonctions?: number[];
};

/** Une journée : sa part de trace, sa part de profil, ses chiffres. */
export type Segment = {
  index: number;
  kmDebut: number;
  kmFin: number;
  distanceKm: number;
  coords: Coord[];
  profil: PointProfil[];
  dPlusM: number;
  dMinusM: number;
  altMax: number | null;
};

/**
 * Un point de séance, rééchantillonné au pas fixe et déjà dérivé.
 *
 * Tout y est prêt à afficher : Survol lit un point par image et n'a plus rien à
 * calculer pendant le rendu, ce qui est la condition pour que l'export image
 * par image donne le même résultat sur tout appareil.
 */
export type PointSeance = {
  /** Secondes depuis le premier point. */
  t: number;
  lat: number;
  lon: number;
  /** Altitude lissée, en mètres. */
  alt: number;
  /** Distance cumulée, en mètres. */
  dist: number;
  /** Mètres par seconde, lissés. */
  vitesse: number;
  /** Secondes par kilomètre. `null` à l'arrêt, où l'allure n'existe pas. */
  allure: number | null;
  /** Pente en pourcents, signée. */
  pente: number;
  /** Cap en degrés (0 = nord, 90 = est), lissé. */
  cap: number;
  fc: number | null;
  cadence: number | null;
  /** D+ accumulé jusqu'ici, en mètres. */
  dPlus: number;
  enPause: boolean;
};

/** Un arrêt : la montre tourne, le coureur non. */
export type Pause = { debut: number; fin: number };

/** Les chiffres de la séance — la source des variables `{distance}`, `{allure}`… */
export type ResumeSeance = {
  nom: string | null;
  /** Millisecondes epoch du départ, pour dater la publication. */
  debutMs: number | null;
  distanceKm: number;
  dPlusM: number;
  dMinusM: number;
  /** Temps écoulé, pauses comprises. */
  dureeSecondes: number | null;
  /** Temps en mouvement, pauses retirées. */
  dureeMouvementSecondes: number | null;
  /** Secondes par kilomètre, sur le temps en mouvement. */
  allureMoyenne: number | null;
  /** Mètres par seconde, sur le temps en mouvement. */
  vitesseMoyenne: number | null;
  fcMoyenne: number | null;
  fcMax: number | null;
  cadenceMoyenne: number | null;
  altMinM: number | null;
  altMaxM: number | null;
  distanceSource: SourceDistance;
};

/**
 * La séance rejouable.
 *
 * `horodatee: false` signale une séance D'ITINÉRAIRE : les points ont été posés
 * sur une vitesse constante faute d'horaires. Survol la survole quand même,
 * mais les chiffres de temps (allure, durée, FC) n'y veulent rien dire et
 * l'habillage doit les taire.
 */
export type Seance = {
  nom: string | null;
  points: PointSeance[];
  pauses: Pause[];
  horodatee: boolean;
  /** Secondes entre deux points. */
  pas: number;
  resume: ResumeSeance;
};
