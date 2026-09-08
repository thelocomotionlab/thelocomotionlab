// lib/seo.js
//
// L'image de partage (Open Graph) du site, en UN SEUL endroit.
//
// Elle était écrite en dur dans les métadonnées de quatorze fichiers. Résultat :
// l'ancienne image du labo est restée sur toutes les pages longtemps après
// qu'elle a cessé d'être d'actualité, parce que la changer voulait dire ne pas
// en oublier une seule. Elle vit ici maintenant, et un seul fichier suffit.
//
// Le fichier lui-même est FABRIQUÉ depuis le hero de l'accueil :
//   pnpm -F site build:og        (scripts/build-og-image.mjs)
// Changer le hero puis relancer ce script met à jour le partage de tout le site.
//
// ⚠️ Le nom du fichier fait partie du contrat. WhatsApp, Messenger et consorts
// mettent en cache PAR URL, souvent pour des semaines : renommer l'image est le
// seul moyen fiable de forcer une nouvelle lecture. C'est pourquoi la reprise du
// hero s'appelle `og-hero.jpg` et n'a pas écrasé `og-image.jpg`.

// L'adresse officielle du site vient de lib/site.mjs — next.config.mjs la lit
// aussi, pour rediriger l'autre hôte vers elle.
import { SITE_URL } from "./site.mjs";

export { SITE_URL };

/** Image de partage par défaut, en absolu — les scrapers refusent le relatif. */
export const OG_IMAGE = `${SITE_URL}/images/assets/og-hero.jpg`;

// Dimensions RÉELLES du fichier produit par build-og-image.mjs. Déclarées ici
// pour qu'elles ne puissent plus mentir : le `<head>` annonçait 1200×630 pour
// une image de 1 150×604.
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

// Décrit le hero, puisque c'est lui l'image. À réécrire si `build:og` change
// de source (cf. app/page.js, qui décrit la même photo).
export const OG_IMAGE_ALT = "Un pied nu prend appui sur un tronc d'arbre.";

// Le LOGO de l'organisation (JSON-LD). Rien à voir avec l'image de partage :
// les deux pointaient sur le même fichier, si bien que le logo déclaré à Google
// était une photo de terrain. C'est la marque du labo, produite par
// `pnpm -F site build:icons` (fond transparent, 512×512).
export const LOGO_URL = `${SITE_URL}/images/assets/logo-mark-512.png`;
export const LOGO_SIZE = 512;

/**
 * Le tableau `images` des métadonnées Open Graph, dimensions comprises. Les
 * scrapeurs s'en servent pour réserver la place de la vignette avant de l'avoir
 * téléchargée : sans elles, certains n'affichent rien.
 */
export const OG_IMAGES = [
  { url: OG_IMAGE, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: OG_IMAGE_ALT },
];

/**
 * URL de l'image de partage d'une page.
 *
 * @param {string} [cover] visuel propre à la page (frontmatter `cover` d'un
 *   article ou d'un projet), en chemin absolu depuis la racine du site.
 * @returns {string} le visuel de la page s'il existe, sinon le hero de l'accueil.
 */
export function imageDePartage(cover) {
  return cover ? `${SITE_URL}${cover}` : OG_IMAGE;
}

/**
 * Les métadonnées de partage d'un index (Science, Blog, Aventures, Services,
 * Le Labo) : le visuel du site, mais le titre, la description et l'URL DE
 * L'INDEX. Sans elles, partager un rayon affiche la carte de l'accueil.
 *
 * @param {object} options
 * @param {string} options.titre
 * @param {string} options.description
 * @param {string} options.url  chemin de l'index, sans le domaine
 */
export function partageDIndex({ titre, description, url }) {
  return {
    openGraph: {
      title: titre,
      description,
      url: `${SITE_URL}${url}`,
      siteName: "The Locomotion Lab",
      locale: "fr_FR",
      type: "website",
      images: OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: titre,
      description,
      images: [OG_IMAGE],
    },
  };
}

/**
 * Les métadonnées de partage d'une page de contenu.
 *
 * `openGraph` déclaré par une page REMPLACE celui du layout, il ne s'y ajoute
 * pas : une page qui n'en déclare pas hérite donc du titre, de la description
 * et du visuel du site entier. Cette fonction rend à chaque texte les siens.
 *
 * @param {object} options
 * @param {string} options.titre
 * @param {string} [options.description]
 * @param {string} options.url         chemin de la page, sans le domaine
 * @param {string} [options.cover]     visuel de la page
 * @param {string} [options.publieLe]  AAAA-MM-JJ
 * @param {string} [options.reviseLe]  AAAA-MM-JJ
 * @param {string} [options.auteur]
 */
export function partageDeContenu({
  titre,
  description,
  url,
  cover,
  publieLe,
  reviseLe,
  auteur = "Valentin Fer",
}) {
  const propre = cover && cover !== "TODO";
  const images = propre ? [{ url: imageDePartage(cover), alt: titre }] : OG_IMAGES;

  return {
    openGraph: {
      title: titre,
      ...(description ? { description } : {}),
      url: `${SITE_URL}${url}`,
      siteName: "The Locomotion Lab",
      locale: "fr_FR",
      type: "article",
      ...(publieLe ? { publishedTime: publieLe } : {}),
      ...(reviseLe ? { modifiedTime: reviseLe } : {}),
      authors: [auteur],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: titre,
      ...(description ? { description } : {}),
      images: images.map((image) => image.url),
    },
  };
}
