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
  "*gras*  _italique_  ~souligné~  [en ambre]  [bleu: mot]  :col: (icône)  - liste";

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
export function lignesRiches(ctx, morceaux, largeurMax, base) {
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

    if (!espace && ligne.length > 0 && largeur + w > largeurMax) {
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

/** Interligne d'un corps de texte, en parts de sa taille. */
const INTERLIGNE = 1.55;
/** Espace entre deux blocs, et hauteur d'une respiration. */
const ENTRE_BLOCS = 0.85;
const RESPIRATION = 1.1;
/** Retrait du texte d'une liste, qui laisse la place à la puce. */
export const RETRAIT_LISTE = 1.6;

const EST_ITEM = /^\s*-\s+(.*)$/;

/**
 * Découpe un texte en blocs déjà mis en page.
 *
 * @returns {Array<{type:"paragraphe"|"liste"|"espace", lignes?:Array, items?:Array, n?:number}>}
 */
export function blocsDeTexte(ctx, texte, largeurMax, base) {
  const brut = String(texte ?? "").split("\n");
  const blocs = [];
  let paragraphe = []; // lignes brutes en attente
  let items = null; // items de liste en attente
  let vides = 0;

  const viderParagraphe = () => {
    if (paragraphe.length) {
      blocs.push({
        type: "paragraphe",
        lignes: lignesRiches(ctx, analyserRiche(paragraphe.join(" ")), largeurMax, base),
      });
      paragraphe = [];
    }
  };
  const viderListe = () => {
    if (items?.length) {
      blocs.push({
        type: "liste",
        items: items.map((t) =>
          lignesRiches(ctx, analyserRiche(t), largeurMax - base.taille * RETRAIT_LISTE, base),
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
    } else {
      viderListe();
      paragraphe.push(ligne.trim());
    }
  }
  vider();
  return blocs;
}

/** Hauteur totale d'une suite de blocs — mesurée sans rien dessiner. */
export function hauteurBlocs(blocs, base) {
  let h = 0;
  blocs.forEach((bloc, i) => {
    if (i > 0) h += base.taille * ENTRE_BLOCS;
    if (bloc.type === "espace") h += base.taille * RESPIRATION * bloc.n;
    else if (bloc.type === "liste") {
      h += bloc.items.reduce((s, lignes) => s + lignes.length * base.taille * INTERLIGNE, 0);
      h += Math.max(0, bloc.items.length - 1) * base.taille * 0.35;
    } else h += bloc.lignes.length * base.taille * INTERLIGNE;
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
  if (!puce || puce === "point") {
    ctx.beginPath();
    ctx.arc(x + t * 0.28, baseLigne - t * 0.3, t * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = couleur;
    ctx.fill();
    return;
  }
  if (puce === "tiret") {
    ctx.fillStyle = couleur;
    ctx.fillRect(x, baseLigne - t * 0.34, t * 0.56, Math.max(2, t * 0.075));
    return;
  }
  const cote = t * 0.92;
  dessinerIcone(ctx, puce, x, baseLigne - t * CENTRE_CAPITALES - cote / 2, cote, couleur);
}

/**
 * Pose des blocs de haut en bas depuis `haut`, et rend l'ordonnée du BAS.
 *
 * `centre` centre paragraphes et items ; une liste centrée garde sa puce collée
 * au texte plutôt qu'alignée sur une marge — sinon les puces flotteraient
 * chacune à une abscisse différente, ce qui ne se lit plus comme une liste.
 */
export function poserBlocs(ctx, blocs, x, haut, base, { centre = null, largeur = 0, puce } = {}) {
  let y = haut;
  blocs.forEach((bloc, i) => {
    if (i > 0) y += base.taille * ENTRE_BLOCS;

    if (bloc.type === "espace") {
      y += base.taille * RESPIRATION * bloc.n;
      return;
    }

    if (bloc.type === "liste") {
      bloc.items.forEach((lignes, k) => {
        if (k > 0) y += base.taille * 0.35;
        lignes.forEach((ligne, j) => {
          const baseLigne = y + base.taille * 0.78 + j * base.taille * INTERLIGNE;
          const l = largeurLigne(ligne);
          const gauche =
            centre === null
              ? x + base.taille * RETRAIT_LISTE
              : centre - l / 2 + base.taille * (RETRAIT_LISTE / 2);
          if (j === 0) dessinerPuce(ctx, puce, gauche - base.taille * RETRAIT_LISTE, baseLigne, base);
          dessinerLigneRiche(ctx, ligne, gauche, baseLigne, base);
        });
        y += lignes.length * base.taille * INTERLIGNE;
      });
      return;
    }

    bloc.lignes.forEach((ligne, j) => {
      const baseLigne = y + base.taille * 0.78 + j * base.taille * INTERLIGNE;
      const gauche = centre === null ? x : centre - largeurLigne(ligne) / 2;
      dessinerLigneRiche(ctx, ligne, gauche, baseLigne, base);
    });
    y += bloc.lignes.length * base.taille * INTERLIGNE;
  });
  return y;
}

/** Les puces proposées : deux formes tracées, puis tout le vocabulaire d'icônes. */
export const PUCES_SIMPLES = [
  { cle: "point", label: "Point" },
  { cle: "tiret", label: "Tiret" },
];
