// packages/contenu/src/resolveur.ts
//
// LE RÉSOLVEUR QUE LES CARTES UTILISENT.
//
// Une carte affiche un bloc par son id : titre, objectif, statut, lien. Elle ne
// recopie jamais le corps. Tout passe par ici, donc renommer un protocole ou
// changer son statut met à jour toutes ses citations sans toucher à aucune.
//
// Le résolveur ne connaît pas le disque : on lui donne l'index déjà lu
// (`.generated/blocs.json`), il rend des cartes.

import { IndexDesBlocs } from "./blocs.ts";
import type { Bloc, StatutDeProtocole, TypeBloc } from "./blocs.ts";
import { carteSansBloc } from "./messages.ts";

/** Ce qu'une carte affiche, et rien de plus : jamais le corps du bloc. */
export type CarteDeBloc = {
  type: TypeBloc;
  id: string;
  titre: string;
  objectif: string;
  statut?: StatutDeProtocole;
  n?: number;
  url: string;
  source: Bloc["source"];
};

export type Resolveur = {
  /** Le bloc, ou `undefined` s'il n'existe pas. */
  chercher(id: string): Bloc | undefined;
  /** La carte du bloc. Lève si l'id n'existe pas : une carte morte arrête le build. */
  carte(id: string, fichier: string): CarteDeBloc;
  /** Tous les blocs de l'index, dans l'ordre d'écriture. */
  tous(): readonly Bloc[];
  /** Les blocs d'un type, par exemple les protocoles d'une page d'index. */
  parType(type: TypeBloc): readonly Bloc[];
  /** Les blocs écrits dans une page donnée : l'index Blog s'en sert pour marquer ses entrées. */
  parSource(sorte: Bloc["source"]["sorte"], slug: string): readonly Bloc[];
};

export class BlocIntrouvable extends Error {
  readonly id: string;
  readonly fichier: string;

  constructor(id: string, fichier: string) {
    super(carteSansBloc(id, fichier));
    this.name = "BlocIntrouvable";
    this.id = id;
    this.fichier = fichier;
  }
}

function versCarte(bloc: Bloc): CarteDeBloc {
  const { type, id, titre, objectif, statut, n, url, source } = bloc;
  return {
    type,
    id,
    titre,
    objectif,
    ...(statut === undefined ? {} : { statut }),
    ...(n === undefined ? {} : { n }),
    url,
    source,
  };
}

/** Construit un résolveur à partir de l'index généré, validé au passage. */
export function creerResolveur(index: unknown): Resolveur {
  const blocs = IndexDesBlocs.parse(index);
  const parId = new Map(blocs.map((bloc) => [bloc.id, bloc]));

  return {
    chercher: (id) => parId.get(id),
    carte(id, fichier) {
      const bloc = parId.get(id);
      if (!bloc) throw new BlocIntrouvable(id, fichier);
      return versCarte(bloc);
    },
    tous: () => blocs,
    parType: (type) => blocs.filter((bloc) => bloc.type === type),
    parSource: (sorte, slug) =>
      blocs.filter((bloc) => bloc.source.sorte === sorte && bloc.source.slug === slug),
  };
}
