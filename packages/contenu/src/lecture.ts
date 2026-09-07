// Lecture du contenu sur le disque : le seul module qui touche au système de
// fichiers. Tout le reste du paquet travaille sur des valeurs.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import matter from "gray-matter";

import type { DocumentBrut } from "./validation.ts";

/** Dossier des fixtures, exclu du glob de contenu et du routage (§8). */
export const DOSSIER_FIXTURES = "__fixtures__";

const EXTENSION = ".mdx";

async function cheminsMdx(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const chemins: string[] = [];
  // Tri sur le nom : l'ordre de `readdir` dépend du système de fichiers, et un
  // index généré doit être identique d'une machine à l'autre.
  for (const entree of [...entrees].sort((a, b) => a.name.localeCompare(b.name))) {
    if (entree.name.startsWith(".")) continue;
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === DOSSIER_FIXTURES) continue;
      chemins.push(...(await cheminsMdx(chemin)));
    } else if (entree.name.endsWith(EXTENSION)) {
      chemins.push(chemin);
    }
  }
  return chemins;
}

/**
 * Lit tous les fichiers de contenu d'un dossier. `racineDesMessages` fixe la
 * forme des chemins affichés par le §9 : on veut un chemin cliquable depuis la
 * racine du dépôt, pas un chemin absolu de machine.
 */
export async function lireDocuments(
  racineDuContenu: string,
  racineDesMessages: string = process.cwd(),
): Promise<DocumentBrut[]> {
  const chemins = await cheminsMdx(racineDuContenu);
  return Promise.all(
    chemins.map(async (chemin) => {
      const source = await readFile(chemin, "utf8");
      const { data, content } = matter(source);
      return {
        fichier: relative(racineDesMessages, chemin).split(sep).join("/"),
        donnees: data,
        corps: content,
      } satisfies DocumentBrut;
    }),
  );
}

/** Les clés de la bibliographie : une source unique, clé → entrée (§10). */
export async function lireBibliographie(chemin: string): Promise<string[]> {
  const brut = JSON.parse(await readFile(chemin, "utf8")) as Record<string, unknown>;
  return Object.keys(brut);
}

/** Les jeux de données de paquetage disponibles, désignés par leur nom de fichier. */
export async function lireRefsDePaquetage(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  return entrees
    .filter((entree) => entree.isFile() && entree.name.endsWith(".csv"))
    .map((entree) => entree.name.slice(0, -".csv".length))
    .sort();
}
