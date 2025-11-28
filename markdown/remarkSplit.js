import { visit } from "unist-util-visit";

/**
 * :::split
 * gauche
 *
 * ---
 *
 * droite
 * :::
 *
 * Cas gérés pour la légende INTERNE :
 *
 * 1) Légende dans un paragraphe dédié après l'image :
 *
 *    ![Image](...)
 *    *Légende…*
 *
 *    → côté droit = [ paragraph(img), paragraph(emphasis) ]
 *
 * 2) Légende dans le même paragraphe que l'image :
 *
 *    ![Image](...)*Légende…*
 *
 *    → paragraph(image, emphasis)
 *
 * Dans tous les cas, on veut finir avec :
 *
 *   <div class="md-split md-split--with-caption md-split--caption-right|left">
 *     <div class="md-split-col left">…</div>
 *     <div class="md-split-col right">
 *       … contenu (image) …
 *       <p class="md-split-caption"><em>Légende…</em></p>
 *     </div>
 *   </div>
 */

export default function remarkSplit() {
  return (tree) => {
    visit(
      tree,
      (node) => node.type === "containerDirective" && node.name === "split",
      (node) => {
        // 1) Séparation gauche / droite sur le "---"
        const cut = node.children.findIndex(
          (c) => c.type === "thematicBreak"
        );

        const leftChildren =
          cut === -1 ? node.children : node.children.slice(0, cut);
        const rightChildren =
          cut === -1 ? [] : node.children.slice(cut + 1);

        // ----- Helpers -----

        function hasImage(n) {
          if (!n) return false;
          if (n.type === "image") return true;
          if (Array.isArray(n.children)) {
            return n.children.some(hasImage);
          }
          return false;
        }

        const isOnlyWhitespaceText = (child) =>
          child.type === "text" &&
          (!child.value || child.value.trim() === "");

        /**
         * Sur un côté :
         * - si le DERNIER paragraphe ne contient qu'un <em> => légende seule.
         * - sinon, si le paragraphe mélange image + em => on retire le <em>.
         */
        function extractCaptionFromSide(children) {
          if (!Array.isArray(children) || children.length === 0) {
            return { body: children || [], captionEm: null };
          }

          const body = children.slice();
          const lastIndex = body.length - 1;
          const last = body[lastIndex];

          if (!last || last.type !== "paragraph" || !Array.isArray(last.children)) {
            return { body, captionEm: null };
          }

          const nonWhitespace = last.children.filter(
            (child) => !isOnlyWhitespaceText(child)
          );

          // Cas 1 : paragraphe = uniquement <em> (légende seule)
          if (
            nonWhitespace.length === 1 &&
            nonWhitespace[0].type === "emphasis"
          ) {
            const captionEm = nonWhitespace[0];
            body.pop(); // on retire ce paragraphe du côté
            return { body, captionEm };
          }

          // Cas 2 : paragraphe mélange image + em
          const emIndex = last.children.findIndex(
            (child) => child.type === "emphasis"
          );

          if (emIndex === -1) {
            return { body, captionEm: null };
          }

          const captionEm = last.children[emIndex];

          const newParaChildren = last.children.filter((child, idx) => {
            if (idx === emIndex) return false; // on retire le <em>
            if (isOnlyWhitespaceText(child)) return false;
            return true;
          });

          if (newParaChildren.length > 0) {
            body[lastIndex] = { ...last, children: newParaChildren };
          } else {
            body.pop();
          }

          return { body, captionEm };
        }

        // 2) Extraction éventuelle de légende sur chaque côté

        const {
          body: leftBody,
          captionEm: leftCaptionEm,
        } = extractCaptionFromSide(leftChildren);

        const {
          body: rightBody,
          captionEm: rightCaptionEm,
        } = extractCaptionFromSide(rightChildren);

        const captionEm = rightCaptionEm || leftCaptionEm;
        const hasCaption = Boolean(captionEm);

        // 3) On détecte de quel côté est l'image dominante

        const leftHasImage = leftBody.some(hasImage);
        const rightHasImage = rightBody.some(hasImage);

        let captionSide = null;
        if (hasCaption) {
          if (rightHasImage && !leftHasImage) captionSide = "right";
          else if (leftHasImage && !rightHasImage) captionSide = "left";
          else if (rightHasImage) captionSide = "right"; // priorité à droite si les deux ont une image
          else captionSide = "left";                     // fallback safe
        }

        // 4) Colonnes finales, avec légende INSIDE la colonne image

        const leftFinal = leftBody.slice();
        const rightFinal = rightBody.slice();

        if (hasCaption && captionEm) {
          const captionParagraph = {
            type: "containerDirective",
            data: {
              hName: "p",
              hProperties: { className: ["md-split-caption"] },
            },
            children: [captionEm],
          };


          if (captionSide === "left") {
            leftFinal.push(captionParagraph);
          } else {
            rightFinal.push(captionParagraph);
          }
        }

        // 5) Transformation en <div class="md-split ...">

        node.type = "containerDirective";
        node.data = {
          hName: "div",
          hProperties: {
            className: [
              "md-split",
              hasCaption ? "md-split--with-caption" : null,
              hasCaption && captionSide === "left"
                ? "md-split--caption-left"
                : null,
              hasCaption && captionSide === "right"
                ? "md-split--caption-right"
                : null,
            ].filter(Boolean),
          },
        };

        const leftDiv = {
          type: "containerDirective",
          data: {
            hName: "div",
            hProperties: { className: ["md-split-col", "left"] },
          },
          children: leftFinal,
        };

        const rightDiv = {
          type: "containerDirective",
          data: {
            hName: "div",
            hProperties: { className: ["md-split-col", "right"] },
          },
          children: rightFinal,
        };

        node.children = [leftDiv, rightDiv];
      }
    );
  };
}
