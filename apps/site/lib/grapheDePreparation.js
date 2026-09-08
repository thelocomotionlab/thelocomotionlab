// lib/grapheDePreparation.js
//
// LE GRAPHE DE VOLUME D'UNE PRÉPARATION, en spec Plotly.
//
// Le frontmatter ne décrit que des données — un axe et des séries. Ce module en
// fait la même figure que les billets du carnet : la PREMIÈRE série en barres
// sur l'axe de gauche, les suivantes en courbes à points sur l'axe de droite.
// `hovermode: "x unified"` donne le survol du billet : une semaine survolée
// affiche toutes ses valeurs d'un coup.
//
// Écrire une aventure ne demande donc pas de déposer un JSON dans public/ :
// quatre lignes de YAML suffisent, et la figure est la même.

import { brandColors } from "@locomotionlab/ui";

/** Le trait des barres : le bleu-vert de la charte, assombri. */
const CONTOUR_DES_BARRES = brandColors.primaryDark;

/** Deux décimales quand la série en a, aucune sinon. */
function precision(valeurs) {
  return valeurs.some((valeur) => !Number.isInteger(valeur)) ? 2 : 0;
}

/**
 * @param {{abscisse: string[], series: {nom: string, unite: string, valeurs: number[]}[]}} graphe
 * @returns {object|null} une spec Plotly, ou null si le graphe est vide
 */
export function specDuGraphe(graphe) {
  const [barres, ...courbes] = graphe.series ?? [];
  if (!barres) return null;

  const data = [
    {
      type: "bar",
      name: barres.nom,
      x: graphe.abscisse,
      y: barres.valeurs,
      marker: { color: brandColors.primary, line: { color: CONTOUR_DES_BARRES, width: 1 } },
      hovertemplate: `<b>%{y:.${precision(barres.valeurs)}f} ${barres.unite}</b><extra></extra>`,
    },
    ...courbes.map((serie) => ({
      type: "scatter",
      mode: "lines+markers",
      name: serie.nom,
      x: graphe.abscisse,
      y: serie.valeurs,
      yaxis: "y2",
      line: { color: brandColors.accent, width: 2 },
      marker: {
        color: brandColors.deep,
        size: 10,
        line: { color: brandColors.paper, width: 1 },
      },
      hovertemplate: `<b>%{y:.${precision(serie.valeurs)}f} ${serie.unite}</b><extra></extra>`,
    })),
  ];

  return {
    data,
    layout: {
      yaxis: { title: { text: `${barres.nom} (${barres.unite})` }, rangemode: "tozero" },
      ...(courbes[0]
        ? {
            yaxis2: {
              title: { text: `${courbes[0].nom} (${courbes[0].unite})` },
              overlaying: "y",
              side: "right",
              rangemode: "tozero",
            },
          }
        : {}),
      // Les étiquettes montent vers leur graduation : elles se lisent de gauche
      // à droite et coûtent le tiers de la hauteur qu'elles prendraient droites.
      xaxis: { tickangle: -45 },
      showlegend: false,
      hovermode: "x unified",
    },
  };
}
