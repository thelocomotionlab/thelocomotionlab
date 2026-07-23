// lib/liveTraceColors.js
//
// Couleur des TRACES des cartes du live (couches maplibre + point de survol
// du profil altimétrique). Fuchsia cartographique : la seule teinte absente
// de TOUS les fonds (routes orange, forêts vertes, ombrages bruns, toits) —
// même règle que les GPS outdoor. Hors charte ASSUMÉ (décision 2026-07-24) :
// les couleurs du labo (terracotta/ambre) se fondent dans le relief. Les deux
// traits (itinéraire en tirets fins, vécu plein épais) partagent cette teinte
// et reposent sur un liseré blanc pour rester lisibles sur satellite.
export const traceColors = {
  line: "#D6246E",
  casing: "#FFFFFF",
};
