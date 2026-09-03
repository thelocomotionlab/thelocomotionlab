// markdown/remarkPaquetage.js
import { visit } from "unist-util-visit";

/**
 * Transforme, dans un article, un récit ou un projet :
 *
 *   <paquetage src="/paquetages/tour-des-ecrins.csv" titre="Tour des Écrins, 2026" />
 *
 * en un paragraphe texte que le renderer `p` des corps reconnaît :
 *
 *   [[PAQUETAGE_BLOCK|{"src":"/paquetages/tour-des-ecrins.csv","titre":"…"}]]
 *
 * Même mécanique que <plot> et <postlivetracking> : la balise HTML est
 * capturée AVANT rehype-raw, qui sinon la rendrait comme un élément inconnu.
 * `src` désigne un export CSV de LighterPack déposé dans public/ ; le
 * composant Paquetage le lit au build (lib/paquetage.js).
 */
const MARQUE = "[[PAQUETAGE_BLOCK|";

export default function remarkPaquetage() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value || !parent || typeof index !== "number") return;

      const raw = node.value.trim();
      if (!raw.toLowerCase().startsWith("<paquetage")) return;

      const attrs = {};
      const attrRegex = /(\w+)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(raw)) !== null) attrs[match[1]] = match[2];

      const payload = {
        src: attrs.src || "",
        titre: attrs.titre || attrs.title || "",
      };

      parent.children[index] = {
        type: "paragraph",
        children: [{ type: "text", value: `${MARQUE}${JSON.stringify(payload)}]]` }],
      };
    });
  };
}

/**
 * Le pendant côté rendu : les props de la balise si `text` est un bloc
 * paquetage, null sinon. Partagé par ArticleBody et ProjetBody pour ne pas
 * écrire deux fois la même reconnaissance.
 */
export function parsePaquetageBlock(text) {
  if (typeof text !== "string" || !text.startsWith(MARQUE)) return null;
  try {
    return JSON.parse(text.slice(MARQUE.length).replace(/\]\]$/, ""));
  } catch (e) {
    console.error("JSON Paquetage invalide :", e);
    return null;
  }
}
