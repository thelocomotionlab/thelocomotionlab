// packages/contenu/src/extraction.ts
//
// LECTURE DES BALISES DE BLOC DANS LE CORPS D'UNE PAGE.
//
// Le script de build parcourt les fichiers de contenu, collecte les nœuds
// `Note` et `Protocole` et écrit `.generated/blocs.json`. Il relève aussi les
// cartes `<VersProtocole id="…" />` pour pouvoir vérifier, au build, que
// chacune pointe vers un bloc qui existe.
//
// Ce module ne lit que du texte : il ne dépend d'aucune configuration MDX. Les
// deux écritures possibles d'un même contenu (balise HTML dans un .md rendu
// par rehype-raw, composant dans un .mdx) donnent ici le même résultat, ce qui
// laisse le choix du pipeline de rendu ouvert.
//
// Ce qui est ignoré : les quatre formes de code de Markdown (clôturé par ``` ou
// ~~~, indenté de quatre espaces, en ligne entre backticks) et les commentaires
// HTML. La documentation cite les balises dans des blocs de code, et le carnet
// garde de vieux passages en commentaire ; le contenu, lui, les écrit dans le
// flux.

import { BALISES_DE_BLOC, BALISE_DE_CARTE } from "./blocs.ts";
import type { TypeBloc } from "./blocs.ts";

export type BalisePosition = {
  debut: number;
  fin: number;
  /** Ligne dans le corps reçu, frontmatter non compris. */
  ligne: number;
};

export type BlocBrut = {
  type: TypeBloc;
  attributs: Record<string, string>;
  corps: string;
  position: BalisePosition;
};

export type CarteBrute = { id: string | undefined; position: BalisePosition };

export type ResultatExtraction = {
  blocs: BlocBrut[];
  cartes: CarteBrute[];
  /** Anomalies de forme : balise non fermée, imbriquée, prop en accolades. */
  erreurs: string[];
};

/**
 * Remplace les zones de code et les commentaires par des espaces de même
 * longueur : les décalages restent valides, et rien de ce qui s'y trouve n'est
 * pris pour une balise.
 *
 * L'ordre compte. Le code passe avant les commentaires, sans quoi un `<!--`
 * cité entre backticks ouvrirait un commentaire qui n'existe pas.
 */
function masquerLeCode(texte: string): string {
  const masque = texte.split("");
  const effacer = (debut: number, fin: number) => {
    for (let i = debut; i < fin && i < masque.length; i += 1) {
      if (masque[i] !== "\n") masque[i] = " ";
    }
  };

  // 1. Blocs délimités par ``` ou ~~~ en début de ligne. Une clôture jamais
  //    refermée court jusqu'à la fin, comme en Markdown.
  // Une ouverture peut porter un langage (```mdx) ; une fermeture, non — sinon
  // ```python fermerait un bloc ouvert par ```js, et ce qui suit sortirait du
  // code alors que remark l'y laisse.
  const cloture = /^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)$/gm;
  let ouverture: RegExpExecArray | null = null;
  let correspondance: RegExpExecArray | null;
  while ((correspondance = cloture.exec(texte)) !== null) {
    if (ouverture === null) {
      ouverture = correspondance;
      continue;
    }
    if (correspondance[2]!.trim() !== "") continue;
    if (correspondance[1]![0] === ouverture[1]![0] && correspondance[1]!.length >= ouverture[1]!.length) {
      effacer(ouverture.index, correspondance.index + correspondance[0].length);
      ouverture = null;
    }
  }
  if (ouverture !== null) effacer(ouverture.index, texte.length);

  // 2. Blocs indentés de quatre espaces ou d'une tabulation, précédés d'une
  //    ligne vide : c'est ainsi qu'on montre une balise sans l'écrire.
  let position = 0;
  let precedenteVide = true;
  let debutIndente: number | null = null;
  for (const ligne of texte.split("\n")) {
    const vide = ligne.trim().length === 0;
    const indentee = /^(?: {4}|\t)/.test(ligne);

    if (debutIndente === null) {
      if (indentee && precedenteVide && !vide) debutIndente = position;
    } else if (!indentee && !vide) {
      effacer(debutIndente, position);
      debutIndente = null;
    }

    if (!vide) precedenteVide = false;
    else if (debutIndente === null) precedenteVide = true;

    position += ligne.length + 1;
  }
  if (debutIndente !== null) effacer(debutIndente, texte.length);

  // 3. Code en ligne : une suite de backticks, du texte sans backtick, la même suite.
  const enLigne = /(`+)([^`\n]*)\1/g;
  const sansBlocs = masque.join("");
  let span: RegExpExecArray | null;
  while ((span = enLigne.exec(sansBlocs)) !== null) {
    effacer(span.index, span.index + span[0].length);
  }

  // 4. Commentaires HTML. Un commentaire ouvert et jamais refermé masque la
  //    suite du document, comme une clôture de code oubliée.
  const sansCode = masque.join("");
  let depuis = 0;
  for (;;) {
    const debut = sansCode.indexOf("<!--", depuis);
    if (debut === -1) break;
    const fin = sansCode.indexOf("-->", debut + 4);
    if (fin === -1) {
      effacer(debut, texte.length);
      break;
    }
    effacer(debut, fin + 3);
    depuis = fin + 3;
  }

  return masque.join("");
}

function numeroDeLigne(texte: string, index: number): number {
  let ligne = 1;
  for (let i = 0; i < index; i += 1) if (texte[i] === "\n") ligne += 1;
  return ligne;
}

/** Le nom d'une balise s'arrête sur une espace, un `>` ou un `/`, jamais au milieu d'un mot. */
function baliseCommence(texte: string, index: number, nom: string): boolean {
  if (!texte.startsWith(`<${nom}`, index)) return false;
  const suivant = texte[index + nom.length + 1];
  return suivant === undefined || suivant === ">" || suivant === "/" || /\s/.test(suivant);
}

type BaliseLue = {
  nom: string;
  attributs: Record<string, string>;
  fin: number;
  autoFermante: boolean;
  erreur?: string;
};

/**
 * Lit une balise ouvrante à partir du `<`.
 *
 * La STRUCTURE se lit dans le texte masqué — pour ne pas ouvrir une balise sur
 * un exemple en code — mais les VALEURS se découpent dans le texte d'origine,
 * aux mêmes décalages : un titre qui contient un backtick ou un tiret de
 * commentaire doit arriver entier dans l'index.
 *
 * Les valeurs d'attribut sont des chaînes entre guillemets, jamais des
 * accolades : une accolade est refusée ici, avant d'être prise pour du texte.
 */
function lireBalise(masque: string, corps: string, debut: number): BaliseLue | null {
  const nomTrouve = /^<([A-Z][A-Za-z0-9]*)/.exec(masque.slice(debut, debut + 64));
  if (!nomTrouve) return null;

  const nom = nomTrouve[1]!;
  const attributs: Record<string, string> = {};
  let i = debut + nomTrouve[0].length;

  for (;;) {
    while (i < masque.length && /\s/.test(masque[i]!)) i += 1;
    if (i >= masque.length) {
      return { nom, attributs, fin: i, autoFermante: false, erreur: `<${nom}> n'est pas refermée` };
    }

    if (masque[i] === ">") return { nom, attributs, fin: i + 1, autoFermante: false };
    if (masque[i] === "/" && masque[i + 1] === ">") return { nom, attributs, fin: i + 2, autoFermante: true };

    const attribut = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*/.exec(masque.slice(i));
    if (!attribut) {
      return { nom, attributs, fin: i, autoFermante: false, erreur: `<${nom}> : attribut illisible` };
    }
    i += attribut[0].length;

    const guillemet = masque[i];
    if (guillemet === "{") {
      return {
        nom,
        attributs,
        fin: i,
        autoFermante: false,
        erreur: `<${nom}> : la propriété « ${attribut[1]} » est écrite en accolades ; une liste s'écrit en chaîne séparée par des virgules`,
      };
    }
    if (guillemet !== '"' && guillemet !== "'") {
      return {
        nom,
        attributs,
        fin: i,
        autoFermante: false,
        erreur: `<${nom}> : la propriété « ${attribut[1]} » n'est pas entre guillemets`,
      };
    }

    const ferme = masque.indexOf(guillemet, i + 1);
    if (ferme === -1) {
      return {
        nom,
        attributs,
        fin: i,
        autoFermante: false,
        erreur: `<${nom}> : la propriété « ${attribut[1]} » n'est pas refermée`,
      };
    }
    attributs[attribut[1]!] = corps.slice(i + 1, ferme);
    i = ferme + 1;
  }
}

/** Les cartes écrites entre deux positions du texte. */
function releverLesCartes(masque: string, corps: string, debut: number, fin: number): CarteBrute[] {
  const cartes: CarteBrute[] = [];
  let curseur = debut;

  for (;;) {
    const ouverture = masque.indexOf(`<${BALISE_DE_CARTE}`, curseur);
    if (ouverture === -1 || ouverture >= fin) return cartes;

    const balise = baliseCommence(masque, ouverture, BALISE_DE_CARTE)
      ? lireBalise(masque, corps, ouverture)
      : null;
    if (balise && !balise.erreur) {
      cartes.push({
        id: balise.attributs.id,
        position: { debut: ouverture, fin: balise.fin, ligne: numeroDeLigne(corps, ouverture) },
      });
    }
    curseur = balise ? Math.max(balise.fin, ouverture + 1) : ouverture + 1;
  }
}

/** La première ouverture de bloc trouvée dans un intervalle, s'il y en a une. */
function blocImbrique(masque: string, debut: number, fin: number): string | null {
  for (const nom of Object.keys(BALISES_DE_BLOC)) {
    for (let i = masque.indexOf(`<${nom}`, debut); i !== -1 && i < fin; i = masque.indexOf(`<${nom}`, i + 1)) {
      if (baliseCommence(masque, i, nom)) return nom;
    }
  }
  return null;
}

/**
 * Relève les blocs et les cartes du corps d'une page. Les autres composants
 * (<Citation>, <Plot>, …) sont laissés tels quels.
 */
export function extraireBlocs(corps: string): ResultatExtraction {
  const masque = masquerLeCode(corps);
  const blocs: BlocBrut[] = [];
  const cartes: CarteBrute[] = [];
  const erreurs: string[] = [];

  let curseur = 0;
  while (curseur < masque.length) {
    const debut = masque.indexOf("<", curseur);
    if (debut === -1) break;

    const balise = lireBalise(masque, corps, debut);
    if (!balise) {
      curseur = debut + 1;
      continue;
    }

    const typeDeBloc = BALISES_DE_BLOC[balise.nom];
    const estCarte = balise.nom === BALISE_DE_CARTE;
    if (!typeDeBloc && !estCarte) {
      curseur = Math.max(balise.fin, debut + 1);
      continue;
    }

    if (balise.erreur) {
      erreurs.push(balise.erreur);
      curseur = debut + 1;
      continue;
    }

    const position = { debut, fin: balise.fin, ligne: numeroDeLigne(corps, debut) };

    if (estCarte) {
      cartes.push({ id: balise.attributs.id, position });
      curseur = balise.fin;
      continue;
    }

    // Une balise auto-fermante est un bloc au corps vide : le schéma dira ce
    // qui manque, plutôt qu'une fermeture cherchée jusqu'au bloc suivant.
    if (balise.autoFermante) {
      blocs.push({ type: typeDeBloc!, attributs: balise.attributs, corps: "", position });
      curseur = balise.fin;
      continue;
    }

    const fermeture = `</${balise.nom}>`;
    const finCorps = masque.indexOf(fermeture, balise.fin);
    if (finCorps === -1) {
      erreurs.push(`<${balise.nom} id="${balise.attributs.id ?? ""}"> n'est jamais refermée`);
      curseur = balise.fin;
      continue;
    }
    const imbrique = blocImbrique(masque, balise.fin, finCorps);
    if (imbrique !== null) {
      erreurs.push(
        `<${balise.nom} id="${balise.attributs.id ?? ""}"> contient un <${imbrique}> ; les blocs ne s'imbriquent pas`,
      );
      curseur = balise.fin;
      continue;
    }

    blocs.push({
      type: typeDeBloc!,
      attributs: balise.attributs,
      corps: corps.slice(balise.fin, finCorps).trim(),
      position: { ...position, fin: finCorps + fermeture.length },
    });
    // Un bloc cite parfois un autre bloc dans son corps : la carte compte
    // autant que celles écrites dans le flux de la page.
    cartes.push(...releverLesCartes(masque, corps, balise.fin, finCorps));
    curseur = finCorps + fermeture.length;
  }

  return { blocs, cartes, erreurs };
}
