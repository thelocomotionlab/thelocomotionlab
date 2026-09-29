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
//
// `phases`, facultatif, colore certaines barres d'un jeton de la charte et les
// nomme dans une légende sous le graphe — la figure des planches du studio.
// Sans phases, la figure ne change pas.

import { brandColors } from "@locomotionlab/ui";

/** Le trait des barres : le bleu-vert de la charte, assombri. */
const CONTOUR_DES_BARRES = brandColors.primaryDark;

/** Deux décimales quand la série en a, aucune sinon. */
function precision(valeurs) {
  return valeurs.some((valeur) => !Number.isInteger(valeur)) ? 2 : 0;
}

/**
 * La phase de chaque point de l'abscisse, ou null.
 *
 * @param {string[]} abscisse
 * @param {{nom: string, couleur: string, points: string[]}[]} phases
 */
export function phasesParPoint(abscisse, phases = []) {
  return abscisse.map((point) => phases.find((phase) => phase.points.includes(point)) ?? null);
}

/**
 * @param {{abscisse: string[], series: {nom: string, unite: string, valeurs: number[]}[], phases?: {nom: string, couleur: string, points: string[]}[]}} graphe
 * @returns {object|null} une spec Plotly, ou null si le graphe est vide
 */
export function specDuGraphe(graphe) {
  const [barres, ...courbes] = graphe.series ?? [];
  if (!barres) return null;

  const phases = graphe.phases ?? [];
  const avecPhases = phases.length > 0;
  const parPoint = phasesParPoint(graphe.abscisse, phases);
  const couleurDe = (phase) => brandColors[phase.couleur] ?? brandColors.primary;

  const data = [
    {
      type: "bar",
      name: barres.nom,
      x: graphe.abscisse,
      y: barres.valeurs,
      marker: avecPhases
        ? {
            // Une barre de phase n'a pas de contour bleu-vert : elle garde sa
            // teinte pleine, comme sur la planche.
            color: parPoint.map((phase) => (phase ? couleurDe(phase) : brandColors.primary)),
            line: {
              color: parPoint.map((phase) => (phase ? couleurDe(phase) : CONTOUR_DES_BARRES)),
              width: 1,
            },
          }
        : { color: brandColors.primary, line: { color: CONTOUR_DES_BARRES, width: 1 } },
      ...(avecPhases
        ? {
            customdata: parPoint.map((phase) => (phase ? ` · ${phase.nom}` : "")),
            hovertemplate: `<b>%{y:.${precision(barres.valeurs)}f} ${barres.unite}</b>%{customdata}<extra></extra>`,
          }
        : { hovertemplate: `<b>%{y:.${precision(barres.valeurs)}f} ${barres.unite}</b><extra></extra>` }),
      showlegend: false,
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
      showlegend: false,
    })),
    // La légende ne nomme que les phases : une entrée vide par phase, qui ne
    // dessine rien et ne se survole pas.
    ...phases.map((phase) => ({
      type: "bar",
      name: phase.nom,
      x: [null],
      y: [null],
      marker: { color: couleurDe(phase) },
      hoverinfo: "skip",
      showlegend: true,
    })),
  ];

  // Avec des phases, chaque titre d'axe prend la couleur de sa série, comme
  // sur la planche.
  const titreEnCouleur = (couleur) => (avecPhases ? { font: { color: couleur } } : {});

  return {
    data,
    layout: {
      yaxis: {
        title: { text: `${barres.nom} (${barres.unite})`, ...titreEnCouleur(brandColors.primaryDark) },
        rangemode: "tozero",
      },
      ...(courbes[0]
        ? {
            yaxis2: {
              title: {
                text: `${courbes[0].nom} (${courbes[0].unite})`,
                ...titreEnCouleur(brandColors.accentInk),
              },
              overlaying: "y",
              side: "right",
              rangemode: "tozero",
            },
          }
        : {}),
      // Les étiquettes montent vers leur graduation : elles se lisent de gauche
      // à droite et coûtent le tiers de la hauteur qu'elles prendraient droites.
      xaxis: { tickangle: -45 },
      showlegend: avecPhases,
      ...(avecPhases
        ? { legend: { orientation: "h", x: 0, xanchor: "left", y: -0.28, yanchor: "top" } }
        : {}),
      hovermode: "x unified",
    },
  };
}
