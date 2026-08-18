// lib/carrouselTexte.js
//
// LE TEXTE ENRICHI DES PLANCHES : gras, italique, souligné, mise en ambre —
// au mot près, dans un simple champ de saisie.
//
// POURQUOI UN BALISAGE ET PAS UN ÉDITEUR. Un canvas ne sait pas afficher de
// texte riche : `fillText` prend UNE fonte et UNE couleur. Il faut donc de
// toute façon découper la phrase en morceaux et les poser un par un. Le vrai
// choix est celui de la SAISIE : un éditeur WYSIWYG (contenteditable) donnerait
// du HTML à re-parser, se comporterait différemment sur chaque navigateur, et
// resterait pénible au doigt sur un téléphone. Un balisage court se tape
// partout pareil, se relit dans le champ, et se copie-colle sans rien perdre.
//
// LA SYNTAXE, volontairement minuscule :
//   *gras*   _italique_   ~souligné~   [en ambre]   [bleu: mot]   :col:
//   - un point de liste (puce réglable, cf. `blocsDeTexte`)
//   > un paragraphe entier décalé — une note, une citation
// Elle s'imbrique (*_gras italique_*), et `\` échappe un caractère qu'on veut
// écrire tel quel (`\*` donne une étoile).
//
// `:col:` pose une ICÔNE dans la phrase — celles des repères de /live, tracées
// au canvas depuis leur géométrie (cf. lib/carrouselIcones.js). Elle se
// comporte comme un mot : elle prend la couleur qui l'entoure et passe à la
// ligne avec elle.
//
// Ce module ne dessine rien de la charte : il découpe, il mesure, il pose. Les
// couleurs et les corps lui sont donnés par l'appelant.

import { dessinerIcone, iconeConnue } from "./carrouselIcones";

/** Les quatre marqueurs. `accent` porte la couleur, pas une graisse. */
const MARQUEURS = [
  { ouvre: "*", ferme: "*", cle: "gras" },
  { ouvre: "_", ferme: "_", cle: "italique" },
  { ouvre: "~", ferme: "~", cle: "souligne" },
  { ouvre: "[", ferme: "]", cle: "accent" },
];

/**
 * Les couleurs nommées de la charte, appelables au mot : `[bleu: un mot]`.
 *
 * `ambre` n'a pas de valeur ici : c'est l'accent DU THÈME, et il diffère entre
 * le clair et le sombre (#EFB159 contre #C08327). Il est résolu au rendu.
 * Le fuchsia est la teinte des traces — hors charte assumé (liveTraceColors.js),
 * mais c'est la seule qui tienne sur un fond de carte, donc elle a sa place ici.
 */
export const COULEURS_TEXTE = {
  ambre: null,
  bleu: "#8CB9BD",
  terracotta: "#B67352",
  ardoise: "#5B8286",
  vert: "#3F8F5B",
  fuchsia: "#D6246E",
};

export const AIDE_BALISAGE =
  "*gras*  _italique_  ~souligné~  [en ambre]  [bleu: mot]  :col: (icône)  - liste  > retrait";

/** Une icône entre deux-points. Bornée à des minuscules sans espace, et
 *  vérifiée contre le vocabulaire : « Départ : 6 h » n'en est pas une, et
 *  `:inconnu:` reste du texte plutôt que de disparaître. */
const ICONE = /^:([a-z-]{2,24}):/;

/** Le préfixe `nom:` d'un `[…]`, s'il désigne une couleur connue. */
const PREFIXE_COULEUR = /^\s*([a-zà-ÿ]+)\s*:\s*/i;

function couleurNommee(contenu) {
  const m = PREFIXE_COULEUR.exec(contenu);
  if (!m) return null;
  const nom = m[1]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return nom in COULEURS_TEXTE ? { nom, reste: contenu.slice(m[0].length) } : null;
}

/** Position du marqueur fermant, en sautant les caractères échappés. */
function indexFermeture(texte, depuis, marqueur) {
  for (let i = depuis + 1; i < texte.length; i += 1) {
    if (texte[i] === "\\") {
      i += 1;
      continue;
    }
    if (texte[i] === marqueur.ferme) return i;
  }
  return -1;
}

/**
 * Découpe un texte balisé en morceaux stylés.
 *
 * @returns {Array<{texte:string, gras?:boolean, italique?:boolean,
 *   souligne?:boolean, accent?:boolean}>}
 */
export function analyserRiche(texte, style = {}) {
  const source = typeof texte === "string" ? texte : "";
  const out = [];
  let tampon = "";
  const pousser = () => {
    if (tampon) out.push({ ...style, texte: tampon });
    tampon = "";
  };

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === ":") {
      const m = ICONE.exec(source.slice(i));
      if (m && iconeConnue(m[1])) {
        pousser();
        out.push({ ...style, texte: "", icone: m[1] });
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
    const marqueur = MARQUEURS.find((mq) => mq.ouvre === c && !style[mq.cle]);
    if (marqueur) {
      const fin = indexFermeture(source, i, marqueur);
      // `fin > i + 1` : une paire vide (`**`) est du texte, pas un style.
      if (fin > i + 1) {
        const contenu = source.slice(i + 1, fin);
        // `[bleu: mot]` désigne une couleur nommée ; `[mot]` reste l'ambre du
        // thème. Un préfixe inconnu (`[note: …]`) n'en est pas un : il reste
        // du texte, on ne mange pas les mots de quelqu'un d'autre.
        const nommee = marqueur.cle === "accent" ? couleurNommee(contenu) : null;
        pousser();
        out.push(
          ...analyserRiche(nommee ? nommee.reste : contenu, {
            ...style,
            [marqueur.cle]: true,
            ...(nommee ? { couleur: nommee.nom } : null),
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
export function texteNu(texte) {
  return analyserRiche(texte)
    .map((m) => m.texte)
    .join("");
}

/** La fonte CSS d'un morceau, à partir du style de base du bloc. */
export function fonteDe(morceau, { police, taille, graisse = 400 }) {
  const style = morceau.italique ? "italic " : "";
  const poids = morceau.gras ? Math.max(700, graisse) : graisse;
  return `${style}${poids} ${taille}px ${police}`;
}

/**
 * L'encre d'un morceau. `ambre` passe par `base.accent` — donc par le thème,
 * et par la couleur d'accent que la carte a pu redéfinir : une teinte nommée ne
 * doit pas court-circuiter un réglage qu'on vient de faire à la main.
 */
export function encreDe(morceau, base) {
  if (!morceau.accent) return base.couleur;
  if (!morceau.couleur || morceau.couleur === "ambre") return base.accent;
  return COULEURS_TEXTE[morceau.couleur] ?? base.accent;
}

const EST_ESPACE = /^\s+$/;

/**
 * Part de la taille du texte séparant la ligne de base du CENTRE OPTIQUE des
 * capitales — même valeur que `lib/habillage.js`, pour la même raison.
 */
const CENTRE_CAPITALES = 0.35;

/** L'encombrement d'une icône : un carré, plus un souffle de chaque côté. */
export function largeurIcone(base) {
  return base.taille * 1.24;
}

/**
 * Répartit des morceaux sur des lignes d'au plus `largeurMax`.
 *
 * Les espaces sont des morceaux comme les autres : c'est ce qui permet à un mot
 * en gras de rester collé à la virgule qui le suit, et à une ligne de ne pas
 * commencer par un blanc.
 *
 * @returns {Array<Array<{texte:string, largeur:number}>>}
 */
export function lignesRiches(ctx, morceaux, largeurMax, base, { retrait = 0 } = {}) {
  const mots = [];
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

  const lignes = [];
  let ligne = [];
  let largeur = 0;

  for (const mot of mots) {
    ctx.font = fonteDe(mot, base);
    const w = mot.icone ? largeurIcone(base) : ctx.measureText(mot.texte).width;
    const espace = !mot.icone && EST_ESPACE.test(mot.texte);

    // L'ALINÉA rétrécit la PREMIÈRE ligne, pas les suivantes : c'est ce qui
    // fait qu'un retrait de première ligne reste un retrait et ne devient pas
    // une marge. Les lignes d'après retrouvent toute la justification.
    const maxCourant = lignes.length === 0 ? Math.max(base.taille, largeurMax - retrait) : largeurMax;
    if (!espace && ligne.length > 0 && largeur + w > maxCourant) {
      // Les blancs de fin de ligne ne comptent pas : ils décaleraient un texte
      // centré, et allongeraient un soulignement dans le vide.
      while (
        ligne.length &&
        !ligne[ligne.length - 1].icone &&
        EST_ESPACE.test(ligne[ligne.length - 1].texte)
      ) {
        largeur -= ligne.pop().largeur;
      }
      lignes.push(ligne);
      ligne = [];
      largeur = 0;
    }
    if (espace && ligne.length === 0) continue;

    ligne.push({ ...mot, largeur: w });
    largeur += w;
  }
  while (ligne.length && EST_ESPACE.test(ligne[ligne.length - 1].texte)) ligne.pop();
  if (ligne.length) lignes.push(ligne);
  return lignes;
}

/** Largeur d'une ligne déjà mise en page — sert à centrer ou à aligner à droite. */
export function largeurLigne(ligne) {
  return ligne.reduce((s, m) => s + m.largeur, 0);
}

/**
 * Pose une ligne. `x` est son bord GAUCHE — c'est à l'appelant de le calculer
 * s'il centre (cf. `largeurLigne`), parce que lui seul sait dans quelle boîte.
 */
export function dessinerLigneRiche(ctx, ligne, x, y, base) {
  let curseur = x;
  for (const morceau of ligne) {
    if (morceau.icone) {
      // Centrée sur le milieu optique des capitales, pas sur la ligne de base :
      // posée sur la ligne de base elle pendrait sous le mot voisin.
      const cote = base.taille * 0.98;
      dessinerIcone(
        ctx,
        morceau.icone,
        curseur + (morceau.largeur - cote) / 2,
        y - base.taille * CENTRE_CAPITALES - cote / 2,
        cote,
        encreDe(morceau, base),
      );
      curseur += morceau.largeur;
      continue;
    }
    ctx.font = fonteDe(morceau, base);
    ctx.fillStyle = encreDe(morceau, base);
    ctx.fillText(morceau.texte, curseur, y);

    if (morceau.souligne && !EST_ESPACE.test(morceau.texte)) {
      // Épaisseur et distance proportionnelles au corps : un soulignement fixé
      // en pixels colle au texte à 22 px et flotte à 65.
      const epaisseur = Math.max(1, base.taille * 0.055);
      ctx.fillRect(curseur, y + base.taille * 0.17, morceau.largeur, epaisseur);
    }
    curseur += morceau.largeur;
  }
  return curseur - x;
}

/* ------------------------------------------------------------------- blocs */

/**
 * LE MODÈLE DE BLOCS. Un texte n'est pas qu'une suite de paragraphes : il a des
 * listes, et il a des respirations. Les trois se mesurent et se posent de la
 * même façon, ce qui permet de calculer la hauteur d'un texte AVANT de le
 * dessiner — indispensable aux gabarits qui construisent du bas vers le haut.
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
 * Ce sont des DÉFAUTS, pas des constantes : chaque planche peut les redéfinir
 * (cf. `baseCorps` dans carrouselCartes.js, qui lit les réglages de la carte).
 * On les garde ici parce que c'est ici qu'on mesure et qu'on pose — mesure et
 * pose DOIVENT lire la même valeur, sinon un texte se dessine ailleurs qu'où on
 * l'a mesuré, et les gabarits qui construisent du bas vers le haut débordent.
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
  /** Retrait du texte d'une liste, qui laisse la place à la puce. */
  retraitListe: 1.6,
  /** Retrait de la PREMIÈRE ligne d'un paragraphe. Zéro = pas d'alinéa. */
  alinea: 0,
};

/**
 * LES RETOURS À LA LIGNE DURS.
 *
 * Par défaut, des lignes consécutives forment UN paragraphe : c'est ce qu'on
 * veut d'un texte suivi, où la coupure dépend de la largeur, pas de la façon
 * dont on a tapé. Mais une LÉGENDE n'est pas un texte suivi — « Jour 1 ×
 * Rapace » puis « 57 km · 4 700 m D+ » sont deux lignes, pas une phrase qui
 * déborde. Là, chaque ligne tapée reste une ligne.
 *
 * Le réglage voyage dans le style (comme les espacements) : mesure et pose ne
 * peuvent donc pas en avoir deux avis différents.
 */
function lignesDures(base) {
  return Boolean(base?.lignesDures);
}

/** La valeur réglée sur la planche, sinon celle de la charte. */
function esp(base, cle) {
  const v = base?.[cle];
  return Number.isFinite(v) && v >= 0 ? v : ESPACEMENT[cle];
}

/** Conservé pour l'historique : la valeur par défaut du retrait de liste. */
export const RETRAIT_LISTE = ESPACEMENT.retraitListe;

const EST_ITEM = /^\s*-\s+(.*)$/;
/** Un paragraphe DÉCALÉ en entier — une citation, une note. */
const EST_RETRAIT = /^\s*>\s?(.*)$/;

/**
 * Découpe un texte en blocs déjà mis en page.
 *
 * @returns {Array<{type:"paragraphe"|"liste"|"espace", lignes?:Array,
 *   items?:Array, n?:number, retrait?:number, alinea?:number}>}
 */
export function blocsDeTexte(ctx, texte, largeurMax, base) {
  const brut = String(texte ?? "").split("\n");
  const blocs = [];
  let paragraphe = []; // lignes brutes en attente
  let paraRetrait = false; // …et si elles sont décalées (« > »)
  let items = null; // items de liste en attente
  let vides = 0;

  const viderParagraphe = () => {
    if (paragraphe.length) {
      const retrait = paraRetrait ? base.taille * esp(base, "retraitListe") : 0;
      const alinea = base.taille * esp(base, "alinea");
      const large = largeurMax - retrait;
      const lignes = lignesDures(base)
        ? paragraphe.flatMap((ligne, i) =>
            lignesRiches(ctx, analyserRiche(ligne), large, base, { retrait: i === 0 ? alinea : 0 }),
          )
        : lignesRiches(ctx, analyserRiche(paragraphe.join(" ")), large, base, { retrait: alinea });
      blocs.push({ type: "paragraphe", retrait, alinea, lignes });
      paragraphe = [];
      paraRetrait = false;
    }
  };
  const viderListe = () => {
    if (items?.length) {
      blocs.push({
        type: "liste",
        items: items.map((t) =>
          lignesRiches(
            ctx,
            analyserRiche(t),
            largeurMax - base.taille * esp(base, "retraitListe"),
            base,
          ),
        ),
      });
      items = null;
    }
  };
  const vider = () => {
    viderParagraphe();
    viderListe();
  };

  for (const ligne of brut) {
    if (ligne.trim() === "") {
      vides += 1;
      continue;
    }
    // Les lignes vides accumulées : la première sépare, les suivantes aèrent.
    if (vides > 0) {
      vider();
      if (vides > 1 && blocs.length) blocs.push({ type: "espace", n: vides - 1 });
      vides = 0;
    }

    const item = EST_ITEM.exec(ligne);
    if (item) {
      viderParagraphe();
      (items ??= []).push(item[1]);
      continue;
    }
    viderListe();
    const cite = EST_RETRAIT.exec(ligne);
    // Un changement de décalage FERME le paragraphe : « > » ouvre un bloc à
    // part, il ne se mélange pas à celui qu'on était en train d'écrire.
    if (paragraphe.length && Boolean(cite) !== paraRetrait) viderParagraphe();
    paraRetrait = Boolean(cite);
    paragraphe.push((cite ? cite[1] : ligne).trim());
  }
  vider();
  return blocs;
}

/** Hauteur totale d'une suite de blocs — mesurée sans rien dessiner. */
export function hauteurBlocs(blocs, base) {
  const interligne = esp(base, "interligne");
  let h = 0;
  blocs.forEach((bloc, i) => {
    if (i > 0) h += base.taille * esp(base, "entreBlocs");
    if (bloc.type === "espace") h += base.taille * esp(base, "respiration") * bloc.n;
    else if (bloc.type === "liste") {
      h += bloc.items.reduce((s, lignes) => s + lignes.length * base.taille * interligne, 0);
      h += Math.max(0, bloc.items.length - 1) * base.taille * esp(base, "entreItems");
    } else h += bloc.lignes.length * base.taille * interligne;
  });
  return h;
}

/**
 * Dessine la puce d'un item.
 *
 * `point` et `tiret` sont tracés — deux formes trop simples pour valoir une
 * icône. Toute autre valeur est une clé du vocabulaire des repères, ce qui rend
 * les puces personnalisables sans inventer un second jeu de pictogrammes.
 */
function dessinerPuce(ctx, puce, x, baseLigne, base) {
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
      ctx.beginPath();
      ctx.moveTo(x + t * 0.04, cy);
      ctx.lineTo(x + t * 0.5, cy);
      ctx.moveTo(x + t * 0.32, cy - t * 0.16);
      ctx.lineTo(x + t * 0.5, cy);
      ctx.lineTo(x + t * 0.32, cy + t * 0.16);
      ctx.stroke();
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
      dessinerIcone(ctx, puce, x, cy - cote / 2, cote, couleur);
      return;
    }
  }
  ctx.restore();
}

/**
 * Pose des blocs de haut en bas depuis `haut`, et rend l'ordonnée du BAS.
 *
 * `centre` centre paragraphes et items ; une liste centrée garde sa puce collée
 * au texte plutôt qu'alignée sur une marge — sinon les puces flotteraient
 * chacune à une abscisse différente, ce qui ne se lit plus comme une liste.
 */
export function poserBlocs(ctx, blocs, x, haut, base, { centre = null, largeur = 0, puce } = {}) {
  const interligne = esp(base, "interligne");
  const retraitListe = esp(base, "retraitListe");
  let y = haut;
  blocs.forEach((bloc, i) => {
    if (i > 0) y += base.taille * esp(base, "entreBlocs");

    if (bloc.type === "espace") {
      y += base.taille * esp(base, "respiration") * bloc.n;
      return;
    }

    if (bloc.type === "liste") {
      bloc.items.forEach((lignes, k) => {
        if (k > 0) y += base.taille * esp(base, "entreItems");
        lignes.forEach((ligne, j) => {
          const baseLigne = y + base.taille * 0.78 + j * base.taille * interligne;
          const l = largeurLigne(ligne);
          const gauche =
            centre === null
              ? x + base.taille * retraitListe
              : centre - l / 2 + base.taille * (retraitListe / 2);
          if (j === 0) dessinerPuce(ctx, puce, gauche - base.taille * retraitListe, baseLigne, base);
          dessinerLigneRiche(ctx, ligne, gauche, baseLigne, base);
        });
        y += lignes.length * base.taille * interligne;
      });
      return;
    }

    bloc.lignes.forEach((ligne, j) => {
      const baseLigne = y + base.taille * 0.78 + j * base.taille * interligne;
      // L'alinéa ne concerne QUE la première ligne, et n'a aucun sens centré :
      // un texte centré n'a pas de bord gauche sur lequel décaler.
      const decale = (bloc.retrait ?? 0) + (j === 0 && centre === null ? (bloc.alinea ?? 0) : 0);
      const gauche =
        centre === null ? x + decale : centre - largeurLigne(ligne) / 2;
      dessinerLigneRiche(ctx, ligne, gauche, baseLigne, base);
    });
    y += bloc.lignes.length * base.taille * interligne;
  });
  return y;
}

/**
 * Les puces TRACÉES — celles dont la forme est trop simple pour valoir une
 * icône. Au-delà, toute clé du vocabulaire des repères fait une puce.
 */
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
];
