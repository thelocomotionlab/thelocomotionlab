// Construit `.generated/blocs.json` et fait échouer le build si le contenu
// enfreint une règle du §9.
//
// Lancé par `pnpm -F site build` avant `next build`. Node 22 exécute ce fichier
// TypeScript tel quel (retrait des types à la volée).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import {
  lireBibliographie,
  lireDocuments,
  lireRefsDePaquetage,
  validerContenu,
} from "../src/index.ts";

/** Remonte jusqu'au dossier qui porte `pnpm-workspace.yaml`. */
function racineDuDepot(depart: string): string {
  let dossier = depart;
  for (;;) {
    if (existsSync(join(dossier, "pnpm-workspace.yaml"))) return dossier;
    const parent = dirname(dossier);
    if (parent === dossier) {
      throw new Error("racine du monorepo introuvable (pnpm-workspace.yaml)");
    }
    dossier = parent;
  }
}

function options(argv: readonly string[]): Record<string, string> {
  const lues: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (!argument?.startsWith("--")) continue;
    const valeur = argv[i + 1];
    if (valeur === undefined) continue;
    lues[argument.slice(2)] = valeur;
    i += 1;
  }
  return lues;
}

const racine = racineDuDepot(dirname(fileURLToPath(import.meta.url)));
const lues = options(process.argv.slice(2));
const depuisRacine = (chemin: string) =>
  isAbsolute(chemin) ? chemin : resolve(racine, chemin);

const contenu = depuisRacine(lues.contenu ?? "apps/site/content");
const bibliographie = depuisRacine(
  lues.bibliographie ?? "apps/site/content/bibliography.json",
);
const paquetages = depuisRacine(lues.paquetages ?? "apps/site/public/paquetages");
const sortie = depuisRacine(lues.sortie ?? "apps/site/.generated/blocs.json");

const resultat = validerContenu({
  documents: await lireDocuments(contenu, racine),
  bibliographie: await lireBibliographie(bibliographie),
  paquetages: await lireRefsDePaquetage(paquetages),
});

if (resultat.erreurs.length > 0) {
  console.error(
    `\nContenu invalide — ${resultat.erreurs.length} erreur(s) :\n`,
  );
  for (const erreur of resultat.erreurs) console.error(`  ${erreur}`);
  console.error("");
  process.exit(1);
}

await mkdir(dirname(sortie), { recursive: true });
await writeFile(sortie, `${JSON.stringify(resultat.blocs, null, 2)}\n`, "utf8");

console.log(
  `contenu : ${resultat.documents.length} document(s), ${resultat.blocs.length} bloc(s) → ${
    lues.sortie ?? "apps/site/.generated/blocs.json"
  }`,
);
