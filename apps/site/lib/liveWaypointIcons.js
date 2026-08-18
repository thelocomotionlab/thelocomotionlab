// lib/liveWaypointIcons.js
//
// Les icônes disponibles pour les repères (`waypoints`) de lib/liveConfig.js.
// Chaque repère porte un champ `icone` : la clé choisie ici. L'icône apparaît
// sur la carte du live ET en haut du pointillé du profil altimétrique.
//
// ── AJOUTER UNE ICÔNE ────────────────────────────────────────────────────
// 1. Choisis-la sur https://lucide.dev/icons
// 2. Ajoute son nom au `import` ci-dessous (en PascalCase, comme sur le site)
// 3. Ajoute une ligne dans WAYPOINT_ICONES avec la clé que TU veux écrire
//    dans liveConfig (en minuscules, sans accent)
//
// ⚠️ Les imports sont NOMMÉS UN PAR UN, volontairement. `import { icons } from
// "lucide-react"` embarquerait les ~1 500 icônes de la bibliothèque dans le
// bundle de /live — une page qui charge déjà maplibre. Ici, seules les icônes
// listées partent au navigateur (cf. optimizePackageImports, next.config.mjs).

import {
  Apple,
  Backpack,
  Battery,
  BedDouble,
  Bike,
  Camera,
  Car,
  CloudRain,
  Coffee,
  Cookie,
  Cross,
  CupSoda,
  Droplets,
  Flag,
  FlagTriangleRight,
  Footprints,
  GlassWater,
  House,
  MapPin,
  Moon,
  Mountain,
  MountainSnow,
  Pill,
  Salad,
  Sandwich,
  SatelliteDish,
  Snowflake,
  Soup,
  Store,
  Sunrise,
  Sunset,
  Tent,
  Timer,
  Trees,
  TriangleAlert,
  Utensils,
  Weight,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

import { Sandale } from "./iconesMaison";

/** Clé écrite dans liveConfig → composant lucide-react. */
export const WAYPOINT_ICONES = {
  // Relief
  sommet: MountainSnow,
  col: Mountain,
  neige: Snowflake,
  // Le sac et ce qu'il porte
  sac: Backpack,
  poids: Weight,
  batterie: Battery,
  pharmacie: Pill,
  // Manger
  repas: Sandwich,
  chaud: Soup,
  barre: Cookie,
  fruit: Apple,
  salade: Salad,
  cafe: Coffee,
  // Boire — `eau` (le verre) existe déjà plus bas, en logistique
  hydratation: Droplets,
  gourde: CupSoda,
  // Étapes et logistique
  bivouac: Tent,
  refuge: BedDouble,
  eau: GlassWater,
  ravitaillement: Utensils,
  commerce: Store,
  village: House,
  route: Car,
  recharge: Zap,
  // La balise GPS du live — c'est le mot de la maison (docs/live-tracking.md).
  balise: SatelliteDish,
  // Parcours
  depart: Flag,
  arrivee: FlagTriangleRight,
  sentier: Footprints,
  // La sandale n'existe pas chez lucide : elle est dessinée à la maison, au même
  // trait que les autres (cf. lib/iconesMaison.js).
  sandales: Sandale,
  velo: Bike,
  foret: Trees,
  riviere: Waves,
  // Le temps qui passe
  chrono: Timer,
  // Moments et conditions
  "lever-soleil": Sunrise,
  "coucher-soleil": Sunset,
  nuit: Moon,
  pluie: CloudRain,
  vent: Wind,
  // Signalement
  photo: Camera,
  danger: TriangleAlert,
  secours: Cross,
  repere: MapPin,
};

/** Icône utilisée quand `icone` est absent ou inconnu. */
export const ICONE_PAR_DEFAUT = "repere";

/**
 * Composant d'icône d'un repère. Une clé inconnue ne casse jamais la page :
 * elle retombe sur le repère générique (une faute de frappe dans liveConfig
 * ne doit pas faire disparaître la carte en plein direct).
 */
export function iconeDuRepere(cle) {
  return WAYPOINT_ICONES[cle] ?? WAYPOINT_ICONES[ICONE_PAR_DEFAUT];
}

/** Les clés disponibles, triées — pour les messages d'aide et les tests. */
export function clesDisponibles() {
  return Object.keys(WAYPOINT_ICONES).sort();
}
