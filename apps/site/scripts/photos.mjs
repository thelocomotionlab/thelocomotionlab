// scripts/photos.mjs
//
// Prépare un LOT de photos pour un récit ou un projet, en une commande.
//
//   pnpm -F site photos -- --projet saison-trail-2026 ~/Photos/chartreuse
//   pnpm -F site photos -- --article initiation-au-froid ~/Photos/froid
//
// Ce qu'il fait, pour chaque image du dossier source :
//   1. redresse selon l'EXIF (une photo prise en portrait sort droite) ;
//   2. réduit à 1 600 px de large au plus (la taille des photos déjà en ligne) ;
//   3. encode en WebP ;
//   4. EFFACE les métadonnées ;
//   5. écrit dans public/images/{projets|articles}/<slug>/ ;
//   6. imprime les lignes markdown à coller, prêtes à l'emploi.
//
// Ce qu'il ne fait PAS : choisir les photos, et décider d'un cadrage. Le
// premier est un travail d'auteur ; le second aussi, dès qu'il s'agit de
// composer. `--ratio` existe pour le cas où il n'y a rien à composer, juste un
// lot à uniformiser (voir plus bas).
//
// LE POINT QUI COMPTE LE PLUS ICI : les métadonnées sont effacées, et ce n'est
// pas un détail de poids de fichier. Une photo de téléphone embarque les
// COORDONNÉES GPS de la prise de vue. Publier les originaux d'un bivouac, c'est
// publier l'emplacement du bivouac. sharp n'écrit pas les métadonnées sauf
// demande explicite : on ne lui demande donc jamais.
//
// Options :
//   --projet <slug> | --article <slug>   destination (obligatoire)
//   --largeur <px>    défaut 1600
//   --qualite <1-100> défaut 80
//   --prefixe <mot>   nomme les fichiers <mot>-1.webp, <mot>-2.webp…
//   --ratio <l:h>     recadre tout le lot au même format (ex. 16:9, 3:2, 1:1).
//                     Le cadre est choisi par sharp sur la zone la plus
//                     « intéressante » de l'image (contraste, visages). Bon
//                     pour une série homogène, à ne pas confondre avec un
//                     cadrage d'auteur.
//   --ecraser         réécrit un fichier déjà présent (refusé par défaut)
//   --sec             montre ce qui serait fait, sans rien écrire

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LISIBLES = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"]);

// ── Arguments ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (nom, defaut = null) => {
  const i = args.indexOf(`--${nom}`);
  return i === -1 ? defaut : args[i + 1];
};
const drapeau = (nom) => args.includes(`--${nom}`);

const projet = opt("projet");
const article = opt("article");
const largeur = Number(opt("largeur", 1600));
const qualite = Number(opt("qualite", 80));
const prefixe = opt("prefixe");
const ratio = opt("ratio");
const ecraser = drapeau("ecraser");
const sec = drapeau("sec");

// Le dossier source est le seul argument sans tiret qui ne soit pas la valeur
// d'une option.
const valeurs = new Set(
  ["projet", "article", "largeur", "qualite", "prefixe", "ratio"]
    .map((n) => opt(n))
    .filter(Boolean),
);
const source = args.find((a) => !a.startsWith("--") && !valeurs.has(a));

function mourir(message) {
  console.error(`\n✗ ${message}\n`);
  console.error("  pnpm -F site photos -- --projet <slug> <dossier-source>");
  console.error("  pnpm -F site photos -- --article <slug> <dossier-source>\n");
  process.exit(1);
}

if (!projet && !article) mourir("préciser --projet <slug> ou --article <slug>.");
if (projet && article) mourir("--projet et --article s'excluent.");
if (!source) mourir("préciser le dossier des photos à préparer.");
if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  mourir(`dossier source introuvable : ${source}`);
}
if (!Number.isFinite(largeur) || largeur < 200) mourir("--largeur doit être un nombre ≥ 200.");
if (!Number.isFinite(qualite) || qualite < 1 || qualite > 100) mourir("--qualite doit aller de 1 à 100.");

let cadre = null;
if (ratio) {
  const [l, h] = String(ratio).split(":").map(Number);
  if (!(l > 0) || !(h > 0)) mourir(`--ratio attend « largeur:hauteur », ex. 16:9 (reçu : ${ratio}).`);
  cadre = { largeur, hauteur: Math.round((largeur * h) / l) };
}

const slug = projet || article;
const famille = projet ? "projets" : "articles";
const destination = path.join(SITE_DIR, "public", "images", famille, slug);
const urlBase = `/images/${famille}/${slug}`;

/** Nom de fichier sûr : minuscules, sans accents ni espaces. */
function slugifier(nom) {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const entrees = fs
  .readdirSync(source)
  .filter((f) => LISIBLES.has(path.extname(f).toLowerCase()))
  .sort();

if (entrees.length === 0) mourir(`aucune image lisible dans ${source}`);

console.log(`\n▶ ${entrees.length} photo(s) → ${path.relative(SITE_DIR, destination)}`);
console.log(`  ${largeur} px de large au plus · WebP q${qualite}${cadre ? ` · recadrées en ${ratio}` : ""}`);
if (sec) console.log("  (--sec : rien ne sera écrit)");
console.log("");

if (!sec) fs.mkdirSync(destination, { recursive: true });

const lignes = [];
let poidsAvant = 0;
let poidsApres = 0;
let ignorees = 0;

for (const [i, fichier] of entrees.entries()) {
  const nom = prefixe
    ? `${slugifier(prefixe)}-${i + 1}`
    : slugifier(path.basename(fichier, path.extname(fichier)));
  const sortie = path.join(destination, `${nom}.webp`);

  if (fs.existsSync(sortie) && !ecraser) {
    console.log(`  ⏭  ${fichier} → ${nom}.webp existe déjà (--ecraser pour le remplacer)`);
    ignorees += 1;
    continue;
  }

  // `rotate()` sans argument applique l'orientation EXIF : sans lui, une photo
  // prise en portrait ressort couchée.
  let pipeline = sharp(path.join(source, fichier)).rotate();
  pipeline = cadre
    ? pipeline.resize(cadre.largeur, cadre.hauteur, {
        fit: "cover",
        position: sharp.strategy.attention,
        withoutEnlargement: true,
      })
    : pipeline.resize({ width: largeur, withoutEnlargement: true });

  const avant = fs.statSync(path.join(source, fichier)).size;
  poidsAvant += avant;

  if (sec) {
    const m = await sharp(path.join(source, fichier)).metadata();
    console.log(`  · ${fichier} (${m.width}×${m.height}) → ${nom}.webp`);
  } else {
    const info = await pipeline.webp({ quality: qualite }).toFile(sortie);
    poidsApres += info.size;
    const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
    console.log(
      `  ✓ ${fichier.padEnd(28)} → ${`${nom}.webp`.padEnd(30)} ${info.width}×${info.height} · ${ko(avant)} → ${ko(info.size)}`,
    );
  }

  lignes.push(`![À décrire {width=580px align=center}](${urlBase}/${nom}.webp)`);
}

if (poidsAvant > 0 && poidsApres > 0) {
  const mo = (n) => `${(n / 1024 / 1024).toFixed(1)} Mo`;
  console.log(`\n  Total : ${mo(poidsAvant)} → ${mo(poidsApres)}`);
}
if (ignorees) console.log(`  ${ignorees} déjà présente(s), laissée(s) telle(s) quelle(s).`);

if (lignes.length) {
  console.log("\n── À coller dans le markdown ────────────────────────────\n");
  console.log(lignes.join("\n\n"));
  console.log("\n⚠️  Remplace « À décrire » par un vrai texte alternatif : c'est ce que");
  console.log("   lisent les lecteurs d'écran, et ce que Google indexe.\n");
}
