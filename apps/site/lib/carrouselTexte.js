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
//   *gras*        _italique_        ~souligné~        [en ambre]
// Elle s'imbrique (*_gras italique_*), et `\` échappe un caractère qu'on veut
// écrire tel quel (`\*` donne une étoile).
//
// Ce module ne dessine rien de la charte : il découpe, il mesure, il pose. Les
// couleurs et les corps lui sont donnés par l'appelant.

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

export const AIDE_BALISAGE = "*gras*  _italique_  ~souligné~  [en ambre]  [bleu: mot]";

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
    for (const bout of m.texte.split(/(\s+)/)) {
      if (bout !== "") mots.push({ ...m, texte: bout });
    }
  }

  const lignes = [];
  let ligne = [];
  let largeur = 0;

  for (const mot of mots) {
    ctx.font = fonteDe(mot, base);
    const w = ctx.measureText(mot.texte).width;
    const espace = EST_ESPACE.test(mot.texte);

    if (!espace && ligne.length > 0 && largeur + w > largeurMax) {
      // Les blancs de fin de ligne ne comptent pas : ils décaleraient un texte
      // centré, et allongeraient un soulignement dans le vide.
      while (ligne.length && EST_ESPACE.test(ligne[ligne.length - 1].texte)) {
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

/**
 * Un bloc complet : les paragraphes d'un texte balisé, déjà mis en page.
 * Une ligne vide dans la saisie sépare deux paragraphes.
 *
 * @returns {Array<Array<Array<object>>>} paragraphes → lignes → morceaux
 */
export function paragraphesRiches(ctx, texte, largeurMax, base) {
  return String(texte ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => lignesRiches(ctx, analyserRiche(p.replace(/\n/g, " ")), largeurMax, base));
}
