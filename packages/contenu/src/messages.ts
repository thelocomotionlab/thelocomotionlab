// Les messages d'échec du build, au mot près (systeme-de-contenu §9).
//
// Le build échoue avec le message indiqué : aucun avertissement silencieux,
// aucune reformulation. Toute la table du §9 est ici et nulle part ailleurs.

export const messages = {
  /** Deux blocs partagent un `id`. */
  idDeBlocEnDouble: (id: string, fichierA: string, fichierB: string) =>
    `id de bloc en double : "${id}" dans ${fichierA} et ${fichierB}`,

  /** Une carte pointe vers un `id` absent de l'index. */
  carteSansBloc: (id: string, fichier: string, balise = "VersProtocole") =>
    `<${balise} id="${id}"> dans ${fichier} : aucun bloc ne porte cet id`,

  /** Une clé de `refs` absente de la bibliographie. */
  referenceInconnue: (cle: string, fichier: string) =>
    `référence inconnue : "${cle}" dans ${fichier}`,

  /** Un `type` de section inconnu. */
  typeDeSectionInconnu: (type: string, fichier: string) =>
    `type de section inconnu : "${type}" dans ${fichier}`,

  /** Deux sections d'une même page produisent la même ancre. */
  ancreEnDouble: (ancre: string, fichier: string) =>
    `ancre en double : "${ancre}" dans ${fichier}`,

  /** Un `recit` pointe vers un slug inexistant. */
  recitIntrouvable: (slug: string, fichier: string) =>
    `récit introuvable : "${slug}" déclaré par ${fichier}`,

  /** Une `aventure` déclarée par un billet ou un récit n'existe pas. */
  aventureIntrouvable: (slug: string, fichier: string) =>
    `aventure introuvable : "${slug}" déclarée par ${fichier}`,

  /** Une section `paquetage` référence un jeu de données absent. */
  paquetageIntrouvable: (ref: string, fichier: string) =>
    `paquetage introuvable : "${ref}" dans ${fichier}`,

  /** Un slug de billet en dernière colonne de `seances` n'existe pas. */
  billetIntrouvable: (slug: string, fichier: string) =>
    `billet introuvable : "${slug}" dans ${fichier}`,

  /** Un frontmatter ne valide pas son schéma Zod. */
  schema: (fichier: string, messageZod: string) => `${fichier} : ${messageZod}`,
} as const;
