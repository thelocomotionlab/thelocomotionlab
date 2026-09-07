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
// Ce qui est ignoré : tout ce qui est dans un bloc de code (``` ou ~~~), dans
// du code en ligne (`…`) ou dans un commentaire HTML. La documentation cite les
// balises dans des blocs de code, et le carnet garde de vieux passages en
// commentaire ; le contenu, lui, les écrit dans le flux.

import { BALISES_DE_BLOC, BALISE_DE_CARTE } from "./blocs.ts";
import type { TypeBloc } from "./blocs.ts";

export type BalisePosition = { debut: number; fin: number; ligne: number };

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
 * Remplace les zones de code par des espaces de même longueur : les décalages
 * restent valides, et rien de ce qui s'y trouve n'est pris pour une balise.
 */
function masquerLeCode(texte: string): string {
  const masque = texte.split("");
  const effacer = (debut: number, fin: number) => {
    for (let i = debut; i < fin && i < masque.length; i += 1) {
      if (masque[i] !== "\n") masque[i] = " ";
    }
  };

  // Blocs délimités par ``` ou ~~~ en début de ligne.
  const cloture = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*$/gm;
  let ouverture: RegExpExecArray | null = null;
  let correspondance: RegExpExecArray | null;
  while ((correspondance = cloture.exec(texte)) !== null) {
    if (ouverture === null) {
      ouverture = correspondance;
      continue;
    }
    if (correspondance[1]![0] === ouverture[1]![0] && correspondance[1]!.length >= ouverture[1]!.length) {
      effacer(ouverture.index, correspondance.index + correspondance[0].length);
      ouverture = null;
    }
  }
  // Bloc de code jamais refermé : on masque jusqu'à la fin.
  if (ouverture !== null) effacer(ouverture.index, texte.length);

  // Commentaires HTML : le carnet en garde de vieux passages, balises comprises.
  const commentaire = /<!--[\s\S]*?-->/g;
  let commente: RegExpExecArray | null;
  const sansCode = masque.join("");
  while ((commente = commentaire.exec(sansCode)) !== null) {
    effacer(commente.index, commente.index + commente[0].length);
  }

  // Code en ligne : une suite de backticks, du texte sans backtick, la même suite.
  const enLigne = /(`+)([^`\n]*)\1/g;
  const sansCommentaire = masque.join("");
  let span: RegExpExecArray | null;
  while ((span = enLigne.exec(sansCommentaire)) !== null) {
    effacer(span.index, span.index + span[0].length);
  }

  return masque.join("");
}

function numeroDeLigne(texte: string, index: number): number {
  let ligne = 1;
  for (let i = 0; i < index; i += 1) if (texte[i] === "\n") ligne += 1;
  return ligne;
}

type BaliseLue = {
  nom: string;
  attributs: Record<string, string>;
  fin: number;
  autoFermante: boolean;
  erreur?: string;
};

/**
 * Lit une balise ouvrante à partir du `<`. Les valeurs d'attribut sont des
 * chaînes entre guillemets, jamais des accolades : une accolade est refusée
 * ici, avant d'être prise pour du texte.
 */
function lireBalise(texte: string, debut: number): BaliseLue | null {
  const nomTrouve = /^<([A-Z][A-Za-z0-9]*)/.exec(texte.slice(debut, debut + 64));
  if (!nomTrouve) return null;

  const nom = nomTrouve[1]!;
  const attributs: Record<string, string> = {};
  let i = debut + nomTrouve[0].length;

  for (;;) {
    while (i < texte.length && /\s/.test(texte[i]!)) i += 1;
    if (i >= texte.length) return { nom, attributs, fin: i, autoFermante: false, erreur: `<${nom}> n'est pas refermée` };

    if (texte[i] === ">") return { nom, attributs, fin: i + 1, autoFermante: false };
    if (texte[i] === "/" && texte[i + 1] === ">") return { nom, attributs, fin: i + 2, autoFermante: true };

    const attribut = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*/.exec(texte.slice(i));
    if (!attribut) {
      return { nom, attributs, fin: i, autoFermante: false, erreur: `<${nom}> : attribut illisible` };
    }
    i += attribut[0].length;

    const guillemet = texte[i];
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
      return { nom, attributs, fin: i, autoFermante: false, erreur: `<${nom}> : la propriété « ${attribut[1]} » n'est pas entre guillemets` };
    }

    const ferme = texte.indexOf(guillemet, i + 1);
    if (ferme === -1) {
      return { nom, attributs, fin: i, autoFermante: false, erreur: `<${nom}> : la propriété « ${attribut[1]} » n'est pas refermée` };
    }
    attributs[attribut[1]!] = texte.slice(i + 1, ferme);
    i = ferme + 1;
  }
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

    const balise = lireBalise(masque, debut);
    if (!balise) {
      curseur = debut + 1;
      continue;
    }

    const typeDeBloc = BALISES_DE_BLOC[balise.nom];
    const estCarte = balise.nom === BALISE_DE_CARTE;
    if (!typeDeBloc && !estCarte) {
      curseur = balise.fin;
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

    const fermeture = `</${balise.nom}>`;
    const finCorps = masque.indexOf(fermeture, balise.fin);
    if (finCorps === -1) {
      erreurs.push(`<${balise.nom} id="${balise.attributs.id ?? ""}"> n'est jamais refermée`);
      curseur = balise.fin;
      continue;
    }
    const imbriquee = masque.indexOf(`<${balise.nom}`, balise.fin);
    if (imbriquee !== -1 && imbriquee < finCorps) {
      erreurs.push(`<${balise.nom} id="${balise.attributs.id ?? ""}"> en contient une autre ; les blocs ne s'imbriquent pas`);
      curseur = balise.fin;
      continue;
    }

    blocs.push({
      type: typeDeBloc!,
      attributs: balise.attributs,
      corps: corps.slice(balise.fin, finCorps).trim(),
      position: { ...position, fin: finCorps + fermeture.length },
    });
    curseur = finCorps + fermeture.length;
  }

  return { blocs, cartes, erreurs };
}
