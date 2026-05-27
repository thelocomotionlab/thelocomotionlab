// markdown/remarkImageOptions.js
import { visit } from "unist-util-visit";

/**
 * Syntaxe dans le markdown :
 *
 *   ![Alt lisible {size=md}](./image.png)
 *   ![Alt {size=lg align=center width=580px}](./img.png)
 *   ![Alt {width=580}](./img.png)        -> max-width: 580px
 *   ![Alt {height=240}](./img.png)       -> max-height: 240px (width auto)
 *
 * Options supportées :
 *   - size   = sm | md | lg | xl | half | full
 *   - align  = left | center | right
 *   - width  = valeur CSS (580, 580px, 60%, 40rem, etc.)
 *   - height = valeur CSS (240, 240px, 20rem, etc.)
 *
 * Si width ET height sont définies, seul width est appliqué : height
 * est ignoré silencieusement (priorité au pilotage horizontal).
 *
 * Effet :
 *   - nettoie l'alt ("Alt lisible") pour l'accessibilité
 *   - ajoute des classes sur l'image :
 *       md-img-size-<size>  /  md-img-align-<align>
 *   - ajoute un style inline :
 *       style="max-width: <width>;"
 *       ou
 *       style="width:auto; max-height: <height>;"   (pour que le ratio
 *       reste correct malgré le `width:100%` posé sur .prose img et
 *       .md-split-col img dans globals.css)
 */
export default function remarkImageOptions() {
  return function transformer(tree) {
    visit(tree, "image", (node) => {
      if (!node.alt) return;

      // "Texte alt {size=lg align=center width=580px}"
      const match = node.alt.match(/^(.*)\{([^}]+)\}\s*$/);
      if (!match) return;

      const altText = match[1].trim();     // "Texte alt"
      const rawOptions = match[2].trim();  // "size=lg align=center width=580px"

      if (!rawOptions) {
        node.alt = altText;
        return;
      }

      const options = {};
      rawOptions.split(/\s+/).forEach((pair) => {
        const [key, value] = pair.split("=");
        if (key && value) {
          options[key.trim()] = value.trim();
        }
      });

      // Alt propre sans les options
      node.alt = altText;

      const extraClasses = [];
      let sizeStyle = "";

      // Taille logique
      if (options.size) {
        extraClasses.push(`md-img-size-${options.size}`);
      }

      // Alignement
      if (options.align) {
        extraClasses.push(`md-img-align-${options.align}`);
      }

      // Dimensions precises : width prime, height ignore si width present.
      const normalizeLength = (val) => {
        const v = val.trim();
        return /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v;
      };

      if (options.width) {
        sizeStyle = `max-width:${normalizeLength(options.width)};`;
      } else if (options.height) {
        // width:auto pour neutraliser le `width:100%` global, sinon
        // l'image conserverait toute la largeur du conteneur et la
        // contrainte de hauteur deformerait le ratio.
        sizeStyle = `width:auto; max-height:${normalizeLength(options.height)};`;
      }

      if (!extraClasses.length && !sizeStyle) {
        return;
      }

      node.data = node.data || {};
      node.data.hProperties = node.data.hProperties || {};

      // Merge des classes (string ou array → string)
      const existingClass = node.data.hProperties.className;
      let classList = [];
      if (typeof existingClass === "string") {
        classList = existingClass.split(/\s+/).filter(Boolean);
      } else if (Array.isArray(existingClass)) {
        classList = existingClass;
      }

      node.data.hProperties.className = [...classList, ...extraClasses].join(
        " "
      );

      // Merge des styles inline en string
      if (sizeStyle) {
        const existingStyle = node.data.hProperties.style;
        let styleString =
          typeof existingStyle === "string" ? existingStyle.trim() : "";

        if (styleString && !styleString.endsWith(";")) {
          styleString += ";";
        }
        if (styleString) {
          styleString += " ";
        }
        styleString += sizeStyle;

        node.data.hProperties.style = styleString;
      }
    });
  };
}
