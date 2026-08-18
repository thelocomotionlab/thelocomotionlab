// scripts/build-icons.mjs
//
// Fabrique les icônes de l'app installée (PWA) depuis le logo source.
//
//   pnpm -F site build:icons
//
// LE PIÈGE QU'IL CORRIGE — une icône déclarée `purpose: "maskable"` est un
// contrat : on promet au lanceur Android qu'il peut y appliquer SON masque
// (cercle, squircle, goutte…) et que rien d'important ne sera perdu. La zone
// garantie visible est un CERCLE de 80 % de la largeur, centré : tout ce qui
// dépasse peut être rogné. Nos icônes montraient le logo bord à bord — le
// masque mordait donc dedans, d'où le cercle qui semblait déborder du cadre.
// Une icône maskable doit aussi être OPAQUE : le lanceur ne comble pas la
// transparence de façon prévisible.
//
// On produit deux familles, et le manifeste déclare les deux :
//   • « maskable » — logo à 66 % sur fond opaque. Sous n'importe quel masque,
//                    le logo reste entier et respire.
//   • « any »      — logo à 80 %, fond opaque lui aussi.
//
// Pourquoi « any » est PADDÉE elle aussi, alors qu'aucun masque ne s'y applique :
// rien ne garantit quel variant un lanceur retiendra. Chrome privilégie la
// maskable, d'autres prennent la plus grande, ou celle listée en premier. Une
// « any » pleine largeur suffisait à reproduire le bug d'origine chez qui ne
// suit pas la préférence. Avec les deux marges posées, le rendu est correct
// quel que soit le chemin choisi. Les favicons (favicon.ico, favicon-96x96),
// elles, restent pleine largeur — c'est leur usage.
//
// Le rendu se vérifie à l'œil avec https://maskable.app/editor (déposer le PNG).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(SITE_DIR, "public", "images", "assets");
// Le logo source vit HORS de public/ : il n'a pas à être servi, et le garder
// à part évite qu'une regénération l'écrase (il est sa propre entrée).
const SOURCE = path.join(SITE_DIR, "scripts", "assets", "logo-source-512.png");

// Fond des icônes opaques = `--color-brand-bg` de packages/ui (la charte vient
// de là et de nulle part ailleurs — cf. CLAUDE.md).
const FOND = { r: 0xfe, g: 0xfb, b: 0xf6, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Le STUDIO (l'espace de création, /studio) a ses propres icônes : sombres,
// pour qu'il ne se confonde pas avec l'app du site sur l'écran d'accueil. Deux
// icônes identiques côte à côte, c'est un vrai problème d'usage.
const FOND_STUDIO = { r: 0x1a, g: 0x1c, b: 0x18, alpha: 1 };
const ENCRE_STUDIO = { r: 0xfe, g: 0xfb, b: 0xf6, alpha: 1 };

/**
 * @param {string} sortie      nom du fichier produit
 * @param {number} taille      côté du canevas, en pixels
 * @param {number} proportion  part de la largeur occupée par le logo (0-1)
 * @param {boolean} opaque     fond de la charte plutôt que transparent
 */
async function icone(sortie, taille, proportion, opaque, studio = false) {
  const logoPx = Math.round(taille * proportion);
  let logo = await sharp(SOURCE)
    // Le logo source est livré sur un carré BLANC opaque. Sans ça, le réduire
    // pour ménager la zone sûre collerait un carré blanc au milieu du fond.
    // `unflatten` rend transparent le blanc pur : ne restent que les traits.
    .unflatten()
    .resize(logoPx, logoPx, { fit: "contain", background: TRANSPARENT })
    .toBuffer();

  if (studio) {
    // RETEINTER, pas éclaircir : `tint` préserve la luminance, donc des traits
    // terracotta resteraient sombres sur fond sombre. On repeint donc à travers
    // la FORME du logo — `dest-in` ne garde la couleur que là où il y a des
    // pixels, exactement le geste de `chargerMarqueTeintee` côté navigateur.
    logo = await sharp({
      create: { width: logoPx, height: logoPx, channels: 4, background: ENCRE_STUDIO },
    })
      .composite([{ input: logo, blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  await sharp({
    create: {
      width: taille,
      height: taille,
      channels: 4,
      background: studio ? FOND_STUDIO : opaque ? FOND : TRANSPARENT,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(ASSETS, sortie));

  const ko = (fs.statSync(path.join(ASSETS, sortie)).size / 1024).toFixed(1);
  console.log(
    `  ${sortie.padEnd(34)} ${String(taille).padStart(3)}px · logo ${Math.round(proportion * 100)}%` +
      ` · ${studio ? "fond studio" : opaque ? "fond charte" : "transparent"} · ${ko} Ko`,
  );
}

if (!fs.existsSync(SOURCE)) {
  console.error(`\n✗ logo source introuvable : ${SOURCE}\n`);
  process.exit(1);
}

console.log("\n▶ Icônes de l'app installée\n");

// « any » : 80 %, opaque — marge nette même si un lanceur la préfère.
await icone("web-app-manifest-192x192.png", 192, 0.8, true);
await icone("web-app-manifest-512x512.png", 512, 0.8, true);

// « maskable » : 66 %, bien à l'intérieur de la zone sûre (80 %), fond opaque.
await icone("web-app-manifest-maskable-192x192.png", 192, 0.66, true);
await icone("web-app-manifest-maskable-512x512.png", 512, 0.66, true);

// iOS n'applique pas la règle des 80 % (coins arrondis modérés) et n'accepte
// pas la transparence : un peu plus grand, sur fond opaque.
await icone("apple-touch-icon.png", 180, 0.8, true);

// Les icônes du studio (public/studio.webmanifest) : mêmes règles, fond sombre.
console.log("\n▶ Icônes du studio\n");
await icone("studio-192x192.png", 192, 0.8, true, true);
await icone("studio-512x512.png", 512, 0.8, true, true);
await icone("studio-maskable-192x192.png", 192, 0.66, true, true);
await icone("studio-maskable-512x512.png", 512, 0.66, true, true);
await icone("studio-apple-touch-icon.png", 180, 0.8, true, true);

// Marque seule, pleine largeur et sur fond TRANSPARENT : elle n'est pas une
// icône d'app mais l'asset servi à l'atelier d'habillage, qui la teinte en
// crème et la pose sur la photo (lib/habillage.js). Elle sort d'ici pour que
// le logo n'ait toujours qu'UNE source — changer logo-source-512.png et
// relancer ce script met tout à jour d'un coup.
await icone("logo-mark-512.png", 512, 1, false);

console.log("\n✓ Terminé. Vérifier le rendu masqué : https://maskable.app/editor\n");
