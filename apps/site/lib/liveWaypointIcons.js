// lib/liveWaypointIcons.js
//
// Le vocabulaire d'icônes vit désormais avec le reste de la charte, dans
// @locomotionlab/ui : le direct, les profils et le studio y puisent la même
// liste. Ce module ne fait que ré-exporter, plus ce qui est propre aux REPÈRES
// d'une carte — l'icône par défaut et le composant qui la résout.
//
// Import du module FEUILLE (pas de l'index du package) : l'index tire les
// composants de la charte et leur CSS, que les tests unitaires — de purs
// modules Node — ne sauraient pas charger.
import { WAYPOINT_ICONES } from "@locomotionlab/ui/icones";

export { WAYPOINT_ICONES, CLES_ICONES, iconeConnue } from "@locomotionlab/ui/icones";


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
