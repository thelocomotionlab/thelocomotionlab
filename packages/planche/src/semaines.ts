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
// DEUX SÉRIES AU PLUS. Une métrique en barres, une seconde en courbe sur son
// propre axe. Trois échelles sans rapport — cent kilomètres, cinq mille mètres,
// huit heures — ne se superposent pas sans mentir sur l'une d'elles.
//
// LA COULEUR D'UNE BARRE EST UNE PHRASE. Dix-neuf barres de la même teinte ne
// disent que le volume ; deux bleues, quatre ocre et une fuchsia racontent un
// bloc, un affûtage et une course. D'où la couleur par barre, et la légende qui
// la nomme.

import { CORPS, LARGEUR_REFERENCE, rgba } from "./charte.ts";
import { brandColors } from "@locomotionlab/ui/tokens";
import type { Ctx2D } from "./canvas.ts";
import type { ContexteRendu } from "./contexte.ts";
import type {
  BoitePx,
  ElementSemaines,
  MetriqueSemaine,
  SemaineEntrainement,
} from "./types.ts";

/** Ce que vaut une semaine pour la métrique demandée. */
export function valeurDe(s: SemaineEntrainement, quoi: MetriqueSemaine): number {
  const v = quoi === "km" ? s.km : quoi === "dplus" ? s.dplus : s.minutes;
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** L'unité qu'on écrit sur l'axe d'une métrique. */
export function uniteDe(quoi: MetriqueSemaine): string {
  return quoi === "km" ? "km" : quoi === "dplus" ? "m D+" : "h";
}

/**
 * La graduation écrite pour une valeur.
 *
 * Les minutes se disent en HEURES sur un axe : « 480 » ne veut rien dire quand
 * on parle d'une semaine d'entraînement, « 8 h » se lit d'un coup.
 */
export function graduationDe(valeur: number, quoi: MetriqueSemaine): string {
  if (quoi === "minutes") return `${Math.round(valeur / 60)}`;
  if (quoi === "dplus") return valeur >= 1000 ? `${(valeur / 1000).toFixed(1)}k` : `${Math.round(valeur)}`;
  return `${Math.round(valeur)}`;
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
};

/**
 * La géométrie du graphique dans sa boîte.
 *
 * ISOLÉE parce qu'elle sert DEUX FOIS : à dessiner, et à savoir quelle barre on
 * vient de cliquer. Deux calculs séparés auraient fini par désigner deux barres
 * différentes pour le même point.
 */
export function cadreDesSemaines(e: ElementSemaines, b: BoitePx): Cadre | null {
  const n = e.lignes.length;
  if (n === 0 || b.l <= 0 || b.h <= 0) return null;
  const corps = Math.max(9, (e.taille || CORPS.pied) * (b.l / LARGEUR_REFERENCE));

  const legende = e.legende.length > 0 ? Math.max(corps * 2.2, b.h * PART_LEGENDE) : 0;
  const bas = corps * 2.2;
  const gauche = e.axes ? corps * 2.6 : 0;
  const droite = e.axes && e.courbe ? corps * 2.6 : 0;

  // L'AIR DU HAUT : la graduation la plus haute s'écrit AU-DESSUS de sa ligne,
  // et sans cette réserve elle sortait de la boîte, coupée en deux.
  const haut = e.axes ? corps * 0.6 : 0;
  const trace: BoitePx = {
    x: b.x + gauche,
    y: b.y + haut,
    l: Math.max(1, b.l - gauche - droite),
    h: Math.max(1, b.h - haut - legende - bas),
  };
  const colonne = trace.l / n;
  return {
    trace,
    colonne,
    // Une gouttière d'un sixième : plus serré, les barres se touchent ; plus
    // large, la saison se lit comme des bâtons épars.
    barre: Math.max(1, colonne * 0.72),
    hautBarres: plafondDe(Math.max(...e.lignes.map((s) => valeurDe(s, e.barres)))),
    hautCourbe: e.courbe
      ? plafondDe(Math.max(...e.lignes.map((s) => valeurDe(s, e.courbe!))))
      : 1,
    corps,
  };
}

/** La barre sous un point, ou `null` — c'est elle qu'on colore au clic. */
export function barreSous(e: ElementSemaines, b: BoitePx, x: number, y: number): number | null {
  const cadre = cadreDesSemaines(e, b);
  if (!cadre) return null;
  const { trace, colonne } = cadre;
  if (y < trace.y || y > trace.y + trace.h) return null;
  if (x < trace.x || x > trace.x + trace.l) return null;
  return Math.max(0, Math.min(e.lignes.length - 1, Math.floor((x - trace.x) / colonne)));
}

export function dessinerSemaines(
  ctx: Ctx2D,
  e: ElementSemaines,
  b: BoitePx,
  c: ContexteRendu,
): void {
  const cadre = cadreDesSemaines(e, b);
  if (!cadre) return;
  const { trace, colonne, barre, hautBarres, hautCourbe, corps } = cadre;
  const teinteBarres = e.couleurBarres || brandColors.primary;
  const teinteCourbe = e.couleurCourbe || brandColors.accent;
  const base = trace.y + trace.h;

  ctx.save();

  // 1. LES GRADUATIONS, en filets à peine posés. Trois, pas neuf : sur une
  //    planche, une grille dense se lit comme du bruit.
  if (e.axes) {
    ctx.font = `500 ${corps}px ${c.police}`;
    for (let k = 0; k <= GRADUATIONS; k += 1) {
      const part = k / GRADUATIONS;
      const y = base - part * trace.h;
      ctx.fillStyle = c.theme.filet;
      ctx.fillRect(trace.x, y, trace.l, Math.max(1, corps * 0.045));

      ctx.fillStyle = c.theme.encreFaible;
      const gauche = graduationDe(part * hautBarres, e.barres);
      ctx.fillText(gauche, b.x, y + corps * 0.35);
      if (e.courbe) {
        const droite = graduationDe(part * hautCourbe, e.courbe);
        const large = ctx.measureText(droite).width;
        ctx.fillText(droite, b.x + b.l - large, y + corps * 0.35);
      }
    }
  }

  // 2. LES BARRES, chacune à sa couleur.
  e.lignes.forEach((s, i) => {
    const valeur = valeurDe(s, e.barres);
    const haut = (valeur / hautBarres) * trace.h;
    if (!(haut > 0)) return;
    const x = trace.x + i * colonne + (colonne - barre) / 2;
    ctx.fillStyle = s.couleur || teinteBarres;
    ctx.fillRect(x, base - haut, barre, haut);
  });

  // 3. LA LIGNE DE SOL : sans elle, des barres flottent.
  ctx.fillStyle = rgba(c.theme.encre, 0.35);
  ctx.fillRect(trace.x, base, trace.l, Math.max(1, corps * 0.06));

  // 4. LA COURBE et ses pastilles, sur l'axe de droite.
  if (e.courbe) {
    const quoi = e.courbe;
    const points = e.lignes.map((s, i) => {
      const valeur = valeurDe(s, quoi);
      return [
        trace.x + i * colonne + colonne / 2,
        base - (valeur / hautCourbe) * trace.h,
      ] as [number, number];
    });
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

  // 5. LES ÉTIQUETTES D'ABSCISSE, une sur `pasDesLabels`.
  const pas = Math.max(1, Math.round(e.pasDesLabels));
  ctx.font = `500 ${corps}px ${c.police}`;
  ctx.fillStyle = c.theme.encreDouce;
  e.lignes.forEach((s, i) => {
    if (i % pas !== 0 || !s.label) return;
    const large = ctx.measureText(s.label).width;
    ctx.fillText(s.label, trace.x + i * colonne + (colonne - large) / 2, base + corps * 1.5);
  });

  // 6. LA LÉGENDE, qui dit ce que les couleurs racontent.
  if (e.legende.length > 0) {
    const y = base + corps * 3.1;
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
