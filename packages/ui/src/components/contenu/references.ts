// packages/ui/src/components/contenu/references.ts
//
// LA NUMÉROTATION DES APPELS DE RÉFÉRENCE, faite à l'affichage.
//
// Une clé de bibliographie n'a pas de numéro dans le contenu : elle en reçoit
// un à la première fois qu'elle est appelée sur la page, et le garde pour les
// appels suivants. Déplacer un paragraphe, ou un bloc entier, renumérote tout
// sans qu'aucun fichier de contenu ne change.
//
// Le registre est un objet ordinaire, créé une fois par rendu de page : pas de
// contexte React, donc rien qui empêche un composant serveur de s'en servir, et
// pas d'état partagé entre deux rendus concurrents.

export type RegistreDeReferences = {
  /** Le numéro de cette clé sur la page. L'attribue à la première rencontre. */
  numero(cle: string): number;
  /** Les clés appelées, dans l'ordre de leur numéro. */
  citees(): string[];
};

export function creerRegistreDeReferences(): RegistreDeReferences {
  const numeros = new Map<string, number>();

  return {
    numero(cle) {
      const connu = numeros.get(cle);
      if (connu !== undefined) return connu;
      const attribue = numeros.size + 1;
      numeros.set(cle, attribue);
      return attribue;
    },
    citees: () => [...numeros.keys()],
  };
}
