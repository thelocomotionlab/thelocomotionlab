// scripts/build-og-image.mjs
//
// Fabrique l'image de partage PAR DÉFAUT du site, depuis le hero de l'accueil.
//
//   pnpm -F site build:og
//
// C'est l'image que WhatsApp, Messenger, LinkedIn ou Slack affichent quand la
// page partagée n'a pas de visuel à elle (les articles et les projets ont leur
// `cover`, cf. lib/seo.js). Elle vient du hero de l'accueil pour que le premier
// contact avec le labo soit toujours le même, où qu'on entre.
//
// POURQUOI UN JPEG, alors que le hero est en WebP — les scrapers des messageries
// ne sont pas des navigateurs. WhatsApp en particulier ignore une bonne part des
// images WebP et n'affiche alors AUCUNE vignette. Le JPEG est le seul format que
// tous acceptent sans discuter.
//
// POURQUOI 1200×630 — le format attendu par Open Graph. L'ancienne image faisait
// 1 150×604 alors que le `<head>` annonçait 1200×630 : les scrapers qui
// réservent la place d'après ces valeurs affichaient un cadre légèrement faux.
// Les dimensions déclarées viennent maintenant du même endroit que le fichier
// (lib/seo.js), elles ne peuvent plus diverger.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// La source est le hero de l'accueil (app/page.js, HEROES[0]).
const SOURCE = path.join(SITE_DIR, "public", "images", "heroes", "hero-01.webp");
const SORTIE = path.join(SITE_DIR, "public", "images", "assets", "og-hero.jpg");

const LARGEUR = 1200;
const HAUTEUR = 630;

if (!fs.existsSync(SOURCE)) {
  console.error(`\n✗ hero introuvable : ${SOURCE}\n`);
  process.exit(1);
}

// Recadrage centré, comme le hero à l'écran (objectPosition « 50% 50% ») : le
// coureur est au centre, c'est lui qu'on garde quand on rogne en hauteur.
await sharp(SOURCE)
  .resize(LARGEUR, HAUTEUR, { fit: "cover", position: "center" })
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toFile(SORTIE);

const ko = (fs.statSync(SORTIE).size / 1024).toFixed(1);
console.log(`\n▶ Image de partage par défaut\n`);
console.log(`  ${path.relative(SITE_DIR, SORTIE)}  ${LARGEUR}×${HAUTEUR} · ${ko} Ko`);
console.log(`\n✓ Terminé. Vérifier le rendu : https://www.opengraph.xyz/\n`);
