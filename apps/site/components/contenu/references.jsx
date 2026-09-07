// components/contenu/references.jsx
//
// LE REGISTRE DE RÉFÉRENCES D'UNE PAGE.
//
// Le numéro d'un appel vient de son rang de première apparition dans le texte
// (§10). Il est attribué AVANT le rendu, en parcourant le corps une fois : la
// numérotation ne dépend donc pas de l'ordre dans lequel React rend l'arbre,
// et la bibliographie de bas de page peut être rendue n'importe où.

import { creerRegistreDeReferences, creerAppelDeReference } from "@locomotionlab/ui/contenu";

/** Les deux écritures d'un appel, plus les `refs` d'un bloc, dans l'ordre du texte. */
const APPELS = /<Citation\s+id="([\w-]+)"|\{\{cite:([\w-]+)\}\}|\brefs="([^"]*)"/g;

/**
 * Prépare le registre, l'appel de référence et le composant `citation` que le
 * rendu Markdown branche sur la balise <Citation>.
 */
export function referencesDePage(corps, ancre = "#references") {
  const registre = creerRegistreDeReferences();

  for (const appel of (corps ?? "").matchAll(APPELS)) {
    const cles = appel[1] ?? appel[2] ?? appel[3] ?? "";
    for (const cle of cles.split(",").map((element) => element.trim()).filter(Boolean)) {
      registre.numero(cle);
    }
  }

  const Ref = creerAppelDeReference(registre, ancre);

  /** <Citation id="…">texte</Citation> : le texte de l'auteur, puis l'exposant. */
  function citation({ id, children }) {
    return (
      <>
        {children}
        <Ref cle={id} />
      </>
    );
  }

  return { registre, Ref, citation };
}
