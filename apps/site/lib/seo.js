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

export const SITE_URL = "https://thelocomotionlab.com";

/** Image de partage par défaut, en absolu — les scrapers refusent le relatif. */
export const OG_IMAGE = `${SITE_URL}/images/assets/og-hero.jpg`;

// Dimensions RÉELLES du fichier produit par build-og-image.mjs. Déclarées ici
// pour qu'elles ne puissent plus mentir : le `<head>` annonçait 1200×630 pour
// une image de 1 150×604.
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const OG_IMAGE_ALT = "The Locomotion Lab — explorer la robustesse physiologique";

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
