// packages/ui/src/icones.ts
//
// LE VOCABULAIRE D'ICÔNES DU LABO — le même sur la carte du direct, dans le
// pointillé d'un profil et dans le texte d'une planche du studio. Une icône
// ajoutée ici est disponible partout.
//
// ── AJOUTER UNE ICÔNE ────────────────────────────────────────────────────
// 1. Choisis-la sur https://lucide.dev/icons
// 2. Ajoute son nom au `import` ci-dessous (en PascalCase, comme sur le site)
// 3. Ajoute une ligne dans WAYPOINT_ICONES avec la clé que TU veux écrire
//    (en minuscules, sans accent)
//
// ⚠ Les imports sont NOMMÉS UN PAR UN, volontairement. `import { icons } from
// "lucide-react"` embarquerait les ~1 500 icônes de la bibliothèque dans le
// bundle de /live — une page qui charge déjà maplibre. Ici, seules les icônes
// listées partent au navigateur (cf. optimizePackageImports).

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Anchor,
  Apple,
  Backpack,
  Bandage,
  Battery,
  BedDouble,
  Bike,
  Binoculars,
  BookOpen,
  Brain,
  Calendar,
  Camera,
  Car,
  ChartColumn,
  ChartLine,
  CircleCheck,
  CircleHelp,
  Clock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Coffee,
  Compass,
  Cookie,
  Cross,
  CupSoda,
  Droplets,
  Dumbbell,
  Eye,
  Feather,
  Flag,
  FlagTriangleRight,
  Flame,
  FlaskConical,
  Footprints,
  Gauge,
  GlassWater,
  Headphones,
  Heart,
  HeartPulse,
  Hourglass,
  House,
  Lightbulb,
  Link,
  MapPin,
  Map,
  MessageCircle,
  Mic,
  Microscope,
  Moon,
  Mountain,
  MountainSnow,
  NotebookPen,
  PawPrint,
  Pill,
  Rabbit,
  Ruler,
  Salad,
  Scale,
  Sandwich,
  SatelliteDish,
  Search,
  Share2,
  Signpost,
  Snowflake,
  Soup,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Tent,
  Thermometer,
  ThermometerSnowflake,
  Timer,
  Trees,
  TriangleAlert,
  Turtle,
  Users,
  Utensils,
  Video,
  Waypoints,
  Weight,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

import { Sandale } from "./iconesMaison.ts";

export const WAYPOINT_ICONES: Record<string, LucideIcon> = {
  // Relief
  sommet: MountainSnow,
  montagne: Mountain,
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
  // Le corps et la tête — le vocabulaire des intentions, pas des repères de
  // carte : « cultiver la robustesse », « choquer l'organisme », « éprouver mon
  // animalité ». Ces planches-là parlent d'un état, pas d'un lieu.
  pousse: Sprout,
  physiologie: HeartPulse,
  choc: Zap,
  limite: Gauge,
  mental: Brain,
  animal: PawPrint,
  // Avec qui, et vers où
  amis: Users,
  explorer: Compass,
  // Regarder de près — le vocabulaire du labo quand il analyse plutôt qu'il
  // raconte : une planche « comprendre » n'a pas les mêmes images qu'un récit.
  loupe: Search,
  jumelles: Binoculars,
  microscope: Microscope,
  fiole: FlaskConical,
  regle: Ruler,
  balance: Scale,
  cible: Target,
  courbe: ChartLine,
  barres: ChartColumn,
  // Le corps
  pouls: Activity,
  coeur: Heart,
  force: Dumbbell,
  blessure: Bandage,
  // Le temps qui passe (le chrono est plus haut)
  calendrier: Calendar,
  heure: Clock,
  sablier: Hourglass,
  lievre: Rabbit,
  tortue: Turtle,
  // Le terrain
  carte: Map,
  itineraire: Waypoints,
  panneau: Signpost,
  // Le ciel
  soleil: Sun,
  nuage: Cloud,
  brouillard: CloudFog,
  orage: CloudLightning,
  froid: ThermometerSnowflake,
  temperature: Thermometer,
  feu: Flame,
  // Dire et publier
  micro: Mic,
  message: MessageCircle,
  partage: Share2,
  lien: Link,
  oeil: Eye,
  casque: Headphones,
  video: Video,
  carnet: NotebookPen,
  livre: BookOpen,
  plume: Feather,
  // Ponctuation
  idee: Lightbulb,
  etoile: Star,
  eclat: Sparkles,
  valide: CircleCheck,
  question: CircleHelp,
  ancre: Anchor,
  // Signalement
  photo: Camera,
  danger: TriangleAlert,
  secours: Cross,
  repere: MapPin,
};

/** Les clés écrivables, triées — ce que propose le filtre du tiroir Éléments. */
export const CLES_ICONES: string[] = Object.keys(WAYPOINT_ICONES).sort();

export function iconeConnue(cle: string): boolean {
  return Object.hasOwn(WAYPOINT_ICONES, cle);
}
