// Les règles portées par le build (systeme-de-contenu §9).
//
// Le build échoue, il n'avertit pas : ce module n'a qu'un seul canal de sortie,
// `erreurs`, et il les accumule toutes avant de rendre la main pour qu'une
// passe suffise à voir tout ce qui cloche.

import type { ZodError } from "zod";

import { ancreDeSection, urlDuBloc } from "./ancres.ts";
import {
  BALISES_DE_BLOC,
  BALISES_DE_CARTE,
  propsParBalise,
  type BlocIndexe,
} from "./blocs.ts";
import { extraireDuMdx, type ExtraitMdx } from "./extraction.ts";
import { messages } from "./messages.ts";
import { estTypeDeSection } from "./sections.ts";
import { documentSchema, type Document } from "./sortes.ts";

/** Vue commune des props d'un bloc : une `Note` n'a ni `statut` ni `n`. */
type PropsDeBloc = {
  id: string;
  titre: string;
  objectif?: string;
  concepts: string[];
  refs: string[];
  statut?: BlocIndexe["statut"];
  n?: number;
};

/** Un fichier de contenu lu sur le disque, pas encore validé. */
export type DocumentBrut = {
  /** Chemin tel qu'il apparaîtra dans les messages d'erreur. */
  fichier: string;
  /** Frontmatter brut. */
  donnees: unknown;
  /** Corps MDX. */
  corps: string;
};

export type DocumentValide = {
  fichier: string;
  document: Document;
  extrait: ExtraitMdx;
};

export type EntreeDeValidation = {
  documents: readonly DocumentBrut[];
  /** Clés de la bibliographie. */
  bibliographie: Iterable<string>;
  /** Refs de jeux de données de paquetage disponibles. */
  paquetages: Iterable<string>;
};

export type ResultatDeValidation = {
  erreurs: string[];
  documents: DocumentValide[];
  blocs: BlocIndexe[];
};

function texteDesIssues(erreur: ZodError): string[] {
  return erreur.issues.map((issue) => {
    const chemin = issue.path.map(String).join(".");
    return chemin ? `${chemin} : ${issue.message}` : issue.message;
  });
}

function dateDuDocument(document: Document): string | undefined {
  switch (document.sorte) {
    case "aventure":
      return document.campagne.debut;
    case "recit":
    case "billet":
      return document.date;
    case "article":
      return document.publie_le;
  }
}

/** Les sections d'un frontmatter brut, si tant est qu'il y en ait un tableau. */
function sectionsBrutes(donnees: unknown): unknown[] | undefined {
  if (typeof donnees !== "object" || donnees === null) return undefined;
  const sections = (donnees as { sections?: unknown }).sections;
  return Array.isArray(sections) ? sections : undefined;
}

function typeBrut(section: unknown): unknown {
  if (typeof section !== "object" || section === null) return undefined;
  return (section as { type?: unknown }).type;
}

export function validerContenu(entree: EntreeDeValidation): ResultatDeValidation {
  const erreurs: string[] = [];
  const bibliographie = new Set(entree.bibliographie);
  const paquetages = new Set(entree.paquetages);

  // ── Passe A — frontmatter ─────────────────────────────────────────────────
  // Le type de section se contrôle avant Zod : l'union discriminée dirait
  // « type invalide », le §9 veut « type de section inconnu ». Une section au
  // type inconnu est retirée avant la passe Zod, pour que le reste du fichier
  // soit tout de même validé.
  const valides: DocumentValide[] = [];

  for (const brut of entree.documents) {
    let donnees = brut.donnees;
    const sections = sectionsBrutes(donnees);

    if (sections) {
      const gardees: unknown[] = [];
      for (const section of sections) {
        const type = typeBrut(section);
        if (estTypeDeSection(type)) {
          gardees.push(section);
        } else {
          erreurs.push(
            messages.typeDeSectionInconnu(String(type), brut.fichier),
          );
        }
      }
      if (gardees.length !== sections.length) {
        donnees = { ...(donnees as object), sections: gardees };
      }
    }

    const analyse = documentSchema.safeParse(donnees);
    if (!analyse.success) {
      for (const texte of texteDesIssues(analyse.error)) {
        erreurs.push(messages.schema(brut.fichier, texte));
      }
      continue;
    }

    let extrait: ExtraitMdx;
    try {
      extrait = extraireDuMdx(brut.corps);
    } catch (cause) {
      erreurs.push(
        messages.schema(
          brut.fichier,
          `corps MDX illisible : ${(cause as Error).message}`,
        ),
      );
      continue;
    }

    valides.push({ fichier: brut.fichier, document: analyse.data, extrait });
  }

  // ── Passe B — blocs et index ──────────────────────────────────────────────
  const blocs: BlocIndexe[] = [];
  const fichierParIdDeBloc = new Map<string, string>();

  for (const { fichier, document, extrait } of valides) {
    for (const lue of extrait.blocs) {
      const balise = lue.balise as keyof typeof BALISES_DE_BLOC;
      const analyse =
        balise === "Protocole"
          ? propsParBalise.Protocole.safeParse(lue.props)
          : propsParBalise.Note.safeParse(lue.props);

      if (!analyse.success) {
        for (const texte of texteDesIssues(analyse.error)) {
          erreurs.push(messages.schema(fichier, `<${balise}> ${texte}`));
        }
        continue;
      }

      const props: PropsDeBloc = analyse.data;
      const dejaVu = fichierParIdDeBloc.get(props.id);
      if (dejaVu !== undefined) {
        erreurs.push(messages.idDeBlocEnDouble(props.id, dejaVu, fichier));
        continue;
      }
      fichierParIdDeBloc.set(props.id, fichier);

      const type = BALISES_DE_BLOC[balise];
      const date = dateDuDocument(document);

      blocs.push({
        type,
        id: props.id,
        titre: props.titre,
        ...(props.objectif === undefined ? {} : { objectif: props.objectif }),
        ...(props.statut === undefined ? {} : { statut: props.statut }),
        ...(props.n === undefined ? {} : { n: props.n }),
        concepts: props.concepts,
        refs: props.refs,
        source: {
          sorte: document.sorte,
          slug: document.slug,
          titre: document.titre,
        },
        url: urlDuBloc(document, type, props.id),
        ...(date === undefined ? {} : { date }),
      });
    }
  }

  blocs.sort((a, b) => a.id.localeCompare(b.id, "fr"));
  const idsDeBloc = new Set(blocs.map((bloc) => bloc.id));

  // ── Passe C — le reste de la table, par fichier ───────────────────────────
  const slugsParSorte = {
    aventure: new Set<string>(),
    recit: new Set<string>(),
    billet: new Set<string>(),
    article: new Set<string>(),
  };
  for (const { document } of valides) slugsParSorte[document.sorte].add(document.slug);

  for (const { fichier, document, extrait } of valides) {
    // Une carte pointe vers un id absent de l'index.
    for (const carte of extrait.cartes) {
      const id = carte.props.id;
      if (typeof id !== "string") continue; // la forme est signalée plus bas
      if (!idsDeBloc.has(id)) {
        erreurs.push(messages.carteSansBloc(id, fichier, carte.balise));
      }
    }

    // Une clé de `refs` absente de la bibliographie.
    const refs: string[] = [];
    if (document.sorte === "article") refs.push(...document.refs);
    for (const bloc of blocs) {
      if (bloc.source.slug === document.slug && bloc.source.sorte === document.sorte) {
        refs.push(...bloc.refs);
      }
    }
    for (const cle of refs) {
      if (!bibliographie.has(cle)) {
        erreurs.push(messages.referenceInconnue(cle, fichier));
      }
    }

    // Une `aventure` déclarée par un billet ou un récit n'existe pas.
    if (document.sorte === "recit" || document.sorte === "billet") {
      const rattachement = document.aventure;
      if (rattachement !== undefined && !slugsParSorte.aventure.has(rattachement)) {
        erreurs.push(messages.aventureIntrouvable(rattachement, fichier));
      }
    }

    if (document.sorte !== "aventure") continue;

    // Deux sections d'une même page produisent la même ancre.
    const ancresVues = new Set<string>();
    for (const section of document.sections) {
      const ancre = ancreDeSection(section);
      if (ancresVues.has(ancre)) {
        erreurs.push(messages.ancreEnDouble(ancre, fichier));
      }
      ancresVues.add(ancre);
    }

    // Un `recit` pointe vers un slug inexistant.
    if (document.recit !== undefined && !slugsParSorte.recit.has(document.recit)) {
      erreurs.push(messages.recitIntrouvable(document.recit, fichier));
    }

    for (const section of document.sections) {
      // Une section `paquetage` référence un jeu de données absent.
      if (section.type === "paquetage" && !paquetages.has(section.ref)) {
        erreurs.push(messages.paquetageIntrouvable(section.ref, fichier));
      }

      if (section.type !== "preparation") continue;

      // Les ids de `protocoles` sont résolus dans l'index des blocs : même
      // manquement, même message que pour une carte écrite dans le corps.
      for (const id of section.protocoles) {
        if (!idsDeBloc.has(id)) {
          erreurs.push(messages.carteSansBloc(id, fichier));
        }
      }

      // Un slug de billet en dernière colonne de `seances` n'existe pas.
      const seances = section.seances;
      if (!seances) continue;
      for (const ligne of seances.lignes) {
        const slug = ligne.at(-1)?.trim();
        if (!slug) continue;
        if (!slugsParSorte.billet.has(slug)) {
          erreurs.push(messages.billetIntrouvable(slug, fichier));
        }
      }
    }
  }

  return { erreurs, documents: valides, blocs };
}

export { BALISES_DE_CARTE };
