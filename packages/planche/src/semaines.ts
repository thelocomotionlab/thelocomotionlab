// packages/planche/src/semaines.ts
//
// LES SEMAINES D'ENTRAÎNEMENT : le volume d'une saison, en barres.
//
// C'est le graphique du site, refait POUR UNE PLANCHE. Les deux ne visent pas
// le même œil : sur un écran d'ordinateur on survole une barre pour lire sa
// valeur, on lit une grille fine et neuf graduations. Sur une story regardée
// trois secondes au pouce, rien de tout ça n'arrive — il faut des barres
// épaisses, trois graduations, et des étiquettes qu'on lise de loin.
//
// DES SÉRIES LIBRES, pas trois métriques fixes : c'est l'auteur qui dit ce
// qu'il mesure et dans quelle unité. Mais DEUX MONTRÉES AU PLUS — une en
// barres, une en courbe. Trois échelles sans rapport — cent kilomètres, cinq
// mille mètres, huit heures — ne se superposent pas sans mentir sur l'une
// d'elles.
//
// LA COULEUR D'UNE BARRE EST UNE PHRASE. Dix-sept barres de la même teinte ne
// disent que le volume ; deux bleues, quatre ocre et une fuchsia racontent un
// bloc, un affûtage et une course. D'où la couleur par barre, et la légende qui
// la nomme.

import { CORPS, LARGEUR_REFERENCE, rgba } from "./charte.ts";
import { brandColors } from "@locomotionlab/ui/tokens";
import type { Ctx2D } from "./canvas.ts";
import type { ContexteRendu } from "./contexte.ts";
import type { BoitePx, ElementSemaines, SerieChiffree } from "./types.ts";

/* ------------------------------------------------------------- les chiffres */

/**
 * LE BLOC DE DONNÉES, tel qu'on l'écrit à la main.
 *
 *     abscisse: ["S1", "S2", "S3"]
 *     series:
 *       - { nom: "Distance", unite: "km", valeurs: [77, 84, 94] }
 *       - { nom: "Dénivelé", unite: "m", valeurs: [3200, 3600, 4500] }
 *
 * LA LECTURE EST TOLÉRANTE, et c'est le point : ce bloc se tape et se recolle à
 * la main, et il y manque une accolade une fois sur deux. Refuser tout le bloc
 * pour un crochet oublié ferait perdre dix-sept valeurs à quelqu'un qui voulait
 * en corriger une. On lit donc ce qu'on comprend et on laisse le reste.
 */
export function lireLesSeries(brut: string): { abscisse: string[]; series: SerieChiffree[] } {
  const texte = typeof brut === "string" ? brut : "";
  const abscisse = listeDe(texte.match(/abscisse\s*:\s*\[([^\]]*)\]?/)?.[1] ?? "").map(sansGuillemets);

  const series: SerieChiffree[] = [];
  // Chaque entrée commence par un tiret de liste. On découpe là-dessus plutôt
  // que d'analyser du YAML : le format est le nôtre, il tient en trois clés.
  for (const bloc of texte.split(/^\s*-\s/m).slice(1)) {
    const valeurs = listeDe(bloc.match(/valeurs\s*:\s*\[([^\]]*)\]?/)?.[1] ?? "")
      .map((v) => Number.parseFloat(v.replace(",", ".")))
      .map((v) => (Number.isFinite(v) ? v : 0));
    if (valeurs.length === 0) continue;
    series.push({
      nom: sansGuillemets(bloc.match(/nom\s*:\s*("[^"]*"|'[^']*'|[^,}\n]*)/)?.[1] ?? ""),
      unite: sansGuillemets(bloc.match(/unite\s*:\s*("[^"]*"|'[^']*'|[^,}\n]*)/)?.[1] ?? ""),
      valeurs,
    });
  }
  return { abscisse, series };
}

function listeDe(brut: string): string[] {
  return brut
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

function sansGuillemets(v: string): string {
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

/** Le bloc réécrit depuis l'élément — c'est lui qu'affiche le champ. */
export function ecrireLesSeries(e: {
  abscisse: readonly string[];
  series: readonly SerieChiffree[];
}): string {
  const lignes = [`abscisse: [${e.abscisse.map((a) => `"${a}"`).join(", ")}]`, "series:"];
  for (const s of e.series) {
    lignes.push(`  - { nom: "${s.nom}", unite: "${s.unite}", valeurs: [${s.valeurs.join(", ")}] }`);
  }
  return lignes.join("\n");
}

/* ------------------------------------------------------------ la géométrie */

/** La série montrée à cet index, si elle existe. */
export function serieDe(e: ElementSemaines, index: number | null): SerieChiffree | null {
  if (index === null) return null;
  return e.series[index] ?? null;
}

/** Combien de barres le graphique porte : l'abscisse, ou la série à défaut. */
export function nombreDeBarres(e: ElementSemaines): number {
  const serie = serieDe(e, e.barres);
  return Math.max(e.abscisse.length, serie?.valeurs.length ?? 0);
}

/**
 * Le plafond d'un axe : la valeur maximale, arrondie VERS LE HAUT à un cran
 * rond.
 *
 * Un axe qui s'arrête pile sur le maximum colle la plus haute barre au bord et
 * donne une graduation en 87 ou en 4 813, qu'on ne lit pas.
 */
export function plafondDe(max: number): number {
  if (!(max > 0)) return 1;
  const ordre = 10 ** Math.floor(Math.log10(max));
  for (const cran of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (max <= cran * ordre) return cran * ordre;
  }
  return 10 * ordre;
}

/**
 * La graduation écrite pour une valeur.
 *
 * Au-delà du millier on abrège — « 12.8k » plutôt que « 12800 », qui prend la
 * largeur de deux barres et qu'on ne lit pas mieux.
 */
export function graduationDe(valeur: number): string {
  const v = Math.round(valeur);
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${v}`;
}

/** La part de la boîte réservée à la légende, sous le graphique. */
const PART_LEGENDE = 0.16;

/** Les trois graduations d'un axe — zéro compris. */
const GRADUATIONS = 3;

export type Cadre = {
  /** La zone où les barres se dessinent, hors axes et légende. */
  trace: BoitePx;
  /** Largeur d'une colonne, barre et gouttière comprises. */
  colonne: number;
  /** Largeur de la barre elle-même. */
  barre: number;
  hautBarres: number;
  hautCourbe: number;
  corps: number;
  /** La place sous l'axe : les étiquettes, droites ou en biais. */
  reserveBas: number;
};

/**
 * La géométrie du graphique dans sa boîte.
 *
 * ISOLÉE parce qu'elle sert DEUX FOIS : à dessiner, et à savoir quelle barre on
 * vient de cliquer. Deux calculs séparés auraient fini par désigner deux barres
 * différentes pour le même point.
 */
export function cadreDesSemaines(e: ElementSemaines, b: BoitePx): Cadre | null {
  const n = nombreDeBarres(e);
  if (n === 0 || b.l <= 0 || b.h <= 0) return null;
  const corps = Math.max(9, (e.taille || CORPS.pied) * (b.l / LARGEUR_REFERENCE));

  const legende = e.legende.length > 0 ? Math.max(corps * 2.2, b.h * PART_LEGENDE) : 0;
  const bas = reserveDesEtiquettes(e, corps);
  const gauche = e.axes ? corps * 2.6 : 0;
  const courbe = serieDe(e, e.courbe);
  const droite = e.axes && courbe ? corps * 2.6 : 0;
  // L'AIR DU HAUT : la graduation la plus haute s'écrit AU-DESSUS de sa ligne,
  // et sans cette réserve elle sortait de la boîte, coupée en deux. Le nom de
  // la série, quand il est écrit, prend une ligne de plus.
  const haut = e.axes ? corps * (e.titresAxes ? 1.9 : 0.6) : 0;

  const trace: BoitePx = {
    x: b.x + gauche,
    y: b.y + haut,
    l: Math.max(1, b.l - gauche - droite),
    h: Math.max(1, b.h - haut - legende - bas),
  };
  const serieBarres = serieDe(e, e.barres);
  return {
    trace,
    colonne: trace.l / n,
    // Une gouttière d'un quart : plus serré, les barres se touchent ; plus
    // large, la saison se lit comme des bâtons épars.
    barre: Math.max(1, (trace.l / n) * 0.72),
    hautBarres: plafondDe(Math.max(0, ...(serieBarres?.valeurs ?? []))),
    hautCourbe: plafondDe(Math.max(0, ...(courbe?.valeurs ?? []))),
    corps,
    reserveBas: bas,
  };
}

/**
 * LA PLACE SOUS L'AXE pour les étiquettes.
 *
 * Droites, une ligne suffit. En biais, la plus longue descend de sa largeur
 * fois le sinus de l'angle — et ici, sans contexte, on ne peut pas la mesurer :
 * on l'estime à 0,56 corps par caractère, la chasse moyenne d'Ubuntu Sans en
 * chiffres et en capitales.
 */
function reserveDesEtiquettes(e: ElementSemaines, corps: number): number {
  const angle = angleDe(e);
  if (angle === 0) return corps * 2.2;
  const pas = Math.max(1, Math.round(e.pasDesLabels));
  const plusLongue = Math.max(
    0,
    ...e.abscisse.filter((_, i) => i % pas === 0).map((l) => l.length),
  );
  const largeur = plusLongue * corps * 0.56;
  return corps * 1.15 + largeur * Math.sin(angle) + corps * 0.25 * Math.cos(angle) + corps * 0.6;
}

/** L'angle en radians, borné à 90° : au-delà, l'étiquette se lirait à l'envers. */
function angleDe(e: ElementSemaines): number {
  const degres = Number.isFinite(e.inclinaison) ? Math.max(0, Math.min(90, e.inclinaison)) : 0;
  return (degres * Math.PI) / 180;
}

/** La barre sous un point, ou `null` — c'est elle qu'on colore au clic. */
export function barreSous(e: ElementSemaines, b: BoitePx, x: number, y: number): number | null {
  const cadre = cadreDesSemaines(e, b);
  if (!cadre) return null;
  const { trace, colonne } = cadre;
  if (y < trace.y || y > trace.y + trace.h) return null;
  if (x < trace.x || x > trace.x + trace.l) return null;
  return Math.max(0, Math.min(nombreDeBarres(e) - 1, Math.floor((x - trace.x) / colonne)));
}

/* --------------------------------------------------------------- le dessin */

export function dessinerSemaines(
  ctx: Ctx2D,
  e: ElementSemaines,
  b: BoitePx,
  c: ContexteRendu,
): void {
  const cadre = cadreDesSemaines(e, b);
  if (!cadre) return;
  const { trace, colonne, barre, hautBarres, hautCourbe, corps, reserveBas } = cadre;
  const serieBarres = serieDe(e, e.barres);
  const serieCourbe = serieDe(e, e.courbe);
  const teinteBarres = e.couleurBarres || brandColors.primary;
  const teinteCourbe = e.couleurCourbe || brandColors.accent;
  const base = trace.y + trace.h;
  const n = nombreDeBarres(e);

  ctx.save();
  ctx.font = `500 ${corps}px ${c.police}`;

  // 1. LES GRADUATIONS, en filets à peine posés. Trois, pas neuf : sur une
  //    planche, une grille dense se lit comme du bruit.
  if (e.axes) {
    for (let k = 0; k <= GRADUATIONS; k += 1) {
      const part = k / GRADUATIONS;
      const y = base - part * trace.h;
      ctx.fillStyle = c.theme.filet;
      ctx.fillRect(trace.x, y, trace.l, Math.max(1, corps * 0.045));

      ctx.fillStyle = c.theme.encreFaible;
      if (serieBarres) ctx.fillText(graduationDe(part * hautBarres), b.x, y + corps * 0.35);
      if (serieCourbe) {
        const droite = graduationDe(part * hautCourbe);
        ctx.fillText(droite, b.x + b.l - ctx.measureText(droite).width, y + corps * 0.35);
      }
    }
    // Le NOM de chaque série en tête de son axe : « 4 500 » ne dit pas s'il
    // s'agit de mètres ou de minutes.
    if (e.titresAxes) {
      const y = trace.y - corps * 0.9;
      if (serieBarres) {
        ctx.fillStyle = teinteBarres;
        ctx.fillText(titreDe(serieBarres), b.x, y);
      }
      if (serieCourbe) {
        ctx.fillStyle = teinteCourbe;
        const titre = titreDe(serieCourbe);
        ctx.fillText(titre, b.x + b.l - ctx.measureText(titre).width, y);
      }
    }
  }

  // 2. LES BARRES, chacune à sa couleur.
  if (serieBarres) {
    for (let i = 0; i < n; i += 1) {
      const valeur = Math.max(0, serieBarres.valeurs[i] ?? 0);
      const haut = (valeur / hautBarres) * trace.h;
      if (!(haut > 0)) continue;
      ctx.fillStyle = e.couleurs[i] || teinteBarres;
      ctx.fillRect(trace.x + i * colonne + (colonne - barre) / 2, base - haut, barre, haut);
    }
  }

  // 3. LA LIGNE DE SOL : sans elle, des barres flottent.
  ctx.fillStyle = rgba(c.theme.encre, 0.35);
  ctx.fillRect(trace.x, base, trace.l, Math.max(1, corps * 0.06));

  // 4. LA COURBE et ses pastilles, sur l'axe de droite.
  if (serieCourbe) {
    const points: [number, number][] = [];
    for (let i = 0; i < n; i += 1) {
      const valeur = Math.max(0, serieCourbe.valeurs[i] ?? 0);
      points.push([
        trace.x + i * colonne + colonne / 2,
        base - (valeur / hautCourbe) * trace.h,
      ]);
    }
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0]![0], points[0]![1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      ctx.strokeStyle = teinteCourbe;
      ctx.lineWidth = Math.max(1.5, corps * 0.13);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
    const rayon = Math.max(2, corps * 0.3);
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(x, y, rayon, 0, Math.PI * 2);
      ctx.fillStyle = brandColors.deep;
      ctx.fill();
      ctx.strokeStyle = c.theme.fond;
      ctx.lineWidth = Math.max(1, corps * 0.07);
      ctx.stroke();
    }
  }

  // 5. LES ÉTIQUETTES D'ABSCISSE, une sur `pasDesLabels`, droites ou en biais.
  const pas = Math.max(1, Math.round(e.pasDesLabels));
  const angle = angleDe(e);
  ctx.fillStyle = c.theme.encreDouce;
  for (let i = 0; i < n; i += 1) {
    const label = e.abscisse[i];
    if (i % pas !== 0 || !label) continue;
    const large = ctx.measureText(label).width;
    const centre = trace.x + i * colonne + colonne / 2;
    if (angle === 0) {
      ctx.fillText(label, centre - large / 2, base + corps * 1.5);
      continue;
    }
    // En biais, c'est la FIN du mot qui se cale sous sa colonne et le mot
    // descend vers la gauche : l'œil le remonte jusqu'à la barre qu'il nomme.
    ctx.save();
    ctx.translate(centre, base + corps * 1.15);
    ctx.rotate(-angle);
    ctx.fillText(label, -large, 0);
    ctx.restore();
  }

  // 6. LA LÉGENDE, qui dit ce que les couleurs racontent.
  if (e.legende.length > 0) {
    const y = base + reserveBas + corps * 0.9;
    const cote = corps * 0.82;
    let x = trace.x;
    for (const l of e.legende) {
      if (!l.texte) continue;
      ctx.fillStyle = l.couleur || teinteBarres;
      ctx.fillRect(x, y - cote * 0.82, cote, cote);
      ctx.fillStyle = c.theme.encreDouce;
      ctx.fillText(l.texte, x + cote * 1.4, y);
      x += cote * 1.4 + ctx.measureText(l.texte).width + corps * 1.4;
    }
  }
  ctx.restore();
}

/** « Distance (km) » — le nom, et l'unité entre parenthèses quand il y en a une. */
function titreDe(s: SerieChiffree): string {
  return s.unite ? `${s.nom} (${s.unite})` : s.nom;
}
