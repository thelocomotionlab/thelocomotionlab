// lib/science.js
//
// LES THÈMES DE SCIENCE ET LE JOURNAL DES RÉVISIONS, dérivés du contenu.
//
// §7 : le filtre par thème est dérivé du contenu et masqué tant qu'il n'existe
// pas au moins deux thèmes contenant chacun au moins deux articles. Un thème
// sans article n'existe pas — la liste ne se déclare nulle part, elle se
// compte.

import { articles, dateDArticle, urlDe, bibliographie } from "@/lib/contenu";

/** Le seuil au-dessous duquel la barre de thèmes ne s'affiche pas. */
const THEMES_MINIMUM = 2;
const ARTICLES_PAR_THEME_MINIMUM = 2;

/** Les thèmes portés par au moins un article, avec leur compte. */
export function themes() {
  const comptes = new Map();
  for (const page of articles()) {
    for (const theme of page.frontmatter.themes) {
      comptes.set(theme, (comptes.get(theme) ?? 0) + 1);
    }
  }
  return [...comptes.entries()]
    .map(([nom, compte]) => ({ nom, compte, libelle: libelleDeTheme(nom) }))
    .sort((a, b) => b.compte - a.compte || a.nom.localeCompare(b.nom));
}

/** La barre de thèmes s'affiche seulement au-dessus du seuil de §7. */
export function barreDeThemesVisible(liste = themes()) {
  return (
    liste.filter((theme) => theme.compte >= ARTICLES_PAR_THEME_MINIMUM).length >= THEMES_MINIMUM
  );
}

/** « memoire-musculaire » → « Mémoire musculaire ». Faute d'index de thèmes, le slug fait le libellé. */
function libelleDeTheme(nom) {
  const mots = nom.split("-").join(" ");
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/** Les articles tels que l'index les affiche. */
export function entrees() {
  return articles().map((page) => ({
    slug: page.frontmatter.slug,
    titre: page.frontmatter.titre,
    chapeau: page.frontmatter.chapeau,
    themes: page.frontmatter.themes,
    revise: Boolean(page.frontmatter.revise_le),
    date: dateDArticle(page.frontmatter),
    cover: page.frontmatter.cover,
    lecture: page.frontmatter.lecture,
    corps: page.corps,
    url: urlDe(page),
  }));
}

/**
 * Le journal des révisions : la publication de chaque article, et chacune de
 * ses révisions déclarées, du plus récent au plus ancien.
 */
export function journalDesRevisions() {
  const evenements = [];

  for (const page of articles()) {
    const { titre, publie_le: publieLe, revisions } = page.frontmatter;
    evenements.push({ date: publieLe, titre, quoi: "publication", genre: "publication" });
    for (const revision of revisions) {
      evenements.push({ date: revision.date, titre, quoi: revision.quoi, genre: "revision" });
    }
  }

  return evenements.sort((a, b) => b.date.localeCompare(a.date));
}

/** Les deux écritures d'un appel de référence dans le corps d'un article. */
const APPELS = /<Citation\s+id="([\w-]+)"|\{\{cite:([\w-]+)\}\}/g;

/** Les références réellement citées par les articles, dans l'ordre alphabétique de clé. */
export function bibliographieDuLabo() {
  const citees = new Set();
  for (const page of articles()) {
    for (const appel of page.corps.matchAll(APPELS)) citees.add(appel[1] ?? appel[2]);
  }
  return [...citees]
    .filter((cle) => bibliographie[cle])
    .sort()
    .map((cle) => ({ cle, ...bibliographie[cle] }));
}
