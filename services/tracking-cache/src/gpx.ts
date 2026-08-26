// services/tracking-cache/src/gpx.ts
//
// Écriture d'un GPX depuis les positions collectées pendant une aventure.
//
// DEUX SOURCES, et le choix compte :
//   • le PROFIL (live-positions.json) — la série filtrée : dérive statique
//     écartée (minDistanceThreshold), altitudes lissées. C'est ce que la page
//     /live a montré, et c'est ce qu'on veut relire ou réimporter ;
//   • le CACHE BRUT (live-positions-cache.json) — tout ce que Traccar a rendu,
//     sans filtre. Le vrai relevé, zigzags de bivouac compris.
//
// ⚠️ La distance qu'un lecteur de GPX recalculera depuis la géométrie NE SERA
// PAS celle affichée par `./track status` : cette dernière porte
// `samplingCorrection`, recalée sur la montre. Un GPX ne transporte pas de
// distance — seulement des points. L'écart est le coefficient, rien d'autre.

/** Un point prêt à écrire. L'altitude et l'horodatage sont facultatifs. */
export type PointGpx = {
  lat: number;
  lon: number;
  ele?: number | null;
  time?: string | null;
};

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ISO strict : Traccar rend parfois « +00:00 » là où un GPX attend « Z ». */
function instant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Sérialise une trace en GPX 1.1. Les points sans coordonnées finies sont
 * écartés — un `<trkpt>` sans lat/lon rend le fichier illisible par la plupart
 * des lecteurs, et une position nulle chez Traccar n'est jamais une position.
 */
export function versGpx(
  points: PointGpx[],
  options: { nom: string; creePar?: string } = { nom: "Trace" },
): string {
  const valides = points.filter(
    (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon),
  );

  const lignes: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${echapper(options.creePar ?? "the-locomotion-lab/tracking-cache")}" ` +
      'xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    "  <metadata>",
    `    <name>${echapper(options.nom)}</name>`,
  ];

  // L'horodatage du fichier = celui du PREMIER point, pas l'heure d'export :
  // c'est la date de la sortie qui intéresse un lecteur de GPX.
  const debut = valides.map((p) => instant(p.time)).find((t) => t !== null);
  if (debut) lignes.push(`    <time>${debut}</time>`);
  lignes.push("  </metadata>", "  <trk>", `    <name>${echapper(options.nom)}</name>`, "    <trkseg>");

  for (const p of valides) {
    const t = instant(p.time);
    const corps: string[] = [];
    if (Number.isFinite(p.ele as number)) corps.push(`<ele>${(p.ele as number).toFixed(1)}</ele>`);
    if (t) corps.push(`<time>${t}</time>`);
    const ouvrant = `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">`;
    lignes.push(corps.length ? `${ouvrant}${corps.join("")}</trkpt>` : `${ouvrant}</trkpt>`);
  }

  lignes.push("    </trkseg>", "  </trk>", "</gpx>", "");
  return lignes.join("\n");
}
