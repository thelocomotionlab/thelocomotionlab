// packages/contenu/src/validation.ts
//
// LES RÈGLES DE BUILD DU TABLEAU §9 DE docs/systeme-de-contenu.md.
//
// Tout ce module est pur : il reçoit des pages déjà lues, rend une liste de
// messages, et n'écrit rien. Il n'a pas de canal d'avertissement — une liste
// non vide arrête le build.

import { z } from "zod";
import { EntreeDeBloc, SCHEMAS_DE_BLOC } from "./blocs.ts";
import type { Bloc } from "./blocs.ts";
import { ancresDeSections, urlDeBloc } from "./ancres.ts";
import { SCHEMAS_DE_SORTE, TYPE_DE_SECTION_INCONNU, estSorte } from "./sortes.ts";
import type { Frontmatter, FrontmatterAventure, Sorte } from "./sortes.ts";
import type { ResultatExtraction } from "./extraction.ts";
import * as messages from "./messages.ts";

export type PageAnalysee = {
  /** Chemin d'affichage du fichier, tel qu'il apparaît dans les messages. */
  chemin: string;
  frontmatter: Frontmatter;
  corps: string;
  extraction: ResultatExtraction;
};

export type Catalogue = {
  /** Les clés de content/bibliography.json. */
  bibliographie: ReadonlySet<string>;
  /** Les jeux de données de paquetage disponibles. */
  paquetages: ReadonlySet<string>;
};

/** Le chemin d'un champ dans un message Zod : `sections.2.champs.0.label`. */
function cheminDeChamp(chemin: readonly PropertyKey[]): string {
  return chemin.map(String).join(".");
}

/**
 * Traduit les erreurs Zod d'un frontmatter en messages de build. Le `type` de
 * section inconnu porte son propre message dans §9 : il est reconnu à son
 * marqueur et sort du lot.
 */
function traduireErreursZod(fichier: string, erreur: z.ZodError): string[] {
  return erreur.issues.map((issue) => {
    if (issue.message.startsWith(TYPE_DE_SECTION_INCONNU)) {
      return messages.typeDeSectionInconnu(issue.message.slice(TYPE_DE_SECTION_INCONNU.length), fichier);
    }
    return messages.schemaInvalide(fichier, cheminDeChamp(issue.path), issue.message);
  });
}

export type ResultatAnalyse =
  | { ok: true; frontmatter: Frontmatter }
  | { ok: false; erreurs: string[] };

/**
 * Valide le frontmatter d'un fichier contre le schéma de sa sorte. Le statut
 * par défaut (`brouillon`) est appliqué ici, donc un contenu qui ne se déclare
 * pas publié ne l'est pas.
 */
export function analyserFrontmatter(fichier: string, donnees: unknown): ResultatAnalyse {
  const sorte = (donnees as { sorte?: unknown } | null)?.sorte;
  if (!estSorte(sorte)) {
    return {
      ok: false,
      erreurs: [
        messages.schemaInvalide(
          fichier,
          "sorte",
          `sorte inconnue : "${String(sorte ?? "")}" — aventure, recit, billet ou article`,
        ),
      ],
    };
  }

  const resultat = SCHEMAS_DE_SORTE[sorte].safeParse(donnees);
  if (!resultat.success) return { ok: false, erreurs: traduireErreursZod(fichier, resultat.error) };
  return { ok: true, frontmatter: resultat.data as Frontmatter };
}

/** La date portée par un bloc : celle de la page qui l'accueille. */
function dateDeLaPage(frontmatter: Frontmatter): string | undefined {
  switch (frontmatter.sorte) {
    case "billet":
    case "recit":
      return frontmatter.date;
    case "article":
      return frontmatter.publie_le;
    case "aventure":
      return frontmatter.campagne.debut;
  }
}

/**
 * Construit `.generated/blocs.json` à partir des blocs relevés dans les pages,
 * et signale les `id` en double : deux blocs qui partagent un id rendraient
 * toute carte ambiguë.
 */
export function construireIndexDesBlocs(pages: readonly PageAnalysee[]): {
  index: Bloc[];
  erreurs: string[];
} {
  const index: Bloc[] = [];
  const erreurs: string[] = [];
  const vus = new Map<string, string>();

  for (const page of pages) {
    erreurs.push(...page.extraction.erreurs.map((erreur) => messages.schemaInvalide(page.chemin, "", erreur)));

    for (const brut of page.extraction.blocs) {
      const schema = SCHEMAS_DE_BLOC[brut.type];
      const props = schema.safeParse(brut.attributs);
      if (!props.success) {
        erreurs.push(...traduireErreursZod(page.chemin, props.error));
        continue;
      }

      const identifiant = props.data.id;
      const dejaVu = vus.get(identifiant);
      if (dejaVu !== undefined) {
        erreurs.push(messages.idDeBlocEnDouble(identifiant, dejaVu, page.chemin));
        continue;
      }
      vus.set(identifiant, page.chemin);

      const aventure =
        page.frontmatter.sorte === "recit" ? page.frontmatter.aventure : undefined;
      const date = dateDeLaPage(page.frontmatter);

      index.push(
        EntreeDeBloc.parse({
          type: brut.type,
          id: identifiant,
          titre: props.data.titre,
          objectif: props.data.objectif,
          ...("statut" in props.data ? { statut: props.data.statut } : {}),
          concepts: props.data.concepts,
          refs: props.data.refs,
          source: {
            sorte: page.frontmatter.sorte,
            slug: page.frontmatter.slug,
            titre: page.frontmatter.titre,
          },
          url: urlDeBloc(brut.type, props.data, {
            sorte: page.frontmatter.sorte,
            slug: page.frontmatter.slug,
            aventure,
          }),
          ...(date === undefined ? {} : { date }),
        }),
      );
    }
  }

  return { index, erreurs };
}

/**
 * Les clés de `refs` déclarées par une page : le frontmatter d'un article, et
 * les props des blocs écrits DANS cette page — lues sur place, pour qu'une page
 * ne réponde jamais des références d'une autre.
 */
function referencesDeLaPage(page: PageAnalysee): string[] {
  const cles = page.frontmatter.sorte === "article" ? [...page.frontmatter.refs] : [];
  for (const brut of page.extraction.blocs) {
    for (const cle of (brut.attributs.refs ?? "").split(",")) {
      const nettoyee = cle.trim();
      if (nettoyee.length > 0) cles.push(nettoyee);
    }
  }
  return cles;
}

/**
 * Applique les règles de §9 qui ont besoin du corpus entier : les renvois d'une
 * page à l'autre, et l'unicité des ancres d'une page.
 */
export function validerCorpus(
  pages: readonly PageAnalysee[],
  index: readonly Bloc[],
  catalogue: Catalogue,
): string[] {
  const erreurs: string[] = [];
  const idsDeBloc = new Set(index.map((bloc) => bloc.id));

  const slugsParSorte = new Map<Sorte, Set<string>>(
    (["aventure", "recit", "billet", "article"] as const).map((sorte) => [sorte, new Set<string>()]),
  );
  for (const page of pages) slugsParSorte.get(page.frontmatter.sorte)!.add(page.frontmatter.slug);

  for (const page of pages) {
    const fichier = page.chemin;

    // Une carte pointe vers un `id` absent de l'index.
    for (const carte of page.extraction.cartes) {
      if (carte.id === undefined || !idsDeBloc.has(carte.id)) {
        erreurs.push(messages.carteSansBloc(carte.id ?? "", fichier));
      }
    }

    // Une clé de `refs` absente de la bibliographie.
    for (const cle of referencesDeLaPage(page)) {
      if (!catalogue.bibliographie.has(cle)) erreurs.push(messages.referenceInconnue(cle, fichier));
    }

    // Une `aventure` déclarée par un billet ou un récit n'existe pas.
    if (page.frontmatter.sorte === "recit" || page.frontmatter.sorte === "billet") {
      const slugAventure = page.frontmatter.aventure;
      if (slugAventure !== undefined && !slugsParSorte.get("aventure")!.has(slugAventure)) {
        erreurs.push(messages.aventureIntrouvable(slugAventure, fichier));
      }
    }

    if (page.frontmatter.sorte === "aventure") {
      erreurs.push(...validerAventure(page.frontmatter, fichier, slugsParSorte, catalogue, idsDeBloc));
    }
  }

  return erreurs;
}

function validerAventure(
  aventure: FrontmatterAventure,
  fichier: string,
  slugsParSorte: ReadonlyMap<Sorte, Set<string>>,
  catalogue: Catalogue,
  idsDeBloc: ReadonlySet<string>,
): string[] {
  const erreurs: string[] = [];

  // Un `recit` pointe vers un slug inexistant.
  if (aventure.recit !== undefined && !slugsParSorte.get("recit")!.has(aventure.recit)) {
    erreurs.push(messages.recitIntrouvable(aventure.recit, fichier));
  }

  // Deux sections d'une même page produisent la même ancre.
  const vues = new Set<string>();
  for (const ancre of ancresDeSections(aventure.sections)) {
    if (vues.has(ancre)) erreurs.push(messages.ancreEnDouble(ancre, fichier));
    vues.add(ancre);
  }

  for (const section of aventure.sections) {
    // Une section `paquetage` référence un jeu de données absent.
    if (section.type === "paquetage" && !catalogue.paquetages.has(section.ref)) {
      erreurs.push(messages.paquetageIntrouvable(section.ref, fichier));
    }

    // `protocoles` porte des ids résolus dans l'index des blocs : ils
    // produisent les mêmes cartes, donc la même erreur.
    if (section.type === "preparation" && section.protocoles) {
      for (const identifiant of section.protocoles) {
        if (!idsDeBloc.has(identifiant)) erreurs.push(messages.carteSansBloc(identifiant, fichier));
      }
    }

    // Un slug de billet en dernière colonne de `seances` n'existe pas.
    if (section.type === "preparation" && section.seances) {
      const derniere = section.seances.colonnes.length - 1;
      for (const ligne of section.seances.lignes) {
        const slugBillet = (ligne[derniere] ?? "").trim();
        if (slugBillet.length > 0 && !slugsParSorte.get("billet")!.has(slugBillet)) {
          erreurs.push(messages.billetIntrouvable(slugBillet, fichier));
        }
      }
    }
  }

  return erreurs;
}
