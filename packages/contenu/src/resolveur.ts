// Le résolveur que les cartes utilisent (systeme-de-contenu §6).
//
// Une carte n'a que l'id du bloc ; elle lit l'index et affiche titre, objectif,
// statut et lien. Elle ne recopie jamais le corps. Renommer un protocole ou
// changer son statut met donc à jour toutes ses citations d'un coup.

import { indexDesBlocsSchema, type BlocIndexe, type TypeDeBloc } from "./blocs.ts";

export type Resolveur = {
  /** Le bloc portant cet id, ou `undefined`. */
  resoudre(id: string): BlocIndexe | undefined;
  /** Idem, mais lève : à n'utiliser que là où le build a déjà validé l'id. */
  exige(id: string): BlocIndexe;
  /** Tous les blocs d'un type, dans l'ordre de l'index. */
  parType(type: TypeDeBloc): BlocIndexe[];
  /** Tous les blocs, dans l'ordre de l'index. */
  tous(): BlocIndexe[];
};

export function creerResolveur(index: readonly BlocIndexe[]): Resolveur {
  const parId = new Map<string, BlocIndexe>();
  for (const bloc of index) if (!parId.has(bloc.id)) parId.set(bloc.id, bloc);

  return {
    resoudre: (id) => parId.get(id),
    exige(id) {
      const bloc = parId.get(id);
      if (!bloc) throw new Error(`aucun bloc ne porte l'id « ${id} »`);
      return bloc;
    },
    parType: (type) => index.filter((bloc) => bloc.type === type),
    tous: () => [...index],
  };
}

/** Relit `.generated/blocs.json` en vérifiant qu'il a bien la forme attendue. */
export function chargerIndexDesBlocs(donnees: unknown): BlocIndexe[] {
  return indexDesBlocsSchema.parse(donnees);
}
