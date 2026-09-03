// lib/liveTraceColors.js
//
// Les couleurs des traces vivent désormais avec le reste du look
// cartographique dans @locomotionlab/tracking (mapStyles.ts), partagé par le
// direct, les replays et les cartes GPX. Ce module ne fait que ré-exporter,
// pour que les importeurs existants ne bougent pas.
//
// Import du module FEUILLE (pas de l'index du package) : l'index tire les
// composants carte et leur CSS maplibre, que les tests unitaires du carrousel
// — de purs modules Node — ne sauraient pas charger.
export { traceColors } from "@locomotionlab/tracking/mapStyles";
