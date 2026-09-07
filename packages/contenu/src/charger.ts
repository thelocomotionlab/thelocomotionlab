// packages/contenu/src/charger.ts
//
// LECTURE DU DOSSIER DE CONTENU.
//
// Le seul module du paquet qui touche au disque. Il rassemble ce dont les
// règles ont besoin — les pages, les blocs qu'elles portent, la bibliographie
// et les jeux de données de paquetage — et laisse la validation aux modules
// purs.
//
// Les fixtures (`content/__fixtures__/`) sont exclues du glob : elles servent
// à démontrer un gabarit sans exister vraiment, donc ni routage, ni index, ni
// index de blocs.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";

import { extraireBlocs } from "./extraction.ts";
import { analyserFrontmatter } from "./validation.ts";
import type { Catalogue, PageAnalysee } from "./validation.ts";

/** Le dossier des fixtures, exclu du contenu routé. */
export const DOSSIER_FIXTURES = "__fixtures__";

export const EXTENSIONS_DE_CONTENU = [".mdx", ".md"];

export type ArborescenceDeContenu = {
  /** Racine du contenu, par exemple apps/site/content. */
  contenu: string;
  /** Racine des chemins affichés dans les messages, par exemple apps/site. */
  base: string;
  /** Fichier des références bibliographiques. */
  bibliographie: string;
  /** Dossier des jeux de données de paquetage. */
  paquetages: string;
};

function listerFichiers(dossier: string): string[] {
  if (!existsSync(dossier)) return [];
  const trouves: string[] = [];

  for (const entree of readdirSync(dossier).sort()) {
    if (entree === DOSSIER_FIXTURES) continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...listerFichiers(chemin));
      continue;
    }
    if (EXTENSIONS_DE_CONTENU.some((extension) => entree.endsWith(extension))) trouves.push(chemin);
  }

  return trouves;
}

/** Les clés de content/bibliography.json. */
export function lireBibliographie(chemin: string): Set<string> {
  if (!existsSync(chemin)) return new Set();
  return new Set(Object.keys(JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>));
}

/** Les jeux de données de paquetage disponibles, désignés par leur nom de fichier sans extension. */
export function lirePaquetages(dossier: string): Set<string> {
  if (!existsSync(dossier)) return new Set();
  return new Set(
    readdirSync(dossier)
      .filter((entree) => entree.endsWith(".csv"))
      .map((entree) => entree.slice(0, -".csv".length)),
  );
}

export type ChargementDeContenu = {
  pages: PageAnalysee[];
  catalogue: Catalogue;
  erreurs: string[];
};

/**
 * Lit toutes les pages du dossier de contenu. Les erreurs de frontmatter sont
 * rendues telles quelles : le build les affiche toutes d'un coup plutôt que de
 * s'arrêter à la première.
 */
export function chargerContenu(arborescence: ArborescenceDeContenu): ChargementDeContenu {
  const pages: PageAnalysee[] = [];
  const erreurs: string[] = [];

  for (const chemin of listerFichiers(arborescence.contenu)) {
    const affichage = relative(arborescence.base, chemin).split(sep).join("/");
    const { data, content } = matter(readFileSync(chemin, "utf8"));

    const analyse = analyserFrontmatter(affichage, data);
    if (!analyse.ok) {
      erreurs.push(...analyse.erreurs);
      continue;
    }

    pages.push({
      chemin: affichage,
      frontmatter: analyse.frontmatter,
      corps: content,
      extraction: extraireBlocs(content),
    });
  }

  return {
    pages,
    catalogue: {
      bibliographie: lireBibliographie(arborescence.bibliographie),
      paquetages: lirePaquetages(arborescence.paquetages),
    },
    erreurs,
  };
}
