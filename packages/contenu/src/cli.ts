#!/usr/bin/env node
// packages/contenu/src/cli.ts
//
// LE SCRIPT DE BUILD DU CONTENU, appelé avant `next build` et `next dev`.
//
// Il écrit `.generated/blocs.json` et applique les règles de §9. À la première
// erreur de contenu, il rend 1 et n'écrit rien : un index incomplet servirait
// des cartes mortes.
//
//   node packages/contenu/src/cli.ts <racine de l'app>
//
// Sans argument, la racine est le dossier courant.

import { resolve } from "node:path";
import { construireContenu, ecrireIndexDesBlocs } from "./construire.ts";

const racine = resolve(process.argv[2] ?? ".");

const { index, erreurs } = construireContenu({
  contenu: resolve(racine, "content"),
  base: racine,
  bibliographie: resolve(racine, "content/bibliography.json"),
  paquetages: resolve(racine, "public/paquetages"),
});

if (erreurs.length > 0) {
  process.stderr.write(`\nLe contenu ne valide pas (${erreurs.length}) :\n`);
  for (const erreur of erreurs) process.stderr.write(`  • ${erreur}\n`);
  process.stderr.write("\n");
  process.exit(1);
}

const sortie = resolve(racine, ".generated/blocs.json");
ecrireIndexDesBlocs(sortie, index);
process.stdout.write(`.generated/blocs.json — ${index.length} bloc(s)\n`);
