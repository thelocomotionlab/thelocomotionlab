// packages/planche/src/texte.ts
//
// LE TEXTE ENRICHI DES PLANCHES : gras, italique, souligné, mise en ambre — au
// mot près, dans un simple champ de saisie.
//
// POURQUOI UN BALISAGE EN PLUS DE L'ÉDITION EN PLACE. Un canvas ne sait pas
// afficher de texte riche : `fillText` prend UNE fonte et UNE couleur. Il faut
// donc de toute façon découper la phrase en morceaux et les poser un par un.
// Ce module est ce découpage — l'édition en place écrit dedans, et le balisage
// reste lisible à la saisie et au copier-coller.
//
// LA SYNTAXE, volontairement minuscule :
//   *gras*   _italique_   ~souligné~   [en ambre]   [bleu: mot]   :col:
//   - un point de liste (puce réglable)
//   > un paragraphe entier décalé — une note, une citation
// Elle s'imbrique (*_gras italique_*), et `\` échappe un caractère qu'on veut
// écrire tel quel (`\*` donne une étoile).
//
// UNE SEULE FAMILLE. `[serif: mot]` et `[mono: mot]` se lisent encore — les
// planches déjà écrites en contiennent — mais ne changent plus de fonte : la
// charte n'a qu'Ubuntu Sans, et la hiérarchie sort de la graisse, de la casse
// et de l'interlettrage. Le préfixe garde une utilité : il empêche `[mono: 4]`
// de teinter le mot en ambre, ce qu'un `[…]` nu ferait.
//
// Ce module ne décide d'aucune couleur ni d'aucun corps : il découpe, il mesure,
// il pose. La charte lui est donnée par l'appelant.

import { vocabulaireDIcones, type Ctx2D, type Degrade } from "./canvas.ts";

/** Les quatre marqueurs. `accent` porte la couleur, pas une graisse. */
const MARQUEURS = [
  { ouvre: "*", ferme: "*", cle: "gras" },
  { ouvre: "_", ferme: "_", cle: "italique" },
  { ouvre: "~", ferme: "~", cle: "souligne" },
  { ouvre: "[", ferme: "]", cle: "accent" },
] as const;

type CleMarqueur = (typeof MARQUEURS)[number]["cle"];

/**
 * Les couleurs nommées de la charte, appelables au mot : `[bleu: un mot]`.
 *
 * `ambre` et `gris` n'ont pas de valeur ici : ce sont des RÔLES, pas des
 * teintes, et ils diffèrent entre le thème clair et le sombre (#EFB159 contre
 * #C08327). Les écrire en dur donnerait un accent invisible dans l'un des deux.
 */
export const COULEURS_TEXTE: Record<string, string | null> = {
  ambre: null,
  gris: null,
  bleu: "#8CB9BD",
  terracotta: "#B67352",
  ardoise: "#5B8286",
  vert: "#3F8F5B",
  fuchsia: "#D6246E",
};

export const AIDE_BALISAGE =
  "*gras*  _italique_  ~souligné~  [en ambre]  [bleu: mot]  > retrait\n" +
  "[surtitre: mot] — le corps de la charte, aligné sur les capitales du voisin\n" +
  ":col: (icône)  :fleche: (celle du swipe)\n" +
  "Distance = 57,5 km  — libellé en capitales, valeur en gros dessous\n" +
  "- point de liste — « - :sac: » met CETTE icône en puce\n" +
  "en début de ligne :  | centré   |> à droite   |< à gauche   -- plus petit   ++ plus grand";

/** Une icône entre deux-points. Bornée à des minuscules sans espace, et
 *  vérifiée contre le vocabulaire : « Départ : 6 h » n'en est pas une, et
 *  `:inconnu:` reste du texte plutôt que de disparaître. */
const ICONE = /^:([a-z-]{2,24}):/;

/** Les familles encore reconnues à la lecture, toutes rendues à l'identique. */
const FAMILLES_TEXTE: Record<string, true> = { sans: true, serif: true, mono: true };

/**
 * LES RÔLES DE LA CHARTE, appelables au mot : `[surtitre: VALGAUDÉMAR]`.
 *
 * C'est ce qui met deux corps sur UNE ligne — « Jour 2 » en gros, la destination
 * en petites capitales à côté — sans deux éléments à aligner à la main. Le titre
 * de presse, en une frappe.
 *
 * Les NOMS sont ici, les tailles non : ce module ne décide d'aucun corps. Un rôle
 * dont l'appelant n'a pas donné la taille retombe sur celle de la ligne, et le
 * texte s'affiche — jamais il ne disparaît.
 */
const ROLES_TEXTE: Record<string, true> = {
  entete: true,
  surtitre: true,
  titre: true,
  corps: true,
  pied: true,
};

const PREFIXE_NOMME = /^\s*([a-zà-ÿ]+)\s*:\s*/i;

export type Morceau = {
  texte: string;
  gras?: boolean;
  italique?: boolean;
  souligne?: boolean;
  accent?: boolean;
  couleur?: string;
  famille?: string;
  icone?: string;
  /** Un rôle de la charte : c'est lui qui donne au morceau SON corps. */
  role?: string;
};

/** Un morceau une fois mesuré, prêt à poser. */
export type MorceauMesure = Morceau & { largeur: number };

export type Ligne = MorceauMesure[];

function prefixeNomme(
  contenu: string,
): { quoi: "couleur" | "famille" | "role"; nom: string; reste: string } | null {
  const m = PREFIXE_NOMME.exec(contenu);
  if (!m) return null;
  const nom = m[1]!.toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "");
  const reste = contenu.slice(m[0].length);
  if (nom in COULEURS_TEXTE) return { quoi: "couleur", nom, reste };
  if (nom in FAMILLES_TEXTE) return { quoi: "famille", nom, reste };
  if (nom in ROLES_TEXTE) return { quoi: "role", nom, reste };
  return null;
}

/** Position du marqueur fermant, en sautant les caractères échappés. */
function indexFermeture(texte: string, depuis: number, ferme: string): number {
  for (let i = depuis + 1; i < texte.length; i += 1) {
    if (texte[i] === "\\") {
      i += 1;
      continue;
    }
    if (texte[i] === ferme) return i;
  }
  return -1;
}

/** Découpe un texte balisé en morceaux stylés. */
export function analyserRiche(texte: unknown, style: Morceau | object = {}): Morceau[] {
  const source = typeof texte === "string" ? texte : "";
  const herite = style as Record<string, unknown>;
  const out: Morceau[] = [];
  let tampon = "";
  const pousser = () => {
    if (tampon) out.push({ ...(herite as Morceau), texte: tampon });
    tampon = "";
  };

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]!;
    if (c === ":") {
      const m = ICONE.exec(source.slice(i));
      if (m && (vocabulaireDIcones().connue(m[1]!) || glypheTrace(m[1]!))) {
        pousser();
        out.push({ ...(herite as Morceau), texte: "", icone: m[1]! });
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === "\\" && i + 1 < source.length) {
      tampon += source[i + 1];
      i += 1;
      continue;
    }
    // Un marqueur déjà ouvert plus haut ne se rouvre pas : `*a*b*c*` donne
    // « a » en gras, « b » normal, « c » en gras — pas une imbrication absurde.
    const marqueur = MARQUEURS.find((mq) => mq.ouvre === c && !herite[mq.cle]);
    if (marqueur) {
      const fin = indexFermeture(source, i, marqueur.ferme);
      // `fin > i + 1` : une paire vide (`**`) est du texte, pas un style.
      if (fin > i + 1) {
        const contenu = source.slice(i + 1, fin);
        // `[bleu: mot]` désigne une couleur nommée ; `[mot]` reste l'ambre du
        // thème. Un préfixe inconnu (`[note: …]`) n'en est pas un : il reste du
        // texte, on ne mange pas les mots de quelqu'un d'autre.
        const nommee = marqueur.cle === "accent" ? prefixeNomme(contenu) : null;
        pousser();
        // NI UNE FAMILLE NI UN RÔLE NE METTENT EN AMBRE : sans cette garde,
        // nommer une police ou un corps teindrait le mot.
        const sansAccent = nommee?.quoi === "famille" || nommee?.quoi === "role";
        out.push(
          ...analyserRiche(nommee ? nommee.reste : contenu, {
            ...herite,
            ...(sansAccent ? null : { [marqueur.cle as CleMarqueur]: true }),
            ...(nommee?.quoi === "famille" ? { famille: nommee.nom } : null),
            ...(nommee?.quoi === "role" ? { role: nommee.nom } : null),
            ...(nommee?.quoi === "couleur" ? { couleur: nommee.nom } : null),
          }),
        );
        i = fin;
        continue;
      }
    }
    tampon += c;
  }
  pousser();
  return out;
}

/** Le texte nu, balises retirées — pour mesurer, comparer, ou tester. */
export function texteNu(texte: unknown): string {
  return analyserRiche(texte)
    .map((m) => m.texte)
    .join("");
}

/* --------------------------------------------------------------- le style */

/**
 * Ce qu'il faut savoir pour poser une ligne.
 *
 * Les espacements sont OPTIONNELS et retombent sur la charte. Ils voyagent dans
 * le style plutôt que d'être lus ailleurs parce que MESURE ET POSE doivent lire
 * la même valeur : un texte mesuré avec un interligne et dessiné avec un autre
 * déborde de la place qu'on lui avait réservée.
 */
export type StyleTexte = {
  /** La famille CSS résolue — une seule dans la charte. */
  police: string;
  taille: number;
  graisse?: number;
  couleur: string;
  accent: string;
  /** L'encre atténuée du thème, pour `[gris: mot]`. */
  douce?: string;
  plaque?: PlaqueRendu | null;
  interligne?: number;
  entreBlocs?: number;
  respiration?: number;
  entreItems?: number;
  entreDonnees?: number;
  retraitListe?: number;
  alinea?: number;
  /** Chaque retour tapé reste une ligne — pour une légende, pas un texte suivi. */
  lignesDures?: boolean;
  /**
   * Les corps que la charte donne à ses rôles, pour `[surtitre: mot]`. Absent,
   * un rôle nommé garde le corps de la ligne.
   */
  corps?: Record<string, number>;
  /** Et leur interlettrage, en em — c'est lui qui fait des capitales espacées. */
  lettrages?: Record<string, number>;
  couleurLabel?: string;
  couleurValeur?: string;
  tailleLabel?: number;
  tailleValeur?: number;
};

export type PlaqueRendu = {
  /** « r, g, b » — le canvas construit le rgba avec l'alpha. */
  rgb: string;
  alpha: number;
  padX?: number;
  padY?: number;
  rayon?: number;
  degrade?: "aucun" | "droite" | "gauche" | "bords";
  fondu?: number;
};

/**
 * La fonte CSS d'un morceau.
 *
 * Le gras d'un morceau ne DESCEND jamais sous 700 mais part de la graisse du
 * bloc : un corps déjà en 500 mis en gras doit monter, pas s'aligner sur un 700
 * arbitraire.
 */
/**
 * Le corps d'un morceau : celui de son rôle, sinon celui de la ligne.
 *
 * Un rôle que l'appelant n'a pas tarifé retombe sur la ligne plutôt que sur zéro
 * — un mot mal nommé ne doit pas faire disparaître la phrase.
 */
export function tailleDe(
  morceau: Morceau,
  base: Pick<StyleTexte, "taille" | "corps">,
): number {
  const nommee = morceau.role ? base.corps?.[morceau.role] : undefined;
  return Number.isFinite(nommee) && (nommee as number) > 0 ? (nommee as number) : base.taille;
}

/** L'écart entre les lettres d'un morceau, en pixels. Zéro hors d'un rôle. */
export function ecartDe(
  morceau: Morceau,
  base: Pick<StyleTexte, "taille" | "corps" | "lettrages">,
): number {
  const em = morceau.role ? base.lettrages?.[morceau.role] : undefined;
  return Number.isFinite(em) ? (em as number) * tailleDe(morceau, base) : 0;
}

export function fonteDe(
  morceau: Morceau,
  base: Pick<StyleTexte, "police" | "taille" | "graisse" | "corps">,
): string {
  const style = morceau.italique ? "italic " : "";
  const graisse = base.graisse ?? 400;
  const poids = morceau.gras ? Math.max(700, graisse) : graisse;
  return `${style}${poids} ${tailleDe(morceau, base)}px ${base.police}`;
}

/**
 * La hauteur qu'une ligne réclame : celle de son plus gros morceau.
 *
 * Sans elle, un `[titre: MOT]` glissé dans un paragraphe écraserait la ligne
 * suivante — mesure et pose lisent donc toutes deux cette hauteur-là.
 */
export function hauteurDeLigne(ligne: Ligne, base: StyleTexte): number {
  let max = base.taille;
  for (const m of ligne) max = Math.max(max, tailleDe(m, base));
  return max;
}

/**
 * L'encre d'un morceau. `ambre` passe par `base.accent` — donc par le thème, et
 * par la couleur d'accent que la planche a pu redéfinir : une teinte nommée ne
 * doit pas court-circuiter un réglage qu'on vient de faire à la main.
 */
export function encreDe(
  morceau: Morceau,
  base: { couleur: string; accent: string; douce?: string },
): string {
  if (!morceau.accent) return base.couleur;
  if (!morceau.couleur || morceau.couleur === "ambre") return base.accent;
  if (morceau.couleur === "gris") return base.douce ?? base.couleur;
  return COULEURS_TEXTE[morceau.couleur] ?? base.accent;
}

const EST_ESPACE = /^\s+$/;

/**
 * Part de la taille du texte séparant la ligne de base du CENTRE OPTIQUE des
 * capitales. C'est là que se centre une icône posée dans une phrase : sur la
 * ligne de base, elle pendrait sous le mot voisin.
 */
export const CENTRE_CAPITALES = 0.35;

/** Sa hampe fait 1,35 corps : la proportion relevée sur le pied de page, et ce
 *  qui fait qu'on reconnaît la flèche du swipe partout. */
export const FLECHE_LARGEUR = 1.35;

/**
 * LA FLÈCHE DU LABO, tracée à la main — et à un seul endroit.
 *
 * Le canvas SAIT afficher U+2192 : il retombe sur une fonte système. Et c'est
 * précisément le problème — la flèche arriverait dans un dessin qui n'est pas
 * celui d'Ubuntu, et changerait d'un appareil à l'autre. On la trace donc ici,
 * une fois : le pied de page (« glisse → »), la puce d'une liste et `:fleche:`
 * au milieu d'une phrase posent EXACTEMENT la même, à leurs tailles
 * respectives. Trois dessins séparés auraient divergé au premier retouchage.
 *
 * `x` est son bord gauche, `y` la ligne que suit la hampe. Rend sa largeur.
 */
export function flecheTracee(
  ctx: Ctx2D,
  x: number,
  y: number,
  taille: number,
  couleur: string,
  epaisseur: number | null = null,
): number {
  const longueur = taille * FLECHE_LARGEUR;
  const pointe = x + longueur;
  ctx.save();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = epaisseur ?? Math.max(1.5, taille * 0.08);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(pointe, y);
  ctx.moveTo(pointe - taille * 0.34, y - taille * 0.3);
  ctx.lineTo(pointe, y);
  ctx.lineTo(pointe - taille * 0.34, y + taille * 0.3);
  ctx.stroke();
  ctx.restore();
  return longueur;
}

/**
 * LES GLYPHES TRACÉS, posables dans une phrase comme une icône.
 *
 * Le vocabulaire de `:clé:` vient des repères de la carte, qui sont des dessins
 * lucide. La flèche, elle, n'en est pas un — elle est tracée. Elle rejoint quand
 * même le vocabulaire : de l'endroit où on écrit, `:fleche:` et `:col:` sont la
 * même chose, et devoir savoir laquelle est « vraiment » une icône serait un
 * détail d'implémentation qui remonte à la surface.
 */
type Glyphe = {
  largeur: number;
  dessiner: (
    ctx: Ctx2D,
    x: number,
    y: number,
    taille: number,
    couleur: string,
    epaisseur?: number | null,
  ) => number;
};

const GLYPHES: Record<string, Glyphe> = {
  fleche: { largeur: FLECHE_LARGEUR + 0.3, dessiner: flecheTracee },
};

export function glypheTrace(cle: string): Glyphe | null {
  return GLYPHES[cle] ?? null;
}

/** L'encombrement d'une icône : un carré, plus un souffle de chaque côté — ou la
 *  largeur propre au glyphe quand il n'est pas carré (la flèche est longue et
 *  plate : lui donner un carré ouvrirait un trou avant le mot suivant). */
export function largeurIcone(base: { taille: number }, cle: string | null = null): number {
  return base.taille * ((cle && glypheTrace(cle)?.largeur) || 1.24);
}

/**
 * Répartit des morceaux sur des lignes d'au plus `largeurMax`.
 *
 * Les espaces sont des morceaux comme les autres : c'est ce qui permet à un mot
 * en gras de rester collé à la virgule qui le suit, et à une ligne de ne pas
 * commencer par un blanc.
 */
export function lignesRiches(
  ctx: Ctx2D,
  morceaux: readonly Morceau[],
  largeurMax: number,
  base: StyleTexte,
  { retrait = 0 }: { retrait?: number } = {},
): Ligne[] {
  const mots: Morceau[] = [];
  for (const m of morceaux) {
    // Une icône est un mot à elle seule : elle ne se coupe pas, et elle ne se
    // découpe pas sur les espaces (son texte est vide).
    if (m.icone) {
      mots.push(m);
      continue;
    }
    for (const bout of m.texte.split(/(\s+)/)) {
      if (bout !== "") mots.push({ ...m, texte: bout });
    }
  }

  const lignes: Ligne[] = [];
  let ligne: Ligne = [];
  let largeur = 0;

  for (const mot of mots) {
    ctx.font = fonteDe(mot, base);
    const w = mot.icone
      ? largeurIcone({ taille: tailleDe(mot, base) }, mot.icone)
      : ctx.measureText(mot.texte).width + ecartDe(mot, base) * mot.texte.length;
    const espace = !mot.icone && EST_ESPACE.test(mot.texte);

    // L'ALINÉA rétrécit la PREMIÈRE ligne, pas les suivantes : c'est ce qui fait
    // qu'un retrait de première ligne reste un retrait et ne devient pas une
    // marge. Les lignes d'après retrouvent toute la justification.
    const maxCourant =
      lignes.length === 0 ? Math.max(base.taille, largeurMax - retrait) : largeurMax;
    if (!espace && ligne.length > 0 && largeur + w > maxCourant) {
      // Les blancs de fin de ligne ne comptent pas : ils décaleraient un texte
      // centré, et allongeraient un soulignement dans le vide.
      while (
        ligne.length &&
        !ligne[ligne.length - 1]!.icone &&
        EST_ESPACE.test(ligne[ligne.length - 1]!.texte)
      ) {
        largeur -= ligne.pop()!.largeur;
      }
      lignes.push(ligne);
      ligne = [];
      largeur = 0;
    }
    if (espace && ligne.length === 0) continue;

    ligne.push({ ...mot, largeur: w });
    largeur += w;
  }
  while (ligne.length && EST_ESPACE.test(ligne[ligne.length - 1]!.texte)) ligne.pop();
  if (ligne.length) lignes.push(ligne);
  return lignes;
}

/** Largeur d'une ligne déjà mise en page — sert à centrer ou à aligner à droite. */
export function largeurLigne(ligne: Ligne): number {
  return ligne.reduce((s, m) => s + m.largeur, 0);
}

export type Align = "gauche" | "centre" | "droite";

/**
 * LES TROIS ALIGNEMENTS, en un seul calcul : de combien décaler une ligne dans
 * sa boîte.
 *
 * Tout passe par ici — titres, paragraphes, listes, filets. Un alignement
 * calculé à deux endroits finit par diverger d'un demi-pixel, et c'est
 * exactement ce qui se voit sur un titre centré au-dessus d'un filet qui ne
 * l'est pas tout à fait.
 */
export function decalageAlignement(
  align: Align | null | undefined,
  largeurBoite: number,
  largeur: number,
): number {
  if (align === "centre") return Math.max(0, (largeurBoite - largeur) / 2);
  if (align === "droite") return Math.max(0, largeurBoite - largeur);
  return 0;
}

/* -------------------------------------------------------------- la plaque */

/** Le remplissage de la plaque : un aplat, ou un dégradé qui s'éteint. */
function encreDeLaPlaque(
  ctx: Ctx2D,
  p: PlaqueRendu & { ext: number },
  gauche: number,
  large: number,
): string | Degrade {
  const a = (v: number) => `rgba(${p.rgb}, ${(p.alpha * v).toFixed(3)})`;
  if (!p.ext || p.degrade === "aucun" || !p.degrade) return a(1);
  const g = ctx.createLinearGradient(gauche, 0, gauche + large, 0);
  if (p.degrade === "bords") {
    const part = p.ext / large;
    g.addColorStop(0, a(0));
    g.addColorStop(Math.min(0.5, part), a(1));
    g.addColorStop(Math.max(0.5, 1 - part), a(1));
    g.addColorStop(1, a(0));
    return g;
  }
  const part = Math.max(0, Math.min(1, 1 - p.ext / large));
  if (p.degrade === "gauche") {
    g.addColorStop(0, a(0));
    g.addColorStop(1 - part, a(1));
    g.addColorStop(1, a(1));
  } else {
    g.addColorStop(0, a(1));
    g.addColorStop(part, a(1));
    g.addColorStop(1, a(0));
  }
  return g;
}

/**
 * LE FOND POSÉ SOUS UNE LIGNE — la plaque.
 *
 * C'est l'autre façon de rendre un texte lisible sur une photo : au lieu
 * d'assombrir toute l'image d'un dégradé, on pose un aplat SOUS les lettres, et
 * rien qu'en dessous. La photo reste entière ; c'est le geste des titres de
 * presse posés sur une couverture.
 *
 * Une plaque PAR LIGNE, à la largeur de la ligne : un rectangle unique autour
 * d'un bloc laisserait de grands vides à droite des lignes courtes, et se lirait
 * comme un encart collé sur l'image.
 *
 * ELLE PEUT SE DÉGRADER, et c'est ce qui la sauve du côté « étiquette » :
 * l'aplat tient sous les lettres, puis se dissout dans la photo au lieu de
 * s'arrêter net. Le fondu se fait sur une RALLONGE au-delà du texte, jamais sous
 * lui — sinon le dernier mot perdrait son fond, l'inverse du but.
 */
export function plaqueDeLigne(
  ctx: Ctx2D,
  ligne: Ligne,
  x: number,
  y: number,
  base: StyleTexte,
): void {
  const p = base?.plaque;
  const largeur = p ? largeurLigne(ligne) : 0;
  if (!p?.rgb || !(largeur > 0)) return;

  const padX = base.taille * (p.padX ?? 0.3);
  const padY = base.taille * (p.padY ?? 0.24);
  // La boîte d'une ligne : la hampe au-dessus de la ligne de base, le jambage
  // en dessous. Les deux sont des parts du corps, donc la plaque suit le texte
  // quand on change de taille.
  const haut = y - base.taille * 0.78 - padY;
  const hauteur = base.taille * 1 + padY * 2;
  const boite = largeur + padX * 2;
  // La rallonge du fondu : ajoutée AUTOUR du texte, jamais prise dessus.
  const cotes = p.degrade === "bords" ? 2 : p.degrade && p.degrade !== "aucun" ? 1 : 0;
  const ext = cotes ? Math.max(0, p.fondu ?? 0.4) * boite : 0;
  const gauche = x - padX - (p.degrade === "gauche" || p.degrade === "bords" ? ext : 0);
  const large = boite + ext * cotes;
  const r = Math.min((p.rayon ?? 0.18) * base.taille, hauteur / 2, large / 2);

  // L'ombre du texte ne doit pas se doubler sous la plaque : deux ombres
  // superposées font une tache.
  const ombre = [ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY] as const;
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.beginPath();
  ctx.moveTo(gauche + r, haut);
  ctx.lineTo(gauche + large - r, haut);
  ctx.quadraticCurveTo(gauche + large, haut, gauche + large, haut + r);
  ctx.lineTo(gauche + large, haut + hauteur - r);
  ctx.quadraticCurveTo(gauche + large, haut + hauteur, gauche + large - r, haut + hauteur);
  ctx.lineTo(gauche + r, haut + hauteur);
  ctx.quadraticCurveTo(gauche, haut + hauteur, gauche, haut + hauteur - r);
  ctx.lineTo(gauche, haut + r);
  ctx.quadraticCurveTo(gauche, haut, gauche + r, haut);
  ctx.closePath();
  const encre = ctx.fillStyle;
  ctx.fillStyle = encreDeLaPlaque(ctx, { ...p, ext }, gauche, large);
  ctx.fill();
  ctx.fillStyle = encre;

  ctx.shadowColor = ombre[0];
  ctx.shadowBlur = ombre[1];
  ctx.shadowOffsetX = ombre[2];
  ctx.shadowOffsetY = ombre[3];
}

/**
 * Pose une ligne. `x` est son bord GAUCHE — c'est à l'appelant de le calculer
 * s'il centre (cf. `largeurLigne`), parce que lui seul sait dans quelle boîte.
 */
export function dessinerLigneRiche(
  ctx: Ctx2D,
  ligne: Ligne,
  x: number,
  y: number,
  base: StyleTexte,
): number {
  plaqueDeLigne(ctx, ligne, x, y, base);
  let curseur = x;
  for (const morceau of ligne) {
    const taille = tailleDe(morceau, base);
    /**
     * DEUX CORPS SUR UNE LIGNE SE CENTRENT SUR LEURS CAPITALES, pas sur la ligne
     * de base qu'ils partagent.
     *
     * Posé sur la même ligne de base qu'un mot trois fois plus gros, un petit
     * mot pend à son PIED : typographiquement c'est juste, optiquement c'est un
     * décrochage. On fait donc coïncider les deux centres optiques — le milieu
     * des capitales est à `CENTRE_CAPITALES` au-dessus de la ligne de base —, ce
     * qui revient à remonter le petit de la moitié de ce qui les sépare.
     */
    const ligneDeBase = y - CENTRE_CAPITALES * (base.taille - taille);
    if (morceau.icone) {
      const glyphe = glypheTrace(morceau.icone);
      if (glyphe) {
        const large = taille * FLECHE_LARGEUR;
        glyphe.dessiner(
          ctx,
          curseur + (morceau.largeur - large) / 2,
          ligneDeBase - taille * CENTRE_CAPITALES,
          taille,
          encreDe(morceau, base),
        );
        curseur += morceau.largeur;
        continue;
      }
      const cote = taille * 0.98;
      vocabulaireDIcones().dessiner(
        ctx,
        morceau.icone,
        curseur + (morceau.largeur - cote) / 2,
        ligneDeBase - taille * CENTRE_CAPITALES - cote / 2,
        cote,
        encreDe(morceau, base),
      );
      curseur += morceau.largeur;
      continue;
    }
    ctx.font = fonteDe(morceau, base);
    ctx.fillStyle = encreDe(morceau, base);
    // UN RÔLE PEUT ÉCARTER SES LETTRES : `fillText` d'un mot entier ne sait pas
    // le faire, et c'est l'interlettrage qui fait des capitales de la charte.
    const ecart = ecartDe(morceau, base);
    if (ecart) {
      let lettre = curseur;
      for (const l of morceau.texte) {
        ctx.fillText(l, lettre, ligneDeBase);
        lettre += ctx.measureText(l).width + ecart;
      }
    } else {
      ctx.fillText(morceau.texte, curseur, ligneDeBase);
    }

    if (morceau.souligne && !EST_ESPACE.test(morceau.texte)) {
      // Épaisseur et distance proportionnelles au corps : un soulignement fixé
      // en pixels colle au texte à 22 px et flotte à 65.
      const epaisseur = Math.max(1, taille * 0.055);
      ctx.fillRect(curseur, ligneDeBase + taille * 0.17, morceau.largeur, epaisseur);
    }
    curseur += morceau.largeur;
  }
  return curseur - x;
}

/* ---------------------------------------------------- petites capitales */

/**
 * LES PETITES CAPITALES DE LA CHARTE — surtitre, en-tête, pied, libellés de
 * fiche — ACCEPTENT LE BALISAGE.
 *
 * Une icône y compte comme une lettre : même écart avant et après, alignée sur
 * le centre optique des capitales. Les couleurs nommées marchent aussi
 * (`[bleu: mot]`), l'ambre restant la couleur d'accent par défaut.
 */
export function morceauxCapitales(texte: unknown): Morceau[] {
  return analyserRiche(texte).map((mo) =>
    mo.icone ? mo : { ...mo, texte: String(mo.texte).toUpperCase() },
  );
}

/** Le côté d'une icône dans une ligne de capitales. */
const ICONE_CAPITALES = 1.05;

export function largeurCapitales(
  ctx: Ctx2D,
  morceaux: readonly Morceau[],
  taille: number,
  espacementEm: number,
): number {
  const ecart = espacementEm * taille;
  let largeur = 0;
  for (const mo of morceaux) {
    if (mo.icone) {
      largeur += taille * (glypheTrace(mo.icone)?.largeur ?? ICONE_CAPITALES) + ecart;
      continue;
    }
    for (const l of mo.texte) largeur += ctx.measureText(l).width + ecart;
  }
  return Math.max(0, largeur - ecart);
}

/**
 * Pose la ligne, lettre par lettre.
 *
 * `ctx.font` et `ctx.fillStyle` sont déjà réglés par l'appelant — sauf pour un
 * morceau qui porte sa propre couleur. Poser les lettres une à une est ce qui
 * permet l'interlettrage : `fillText` d'un mot entier ne sait pas l'écarter.
 */
export function dessinerCapitales(
  ctx: Ctx2D,
  morceaux: readonly Morceau[],
  x: number,
  base: number,
  taille: number,
  espacementEm: number,
  encre: string,
  { douce }: { douce?: string } = {},
): number {
  const ecart = espacementEm * taille;
  const parDefaut = ctx.fillStyle as string;
  let curseur = x;
  for (const mo of morceaux) {
    const couleur = mo.couleur
      ? encreDe(mo, { couleur: parDefaut, accent: encre, douce })
      : parDefaut;
    if (mo.icone) {
      const glyphe = glypheTrace(mo.icone);
      if (glyphe) {
        // La flèche suit la ligne des capitales, pas la ligne de base : dans un
        // surtitre elle doit viser le milieu des lettres, comme celle du pied
        // de page au-dessus de sa propre ligne.
        glyphe.dessiner(ctx, curseur, base - taille * CENTRE_CAPITALES, taille, couleur);
        curseur += taille * glyphe.largeur + ecart;
        continue;
      }
      const cote = taille * ICONE_CAPITALES;
      vocabulaireDIcones().dessiner(
        ctx,
        mo.icone,
        curseur,
        base - taille * CENTRE_CAPITALES - cote / 2,
        cote,
        couleur,
      );
      curseur += cote + ecart;
      continue;
    }
    ctx.fillStyle = couleur;
    for (const l of mo.texte) {
      ctx.fillText(l, curseur, base);
      curseur += ctx.measureText(l).width + ecart;
    }
  }
  ctx.fillStyle = parDefaut;
  return Math.max(0, curseur - x - ecart);
}

/* ------------------------------------------------------------------- blocs */

/**
 * LE MODÈLE DE BLOCS. Un texte n'est pas qu'une suite de paragraphes : il a des
 * listes, des données et des respirations. Tous se mesurent et se posent de la
 * même façon, ce qui permet de connaître la hauteur d'un texte AVANT de le
 * dessiner — indispensable aux modèles qui construisent du bas vers le haut.
 *
 * LA SYNTAXE NE S'APPREND PAS, elle se tape :
 *   • une ligne qui commence par « - » est un point de liste ;
 *   • UNE ligne vide sépare deux paragraphes, comme partout ;
 *   • CHAQUE ligne vide en plus ajoute une respiration. Appuyer trois fois sur
 *     Entrée donne plus d'air que deux — c'est le geste qu'on ferait de toute
 *     façon, autant qu'il fasse ce qu'on attend.
 */

/**
 * LES ESPACEMENTS, en parts du corps du texte.
 *
 * Ce sont des DÉFAUTS, pas des constantes : chaque planche peut les redéfinir.
 * Ils vivent ici parce que c'est ici qu'on mesure et qu'on pose, et que les deux
 * DOIVENT lire la même valeur.
 */
export const ESPACEMENT = {
  /** Interligne d'un corps de texte. */
  interligne: 1.55,
  /** Espace entre deux blocs (paragraphe, liste). */
  entreBlocs: 0.85,
  /** Hauteur d'UNE ligne sautée en plus — la « respiration ». */
  respiration: 1.1,
  /** Espace entre deux points d'une même liste. */
  entreItems: 0.35,
  /** Espace entre deux DONNÉES qui se suivent. Bien plus serré qu'entre deux
   *  blocs : une suite de `libellé = valeur` se lit comme UN tableau, pas comme
   *  quatre paragraphes posés à la file. */
  entreDonnees: 0.45,
  /** Retrait du texte d'une liste, qui laisse la place à la puce. */
  retraitListe: 1.6,
  /** Retrait de la PREMIÈRE ligne d'un paragraphe. Zéro = pas d'alinéa. */
  alinea: 0,
} as const;

type CleEspacement = keyof typeof ESPACEMENT;

/** La valeur réglée sur la planche, sinon celle de la charte. */
function esp(base: StyleTexte, cle: CleEspacement): number {
  const v = base[cle];
  return Number.isFinite(v) && (v as number) >= 0 ? (v as number) : ESPACEMENT[cle];
}

// Le tiret doit être suivi d'une ESPACE ou de la clé d'une puce : sans cette
// condition, une rangée de tirets (« ---- ») devenait un point de liste.
const EST_ITEM = /^\s*-(?=[\s:])\s*(.*)$/;

/**
 * LA PUCE D'UN POINT DE LISTE, point par point.
 *
 * La planche a une puce ; c'est elle qui donne son allure à la liste. Mais une
 * liste dit parfois trois choses de nature différente — le sac, les vivres,
 * l'eau — et là, c'est le PICTOGRAMME qui porte le sens, pas un rond répété.
 *
 * La règle tient en une phrase : le PREMIER `:clé:` d'un point de liste EST sa
 * puce. Pour garder la puce de la planche ET commencer par une icône, on nomme
 * les deux : `- :point: :sac: sac 30 L`.
 */
const PUCE_DITE = /^:([a-z-]{2,24}):\s*/;

/** Un paragraphe DÉCALÉ en entier — une citation, une note. */
const EST_RETRAIT = /^\s*>\s?(.*)$/;

/**
 * UNE DONNÉE : `Distance = 57,5 km`.
 *
 * Le libellé en petites capitales espacées, la valeur en gros dessous — la mise
 * en page d'une fiche technique, mais dans du TEXTE.
 *
 * TROIS CONDITIONS, et chacune écarte un faux positif :
 *   • des espaces autour du « = » — sinon « x=y » au milieu d'une phrase ;
 *   • un SEUL « = » dans la ligne — sinon « a = b = c » ;
 *   • une LETTRE dans le libellé — sinon « 12 - 4 = 8 » deviendrait une donnée
 *     intitulée « 12 - 4 ». Une soustraction doit pouvoir s'écrire.
 */
const EST_DONNEE = /^([^=]*\p{L}[^=]*) = ([^=]*)$/u;

/** Les deux corps d'une donnée, à défaut de ceux que l'appelant impose. */
const DONNEE_LABEL = 0.46;
const DONNEE_VALEUR = 1.24;
/** L'interlettrage du libellé d'une donnée. */
const LETTRAGE_DONNEE = 0.26;

function corpsDeDonnee(base: StyleTexte): { label: number; valeur: number } {
  return {
    label: Math.round(base.tailleLabel ?? base.taille * DONNEE_LABEL),
    valeur: Math.round(base.tailleValeur ?? base.taille * DONNEE_VALEUR),
  };
}

export type Bloc =
  | { type: "espace"; n: number; base: StyleTexte | null; align: Align | null }
  | {
      type: "paragraphe";
      lignes: Ligne[];
      retrait: number;
      alinea: number;
      base: StyleTexte | null;
      align: Align | null;
    }
  | {
      type: "liste";
      items: { puce: string | null; lignes: Ligne[] }[];
      base: StyleTexte | null;
      align: Align | null;
    }
  | {
      type: "donnee";
      label: Morceau[];
      valeur: Ligne[];
      corps: { label: number; valeur: number };
      base: StyleTexte | null;
      align: Align | null;
    };

/**
 * La hauteur d'une donnée : son libellé, sa valeur, et l'air entre les deux.
 *
 * UNE valeur d'une ligne vaut 1,07 corps, pas un interligne : l'interligne est
 * l'écart entre deux lignes d'un paragraphe, et l'appliquer à une valeur seule
 * ajoutait un demi-corps de vide sous chaque donnée — quatre d'affilée
 * débordaient alors sous le pied de page.
 */
function hauteurDonnee(bloc: Extract<Bloc, { type: "donnee" }>, base: StyleTexte): number {
  // Les corps viennent du BLOC, arrêtés à l'analyse : les recalculer ici depuis
  // la base ferait mesurer une donnée avec d'autres chiffres que ceux avec
  // lesquels elle a été mise en lignes.
  const { label, valeur } = bloc.corps;
  const n = Math.max(1, bloc.valeur.length);
  return label * 1.7 + valeur * (1.07 + (n - 1) * esp(base, "interligne"));
}

/** L'écart AVANT un bloc : serré entre deux données, normal partout ailleurs. */
function ecartAvant(bloc: Bloc, precedent: Bloc | undefined, b: StyleTexte): number {
  const cle: CleEspacement =
    bloc.type === "donnee" && precedent?.type === "donnee" ? "entreDonnees" : "entreBlocs";
  return b.taille * esp(b, cle);
}

/**
 * L'ALIGNEMENT ET LE CORPS, LIGNE PAR LIGNE.
 *
 * La planche a un alignement et un corps ; c'est ce qui la tient. Mais UNE ligne
 * veut parfois s'en écarter — une phrase centrée au milieu d'un bloc à gauche,
 * une précision en plus petit sous une déclaration. Le faire au réglage de la
 * planche l'imposerait à tout le reste.
 *
 * Une famille de préfixes, un seul caractère à retenir :
 *   `|` centré, `|>` à droite, `|<` à gauche — la barre est l'axe, le chevron
 *   donne le sens ;
 *   `--` plus petit, `++` plus grand — répétables, et cumulables avec
 *   l'alignement.
 * Le préfixe doit être suivi d'une ESPACE ET de quelque chose : `----` seul
 * reste du texte, et `- eau` reste un point de liste.
 */
const MARQUEUR_LIGNE = "\\|[<>]?|\\+\\+|--";
const PREFIXE_LIGNE = new RegExp(
  `^((?:${MARQUEUR_LIGNE})(?:[ \\t]*(?:${MARQUEUR_LIGNE}))*)[ \\t]+(.+)$`,
);
const PAS_DE_CORPS = 1.25;

export function styleDeLigne(ligne: string): {
  align: Align | null;
  echelle: number;
  reste: string;
} {
  const m = PREFIXE_LIGNE.exec(ligne);
  if (!m) return { align: null, echelle: 1, reste: ligne };
  let align: Align | null = null;
  let pas = 0;
  for (const t of m[1]!.match(new RegExp(MARQUEUR_LIGNE, "g")) ?? []) {
    if (t === "|") align = "centre";
    else if (t === "|>") align = "droite";
    else if (t === "|<") align = "gauche";
    else if (t === "++") pas += 1;
    else pas -= 1;
  }
  const echelle = Math.min(2.5, Math.max(0.4, PAS_DE_CORPS ** pas));
  return { align, echelle, reste: m[2]! };
}

/** Le style d'un bloc, à l'échelle demandée. `null` quand rien ne change — le
 *  bloc suit alors celui de la planche, sans copie inutile. */
function baseEchelle(base: StyleTexte, echelle: number): StyleTexte | null {
  return echelle === 1
    ? null
    : { ...base, taille: Math.max(6, Math.round(base.taille * echelle)) };
}

/** Découpe un texte en blocs déjà mis en page. */
export function blocsDeTexte(
  ctx: Ctx2D,
  texte: unknown,
  largeurMax: number,
  base: StyleTexte,
): Bloc[] {
  const brut = String(texte ?? "").split("\n");
  const blocs: Bloc[] = [];
  let paragraphe: string[] = []; // lignes brutes en attente
  let paraRetrait = false; // …et si elles sont décalées (« > »)
  let paraStyle: { align: Align | null; echelle: number } = { align: null, echelle: 1 };
  let items: { texte: string; puce: string | null }[] | null = null;
  let itemsStyle: { align: Align | null; echelle: number } = { align: null, echelle: 1 };
  let vides = 0;

  const viderParagraphe = () => {
    if (paragraphe.length) {
      const b = baseEchelle(base, paraStyle.echelle) ?? base;
      const retrait = paraRetrait ? b.taille * esp(b, "retraitListe") : 0;
      const alinea = b.taille * esp(b, "alinea");
      const large = largeurMax - retrait;
      const lignes = b.lignesDures
        ? paragraphe.flatMap((ligne, i) =>
            lignesRiches(ctx, analyserRiche(ligne), large, b, { retrait: i === 0 ? alinea : 0 }),
          )
        : lignesRiches(ctx, analyserRiche(paragraphe.join(" ")), large, b, { retrait: alinea });
      blocs.push({
        type: "paragraphe",
        retrait,
        alinea,
        lignes,
        align: paraStyle.align,
        base: baseEchelle(base, paraStyle.echelle),
      });
      paragraphe = [];
      paraRetrait = false;
      paraStyle = { align: null, echelle: 1 };
    }
  };

  const viderListe = () => {
    if (items?.length) {
      const b = baseEchelle(base, itemsStyle.echelle) ?? base;
      blocs.push({
        type: "liste",
        align: itemsStyle.align,
        base: baseEchelle(base, itemsStyle.echelle),
        items: items.map(({ texte: t, puce }) => ({
          puce,
          lignes: lignesRiches(
            ctx,
            analyserRiche(t),
            largeurMax - b.taille * esp(b, "retraitListe"),
            b,
          ),
        })),
      });
      items = null;
      itemsStyle = { align: null, echelle: 1 };
    }
  };

  const vider = () => {
    viderParagraphe();
    viderListe();
  };
  const memeStyle = (
    a: { align: Align | null; echelle: number },
    z: { align: Align | null; echelle: number },
  ) => a.align === z.align && a.echelle === z.echelle;

  for (const ligne of brut) {
    if (ligne.trim() === "") {
      vides += 1;
      continue;
    }
    // Les lignes vides accumulées : la première sépare, les suivantes aèrent.
    if (vides > 0) {
      vider();
      if (vides > 1 && blocs.length) {
        blocs.push({ type: "espace", n: vides - 1, base: null, align: null });
      }
      vides = 0;
    }

    // Le décalage puis le style de ligne se lisent AVANT tout le reste : c'est
    // ce qui permet d'écrire « | - un point de liste centré ».
    const cite = EST_RETRAIT.exec(ligne);
    const { align, echelle, reste } = styleDeLigne((cite ? cite[1]! : ligne).trim());
    const style = { align, echelle };

    const item = EST_ITEM.exec(reste);
    if (item) {
      viderParagraphe();
      // Un changement d'alignement ou de corps ouvre une NOUVELLE liste : une
      // seule liste ne peut pas avoir deux mises en page.
      if (items?.length && !memeStyle(itemsStyle, style)) viderListe();
      itemsStyle = style;
      // Le premier `:clé:` du point, s'il en nomme une, EST sa puce.
      const dite = PUCE_DITE.exec(item[1]!);
      const puce =
        dite && (vocabulaireDIcones().connue(dite[1]!) || estPuceTracee(dite[1]!))
          ? dite[1]!
          : null;
      (items ??= []).push({
        texte: puce ? item[1]!.slice(dite![0].length) : item[1]!,
        puce,
      });
      continue;
    }
    viderListe();

    // Une DONNÉE se lit après la liste (« - Distance = 57,5 km » reste un point
    // de liste) et avant le paragraphe, dont elle est un cas particulier.
    const donnee = EST_DONNEE.exec(reste);
    if (donnee) {
      viderParagraphe();
      const b = baseEchelle(base, style.echelle) ?? base;
      const { label, valeur } = corpsDeDonnee(b);
      blocs.push({
        type: "donnee",
        align: style.align,
        base: baseEchelle(base, style.echelle),
        label: morceauxCapitales(donnee[1]!.trim()),
        valeur: lignesRiches(ctx, analyserRiche(donnee[2]!.trim()), largeurMax, {
          ...b,
          taille: valeur,
          graisse: 700,
        }),
        corps: { label, valeur },
      });
      continue;
    }

    // Un changement de décalage ou de style FERME le paragraphe : « > » ouvre un
    // bloc à part, il ne se mélange pas à celui qu'on était en train d'écrire —
    // et une ligne centrée ne se fond pas dans un bloc à gauche.
    if (paragraphe.length && (Boolean(cite) !== paraRetrait || !memeStyle(paraStyle, style))) {
      viderParagraphe();
    }
    paraRetrait = Boolean(cite);
    paraStyle = style;
    paragraphe.push(reste.trim());
  }
  vider();
  return blocs;
}

/**
 * LA LARGEUR NATURELLE d'un texte déjà mis en lignes — sa plus longue ligne.
 *
 * Elle sert à CENTRER un bloc sans centrer ses lignes : la colonne d'une étape
 * se pose au milieu de sa moitié de planche, mais ses libellés et ses valeurs
 * restent alignés entre eux. Les centrer chacun aurait fait un escalier.
 */
export function largeurBlocs(ctx: Ctx2D, blocs: readonly Bloc[], base: StyleTexte): number {
  let max = 0;
  for (const bloc of blocs) {
    const b = bloc.base ?? base;
    if (bloc.type === "espace") continue;
    if (bloc.type === "donnee") {
      ctx.save();
      ctx.font = fonteDe({ texte: "" }, { ...b, taille: bloc.corps.label });
      max = Math.max(max, largeurCapitales(ctx, bloc.label, bloc.corps.label, LETTRAGE_DONNEE));
      ctx.restore();
      for (const ligne of bloc.valeur) max = Math.max(max, largeurLigne(ligne));
      continue;
    }
    const retrait =
      bloc.type === "liste" ? b.taille * esp(b, "retraitListe") : (bloc.retrait ?? 0);
    const lignes =
      bloc.type === "liste" ? bloc.items.flatMap((it) => it.lignes) : bloc.lignes;
    for (const ligne of lignes) max = Math.max(max, retrait + largeurLigne(ligne));
  }
  return max;
}

/**
 * Hauteur totale d'une suite de blocs — mesurée sans rien dessiner.
 *
 * Chaque bloc peut porter SON corps (posé par un préfixe `--` ou `++`) : mesure
 * et pose lisent donc le même, sinon un bloc réduit serait dessiné là où on
 * avait réservé la place du grand.
 */
export function hauteurBlocs(blocs: readonly Bloc[], base: StyleTexte): number {
  let h = 0;
  blocs.forEach((bloc, i) => {
    const b = bloc.base ?? base;
    if (i > 0) h += ecartAvant(bloc, blocs[i - 1], b);
    if (bloc.type === "espace") h += b.taille * esp(b, "respiration") * bloc.n;
    else if (bloc.type === "donnee") h += hauteurDonnee(bloc, b);
    else if (bloc.type === "liste") {
      h += bloc.items.reduce(
        (somme, it) =>
          somme +
          it.lignes.reduce((h, l) => h + hauteurDeLigne(l, b) * esp(b, "interligne"), 0),
        0,
      );
      h += Math.max(0, bloc.items.length - 1) * b.taille * esp(b, "entreItems");
    } else
      h += bloc.lignes.reduce((s, l) => s + hauteurDeLigne(l, b) * esp(b, "interligne"), 0);
  });
  return h;
}

/* -------------------------------------------------------------- les puces */

/** Les clés qui nomment une forme tracée plutôt qu'une icône du vocabulaire. */
export const PUCES_SIMPLES = [
  { cle: "point", label: "Point plein" },
  { cle: "cercle", label: "Cercle vide" },
  { cle: "carre", label: "Carré plein" },
  { cle: "carre-vide", label: "Carré vide" },
  { cle: "losange", label: "Losange" },
  { cle: "tiret", label: "Tiret" },
  { cle: "tiret-long", label: "Tiret long" },
  { cle: "fleche", label: "Flèche" },
  { cle: "chevron", label: "Chevron" },
  { cle: "croix", label: "Croix" },
  { cle: "aucune", label: "Aucune (retrait seul)" },
] as const;

export function estPuceTracee(cle: string): boolean {
  return PUCES_SIMPLES.some((p) => p.cle === cle);
}

/**
 * Dessine la puce d'un item.
 *
 * `point` et `tiret` sont tracés — deux formes trop simples pour valoir une
 * icône. Toute autre valeur est une clé du vocabulaire des repères, ce qui rend
 * les puces personnalisables sans inventer un second jeu de pictogrammes.
 */
function dessinerPuce(
  ctx: Ctx2D,
  puce: string | null | undefined,
  x: number,
  baseLigne: number,
  base: StyleTexte,
): void {
  const couleur = base.accent;
  const t = base.taille;
  const cy = baseLigne - t * CENTRE_CAPITALES; // centre optique des capitales
  const trait = Math.max(1.5, t * 0.06);

  ctx.save();
  ctx.fillStyle = couleur;
  ctx.strokeStyle = couleur;
  ctx.lineWidth = trait;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (puce || "point") {
    case "point":
      ctx.beginPath();
      ctx.arc(x + t * 0.28, cy, t * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cercle":
      ctx.beginPath();
      ctx.arc(x + t * 0.28, cy, t * 0.15, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "carre":
      ctx.fillRect(x + t * 0.14, cy - t * 0.13, t * 0.26, t * 0.26);
      break;
    case "carre-vide":
      ctx.strokeRect(x + t * 0.14, cy - t * 0.13, t * 0.26, t * 0.26);
      break;
    case "losange":
      ctx.beginPath();
      ctx.moveTo(x + t * 0.28, cy - t * 0.19);
      ctx.lineTo(x + t * 0.47, cy);
      ctx.lineTo(x + t * 0.28, cy + t * 0.19);
      ctx.lineTo(x + t * 0.09, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case "tiret":
      ctx.fillRect(x, cy - trait / 2, t * 0.56, trait);
      break;
    case "tiret-long":
      ctx.fillRect(x, cy - trait / 2, t * 0.9, trait);
      break;
    case "fleche":
      // La MÊME que le pied de page et que `:fleche:`, à l'échelle d'une puce.
      flecheTracee(ctx, x + t * 0.02, cy, t * 0.42, couleur, trait);
      break;
    case "chevron":
      ctx.beginPath();
      ctx.moveTo(x + t * 0.16, cy - t * 0.18);
      ctx.lineTo(x + t * 0.4, cy);
      ctx.lineTo(x + t * 0.16, cy + t * 0.18);
      ctx.stroke();
      break;
    case "croix":
      ctx.beginPath();
      ctx.moveTo(x + t * 0.12, cy - t * 0.15);
      ctx.lineTo(x + t * 0.44, cy + t * 0.15);
      ctx.moveTo(x + t * 0.44, cy - t * 0.15);
      ctx.lineTo(x + t * 0.12, cy + t * 0.15);
      ctx.stroke();
      break;
    case "aucune":
      break;
    default: {
      // Toute autre valeur est une clé du vocabulaire des repères.
      const cote = t * 0.92;
      ctx.restore();
      vocabulaireDIcones().dessiner(ctx, puce as string, x, cy - cote / 2, cote, couleur);
      return;
    }
  }
  ctx.restore();
}

/**
 * Pose des blocs de haut en bas depuis `haut`, et rend l'ordonnée du BAS.
 *
 * `align` vaut « gauche », « centre » ou « droite », et `largeur` est la boîte
 * dans laquelle aligner — les deux vont ensemble : sans largeur, il n'y a rien
 * à centrer.
 */
export function poserBlocs(
  ctx: Ctx2D,
  blocs: readonly Bloc[],
  x: number,
  haut: number,
  base: StyleTexte,
  {
    align = "gauche",
    largeur = 0,
    puce,
  }: { align?: Align; largeur?: number; puce?: string | null } = {},
): number {
  let y = haut;
  blocs.forEach((bloc, i) => {
    // Le bloc peut avoir SON corps et SON alignement (préfixes `--`, `++`, `|`) ;
    // sinon il suit ceux de la planche.
    const b = bloc.base ?? base;
    const al = bloc.align ?? align;
    const interligne = esp(b, "interligne");
    if (i > 0) y += ecartAvant(bloc, blocs[i - 1], b);

    if (bloc.type === "espace") {
      y += b.taille * esp(b, "respiration") * bloc.n;
      return;
    }

    if (bloc.type === "donnee") {
      // LE LIBELLÉ, puis LA VALEUR dessous — la mise en page d'une fiche
      // technique. Le libellé descend d'un cran d'encre, la valeur reprend
      // l'encre pleine.
      const { label, valeur } = bloc.corps;
      const baseLabel = y + label;
      ctx.font = fonteDe({ texte: "" }, { ...b, taille: label, graisse: 400 });
      ctx.fillStyle = b.couleurLabel ?? b.couleur;
      const largeurLabel = largeurCapitales(ctx, bloc.label, label, LETTRAGE_DONNEE);
      dessinerCapitales(
        ctx,
        bloc.label,
        x + decalageAlignement(al, largeur, largeurLabel),
        baseLabel,
        label,
        LETTRAGE_DONNEE,
        b.accent,
        { douce: b.douce },
      );
      const bv: StyleTexte = {
        ...b,
        taille: valeur,
        graisse: 700,
        couleur: b.couleurValeur ?? b.couleur,
      };
      bloc.valeur.forEach((ligne, j) => {
        const baseLigne = baseLabel + label * 0.7 + valeur * 0.82 + j * valeur * interligne;
        dessinerLigneRiche(
          ctx,
          ligne,
          x + decalageAlignement(al, largeur, largeurLigne(ligne)),
          baseLigne,
          bv,
        );
      });
      y += hauteurDonnee(bloc, b);
      return;
    }

    if (bloc.type === "liste") {
      const retrait = b.taille * esp(b, "retraitListe");
      bloc.items.forEach((item, k) => {
        const { lignes } = item;
        if (k > 0) y += b.taille * esp(b, "entreItems");
        // Un curseur, et non l'index de la ligne : une ligne peut être plus
        // haute que les autres, et c'est la SIENNE qui doit pousser la suivante.
        let dy = 0;
        lignes.forEach((ligne, j) => {
          const haut = hauteurDeLigne(ligne, b);
          const baseLigne = y + dy + haut * 0.78;
          dy += haut * interligne;
          // Une liste alignée autrement qu'à gauche garde sa puce COLLÉE au
          // texte plutôt qu'à une marge : sinon chaque puce flotte à une
          // abscisse différente, et ça ne se lit plus comme une liste.
          const gauche =
            al === "gauche"
              ? x + retrait
              : x +
                decalageAlignement(al, largeur, largeurLigne(ligne) + retrait) +
                retrait;
          // La puce du POINT l'emporte sur celle de la planche.
          if (j === 0) dessinerPuce(ctx, item.puce ?? puce, gauche - retrait, baseLigne, b);
          dessinerLigneRiche(ctx, ligne, gauche, baseLigne, b);
        });
        y += dy;
      });
      return;
    }

    let dy = 0;
    bloc.lignes.forEach((ligne, j) => {
      const haut = hauteurDeLigne(ligne, b);
      const baseLigne = y + dy + haut * 0.78;
      dy += haut * interligne;
      // L'alinéa ne concerne QUE la première ligne, et n'a aucun sens hors de
      // l'alignement à gauche : un texte centré n'a pas de bord sur lequel se
      // décaler.
      const decale = (bloc.retrait ?? 0) + (j === 0 && al === "gauche" ? (bloc.alinea ?? 0) : 0);
      const gauche =
        x + decale + decalageAlignement(al, largeur - decale, largeurLigne(ligne));
      dessinerLigneRiche(ctx, ligne, gauche, baseLigne, b);
    });
    y += dy;
  });
  return y;
}
