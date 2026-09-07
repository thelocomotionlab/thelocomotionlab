// packages/contenu/src/construire.ts
//
// LE BUILD DU CONTENU : index des blocs + règles de §9.
//
// Une seule passe : on lit les pages, on construit `.generated/blocs.json`, on
// applique les règles. S'il reste une erreur, le build échoue — il n'y a pas
// d'avertissement, donc pas de moyen de laisser passer un lien mort.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { chargerContenu } from "./charger.ts";
import type { ArborescenceDeContenu } from "./charger.ts";
import { construireIndexDesBlocs, validerCorpus } from "./validation.ts";
import type { PageAnalysee } from "./validation.ts";
import type { Bloc } from "./blocs.ts";

export type ResultatDeBuild = {
  pages: PageAnalysee[];
  index: Bloc[];
  erreurs: string[];
};

/** Lit le contenu, construit l'index des blocs et applique les règles de §9. */
export function construireContenu(arborescence: ArborescenceDeContenu): ResultatDeBuild {
  const { pages, catalogue, erreurs } = chargerContenu(arborescence);
  const { index, erreurs: erreursDeBlocs } = construireIndexDesBlocs(pages);

  return {
    pages,
    index,
    erreurs: [...erreurs, ...erreursDeBlocs, ...validerCorpus(pages, index, catalogue)],
  };
}

/** Écrit `.generated/blocs.json`. Le dossier est créé s'il manque. */
export function ecrireIndexDesBlocs(chemin: string, index: readonly Bloc[]): void {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export class ContenuInvalide extends Error {
  readonly erreurs: readonly string[];

  constructor(erreurs: readonly string[]) {
    super(`${erreurs.length} erreur(s) de contenu :\n${erreurs.map((e) => `  • ${e}`).join("\n")}`);
    this.name = "ContenuInvalide";
    this.erreurs = erreurs;
  }
}
