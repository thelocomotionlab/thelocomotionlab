// markdown/remarkImageOptions.js
import { visit } from "unist-util-visit";

/**
 * Syntaxe dans le markdown :
 *
 *   ![Alt lisible {size=md}](./image.png)
 *   ![Alt {size=lg align=center width=580px}](./img.png)
 *   ![Alt {width=580}](./img.png)  -> width=580px
 *
 * Options supportées :
 *   - size  = sm | md | lg | xl | half | full
 *   - align = left | center | right
 *   - width = valeur CSS (580, 580px, 60%, 40rem, etc.)
 *
 * Effet :
 *   - nettoie l'alt ("Alt lisible") pour l'accessibilité
 *   - ajoute des classes sur l'image :
 *       md-img-size-<size>  /  md-img-align-<align>
 *   - ajoute un style inline :
 *       style="max-width: <width>;"
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
      let widthStyle = "";

      // Taille logique
      if (options.size) {
        extraClasses.push(`md-img-size-${options.size}`);
      }

      // Alignement
      if (options.align) {
        extraClasses.push(`md-img-align-${options.align}`);
      }

      // Largeur précise
      if (options.width) {
        let widthVal = options.width.trim();

        // Si c'est juste un nombre → px
        if (/^\d+(\.\d+)?$/.test(widthVal)) {
          widthVal = `${widthVal}px`;
        }

        widthStyle = `max-width:${widthVal};`;
      }

      if (!extraClasses.length && !widthStyle) {
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
      if (widthStyle) {
        const existingStyle = node.data.hProperties.style;
        let styleString =
          typeof existingStyle === "string" ? existingStyle.trim() : "";

        if (styleString && !styleString.endsWith(";")) {
          styleString += ";";
        }
        if (styleString) {
          styleString += " ";
        }
        styleString += widthStyle;

        node.data.hProperties.style = styleString;
      }
    });
  };
}
