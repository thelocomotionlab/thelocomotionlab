// packages/contenu/src/messages.ts
//
// LES MESSAGES D'ERREUR DU BUILD, mot pour mot ceux du tableau §9 de
// docs/systeme-de-contenu.md.
//
// Le build échoue, il n'avertit pas : il n'existe donc pas de canal
// d'avertissement dans ce module, et aucune de ces conditions n'est
// « tolérée ». Un message qui change ici change le contrat du tableau.

/** Deux blocs partagent un `id`. */
export const idDeBlocEnDouble = (id: string, fichierA: string, fichierB: string): string =>
  `id de bloc en double : "${id}" dans ${fichierA} et ${fichierB}`;

/** Une carte pointe vers un `id` absent de l'index. */
export const carteSansBloc = (id: string, fichier: string): string =>
  `<VersProtocole id="${id}"> dans ${fichier} : aucun bloc ne porte cet id`;

/** Une clé de `refs` absente de la bibliographie. */
export const referenceInconnue = (cle: string, fichier: string): string =>
  `référence inconnue : "${cle}" dans ${fichier}`;

/** Un `type` de section inconnu. */
export const typeDeSectionInconnu = (type: string, fichier: string): string =>
  `type de section inconnu : "${type}" dans ${fichier}`;

/** Deux sections d'une même page produisent la même ancre. */
export const ancreEnDouble = (ancre: string, fichier: string): string =>
  `ancre en double : "${ancre}" dans ${fichier}`;

/** Un `recit` pointe vers un slug inexistant. */
export const recitIntrouvable = (slug: string, fichier: string): string =>
  `récit introuvable : "${slug}" déclaré par ${fichier}`;

/** Une `aventure` déclarée par un billet ou un récit n'existe pas. */
export const aventureIntrouvable = (slug: string, fichier: string): string =>
  `aventure introuvable : "${slug}" déclarée par ${fichier}`;

/** Une section `paquetage` référence un jeu de données absent. */
export const paquetageIntrouvable = (ref: string, fichier: string): string =>
  `paquetage introuvable : "${ref}" dans ${fichier}`;

/** Un slug de billet en dernière colonne de `seances` n'existe pas. */
export const billetIntrouvable = (slug: string, fichier: string): string =>
  `billet introuvable : "${slug}" dans ${fichier}`;

/** Un frontmatter ne valide pas son schéma Zod : message Zod, préfixé du chemin du fichier. */
export const schemaInvalide = (fichier: string, chemin: string, message: string): string =>
  chemin ? `${fichier} : ${chemin} : ${message}` : `${fichier} : ${message}`;
