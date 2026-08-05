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

/**
 * @param {string} sortie      nom du fichier produit
 * @param {number} taille      côté du canevas, en pixels
 * @param {number} proportion  part de la largeur occupée par le logo (0-1)
 * @param {boolean} opaque     fond de la charte plutôt que transparent
 */
async function icone(sortie, taille, proportion, opaque) {
  const logoPx = Math.round(taille * proportion);
  const logo = await sharp(SOURCE)
    // Le logo source est livré sur un carré BLANC opaque. Sans ça, le réduire
    // pour ménager la zone sûre collerait un carré blanc au milieu du fond.
    // `unflatten` rend transparent le blanc pur : ne restent que les traits.
    .unflatten()
    .resize(logoPx, logoPx, { fit: "contain", background: TRANSPARENT })
    .toBuffer();

  await sharp({
    create: { width: taille, height: taille, channels: 4, background: opaque ? FOND : TRANSPARENT },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(ASSETS, sortie));

  const ko = (fs.statSync(path.join(ASSETS, sortie)).size / 1024).toFixed(1);
  console.log(
    `  ${sortie.padEnd(34)} ${String(taille).padStart(3)}px · logo ${Math.round(proportion * 100)}%` +
      ` · ${opaque ? "fond charte" : "transparent"} · ${ko} Ko`,
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

console.log("\n✓ Terminé. Vérifier le rendu masqué : https://maskable.app/editor\n");
