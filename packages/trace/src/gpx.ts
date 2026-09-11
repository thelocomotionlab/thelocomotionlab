// packages/trace/src/gpx.ts
//
// Lecture d'un GPX de MONTRE (export Coros, Garmin…).
//
// POURQUOI UN PARSEUR MAISON plutôt que `@tmcw/togeojson` (déjà dans le dépôt) :
// togeojson ne rend que la géométrie, or le fichier porte des données qu'on ne
// veut surtout pas jeter —
//   • `<gpxdata:distance>`, la distance CUMULÉE mesurée par la montre. Elle vaut
//     mieux que tout ce qu'on peut recalculer : sur la Croix de Belledonne, la
//     montre annonce 24,26 km quand la somme des segments de sa PROPRE trace n'en
//     donne que 22,86. L'écart n'est pas une erreur, c'est sa méthode
//     (intégration à la seconde) ; c'est aussi le chiffre que Valentin voit ;
//   • `<gpxtpx:hr>` et `<gpxtpx:cad>`, la fréquence cardiaque et la cadence, que
//     Survol affiche en direct pendant le survol.
//
// Le parseur travaille sur une CHAÎNE, sans DOM : le même code tourne dans le
// navigateur, sous Node et sous les tests. 21 000 points lus en ~150 ms.
//
// Les préfixes de namespace sont IGNORÉS (`(?:\w+:)?`) : Coros écrit
// `gpxdata:distance`, Garmin `ns3:hr`, d'autres rien du tout. Cadrer sur un
// préfixe précis revient à ne lire qu'une marque de montre.

import { haversine } from "./geo.ts";
import type { PointBrut } from "./types.ts";

const ATTR = (nom: string) => new RegExp(`\\b${nom}\\s*=\\s*["']([^"']+)["']`);
const ELE = /<ele>\s*([-\d.eE+]+)\s*<\/ele>/;
const TIME = /<time>\s*([^<\s]+)\s*<\/time>/;
const DIST = /<(?:\w+:)?distance>\s*([\d.eE+]+)\s*<\/(?:\w+:)?distance>/;
const HR = /<(?:\w+:)?hr>\s*([\d.]+)\s*<\/(?:\w+:)?hr>/;
const CAD = /<(?:\w+:)?cad>\s*([\d.]+)\s*<\/(?:\w+:)?cad>/;
const NOM = /<trk>[\s\S]*?<name>\s*([^<]*?)\s*<\/name>/;

const LAT = ATTR("lat");
const LON = ATTR("lon");

/** Les entités XML nommées qu'un GPX écrit réellement. */
const ENTITES: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
  nbsp: "\u00A0",
};

const ENTITE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g;

/**
 * LE TEXTE D'UN GPX, ENTITÉS LUES.
 *
 * Un nom de trace vient d'un fichier, et un fichier écrit `l&apos;Oisans` et
 * `GR&#174;54` : sans cette lecture, le balisage brut se retrouve tel quel dans
 * le titre d'une planche publiée.
 *
 * UNE SEULE PASSE, et c'est ce qui rend `&amp;` sûr : le remplacement ne
 * relit pas ce qu'il vient d'écrire, donc `&amp;apos;` — une esperluette
 * échappée suivie du mot — reste `&apos;` au lieu de devenir une apostrophe.
 */
function decoder(texte: string): string {
  return texte.replace(ENTITE, (tout, dec: string, hex: string, nom: string) => {
    const code = dec ? Number(dec) : hex ? Number.parseInt(hex, 16) : NaN;
    if (Number.isFinite(code)) {
      // Hors plage, `fromCodePoint` jette : une entité fautive reste du texte.
      if (code < 0 || code > 0x10ffff) return tout;
      return String.fromCodePoint(code);
    }
    return ENTITES[nom?.toLowerCase()] ?? tout;
  });
}

/** Un nombre fini, ou `null` — jamais un `NaN` qui contaminerait une somme. */
function nombre(brut: string | undefined): number | null {
  const v = Number.parseFloat(brut ?? "");
  return Number.isFinite(v) ? v : null;
}

/**
 * Les points d'un GPX, et le nom de la trace.
 *
 * Le scanner de `<trkpt>` est construit à CHAQUE APPEL : un `RegExp` global
 * déclaré une fois pour toutes garde son `lastIndex` d'un appel sur l'autre et
 * la deuxième lecture d'un même fichier n'en rend que la moitié.
 */
export function parseGpx(xml: unknown): { nom: string | null; points: PointBrut[] } {
  const texte = typeof xml === "string" ? xml : "";
  const bloc = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  const points: PointBrut[] = [];
  let m: RegExpExecArray | null;
  while ((m = bloc.exec(texte)) !== null) {
    const attrs = m[1] ?? "";
    const corps = m[2] ?? "";
    const lat = nombre(attrs.match(LAT)?.[1]);
    const lon = nombre(attrs.match(LON)?.[1]);
    if (lat === null || lon === null) continue;

    const tMs = Date.parse(corps.match(TIME)?.[1] ?? "");
    points.push({
      lat,
      lon,
      alt: nombre(corps.match(ELE)?.[1]),
      tMs: Number.isFinite(tMs) ? tMs : null,
      dist: nombre(corps.match(DIST)?.[1]),
      fc: nombre(corps.match(HR)?.[1]),
      cadence: nombre(corps.match(CAD)?.[1]),
    });
  }
  const nom = texte.match(NOM)?.[1];
  return { nom: nom ? decoder(nom) : null, points };
}

/**
 * La distance cumulée en mètres, point par point, et sa source.
 *
 * La montre fait foi quand le fichier la porte ; la géométrie prend le relais
 * sinon. Une distance qui RECULE est aberrante (un point corrompu) : on garde
 * alors la dernière valeur valide plutôt que de laisser le profil se replier.
 */
export function distanceCumulee(
  points: readonly PointBrut[],
): { cumul: number[]; source: "montre" | "geometrie" } {
  const cumul = new Array<number>(points.length).fill(0);
  const dernier = points[points.length - 1]?.dist ?? null;

  if (dernier !== null && dernier > 0) {
    let precedent = 0;
    for (let i = 0; i < points.length; i += 1) {
      const d = points[i]!.dist ?? precedent;
      precedent = d >= precedent ? d : precedent;
      cumul[i] = precedent;
    }
    return { cumul, source: "montre" };
  }

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumul[i] = cumul[i - 1]! + haversine(a.lon, a.lat, b.lon, b.lat);
  }
  return { cumul, source: "geometrie" };
}
