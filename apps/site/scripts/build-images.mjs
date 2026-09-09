// scripts/build-images.mjs
//
// Fabrique les tailles intermédiaires des images du site.
//
//   pnpm -F site images        (lancé aussi par prebuild et predev)
//
// LE PIÈGE QU'IL CORRIGE — sur Cloudflare Pages, l'optimiseur d'images de Next
// ne redimensionne rien : `/_next/image?url=…&w=360` renvoie le fichier source,
// octet pour octet, quelle que soit la largeur demandée. Une vignette de 250 px
// téléchargeait donc la photo entière. Le site fabrique donc ses tailles
// lui-même, au build, et `lib/imageLoader.js` y renvoie.
//
// Les originaux de public/images ne sont jamais touchés : les variantes vivent
// dans public/images-opt, qui n'est pas versionné et se refabrique à chaque
// build. Aucune n'agrandit sa source — une photo de 900 px reste à 900 px sur
// les barreaux au-dessus.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(site, "public/images");
const SORTIE = path.join(site, "public/images-opt");

/** Les barreaux de l'échelle. À tenir égaux à deviceSizes + imageSizes. */
const LARGEURS = [96, 256, 360, 640, 1080, 1600];

/** Ce qu'on sait redimensionner. Le reste (SVG, ICO…) part tel quel. */
const MATIERES = new Set([".webp", ".jpg", ".jpeg", ".png"]);

const QUALITE = 80;

function* fichiers(dossier) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) yield* fichiers(chemin);
    else yield chemin;
  }
}

/** La variante est à jour si elle existe et qu'elle est plus récente que sa source. */
function aJour(source, variante) {
  if (!fs.existsSync(variante)) return false;
  return fs.statSync(variante).mtimeMs >= fs.statSync(source).mtimeMs;
}

async function traiter(source) {
  const relatif = path.relative(SOURCE, source);
  const sansExt = relatif.slice(0, -path.extname(relatif).length);
  const image = sharp(source, { animated: true });
  const meta = await image.metadata();

  let poids = 0;
  // Une fois un barreau atteint la largeur de la source, les suivants sont le
  // même fichier : on le recopie plutôt que de le réencoder à l'identique.
  let pleineTaille = null;

  for (const largeur of LARGEURS) {
    const variante = path.join(SORTIE, `${sansExt}-${largeur}.webp`);
    fs.mkdirSync(path.dirname(variante), { recursive: true });

    if (aJour(source, variante)) {
      poids += fs.statSync(variante).size;
      if (largeur >= meta.width) pleineTaille ??= variante;
      continue;
    }

    if (pleineTaille) {
      fs.copyFileSync(pleineTaille, variante);
      poids += fs.statSync(variante).size;
      continue;
    }

    // `animated` préserve les images à plusieurs images ; sans lui, sharp n'en
    // garderait que la première et une animation deviendrait un arrêt sur image.
    const { size } = await sharp(source, { animated: meta.pages > 1 })
      .resize(largeur, null, { withoutEnlargement: true })
      .webp({ quality: QUALITE, effort: 5 })
      .toFile(variante);

    // Une source déjà bien serrée ressort parfois plus lourde de ce passage :
    // la réencoder n'apporte alors qu'une perte de génération. On la garde.
    const original = fs.statSync(source).size;
    if (largeur >= meta.width && size > original && path.extname(source).toLowerCase() === ".webp") {
      fs.copyFileSync(source, variante);
    }

    poids += fs.statSync(variante).size;
    if (largeur >= meta.width) pleineTaille = variante;
  }

  return poids;
}

const sources = [...fichiers(SOURCE)].filter((f) =>
  MATIERES.has(path.extname(f).toLowerCase()),
);

const depart = Date.now();
let avant = 0;
let apres = 0;

for (const source of sources) {
  avant += fs.statSync(source).size;
  apres += await traiter(source);
}

const mo = (octets) => `${(octets / 1048576).toFixed(1)} Mo`;
console.log(
  `images : ${sources.length} sources (${mo(avant)}) → ${sources.length * LARGEURS.length} variantes (${mo(apres)}) en ${((Date.now() - depart) / 1000).toFixed(1)} s`,
);
