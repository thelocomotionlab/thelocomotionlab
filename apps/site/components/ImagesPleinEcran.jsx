// components/ImagesPleinEcran.jsx
//
// TOUTE IMAGE D'UN ARTICLE OU D'UN PROJET S'OUVRE EN GRAND. On clique, la
// visionneuse du direct (components/live/MediaLightbox) s'ouvre sur l'image en
// taille réelle, et les flèches font défiler toutes les images de la page.
//
// Pourquoi décorer le DOM plutôt que rendre un composant par image : le corps
// d'un article est produit par react-markdown DANS un composant serveur. Un
// rendu par image ferait autant d'îlots client isolés, incapables de partager
// la galerie — or c'est justement la navigation d'une image à l'autre qui rend
// la visionneuse agréable. Le site décore déjà son corps d'article de cette
// façon (SearchHighlighter), et le montage se fait de la même manière.
//
// Ce qui est cliquable, et rien d'autre : les `img[data-zoomable]`, marque
// posée par markdown/remarkImageOptions sur les seules images venues du
// markdown. Les cartes, replays et graphiques n'en portent pas.
//
// La légende reprise dans la visionneuse est celle qui suit l'image dans le
// texte — le paragraphe en italique, `p.md-caption` sur les projets — à
// défaut, le texte alternatif.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MediaLightbox from "@/components/live/MediaLightbox";

/** Le texte d'un paragraphe qui n'est qu'une légende en italique, sinon "". */
function legendeDuParagraphe(el) {
  if (!el || el.tagName !== "P") return "";
  const seulEm =
    el.childElementCount === 1 &&
    el.firstElementChild?.tagName === "EM" &&
    el.textContent.trim() === el.firstElementChild.textContent.trim();
  return el.classList.contains("md-caption") || seulEm ? el.textContent.trim() : "";
}

/**
 * La légende affichée sous l'image, telle que le markdown du site l'écrit.
 *
 * Deux formes, parce que les deux existent dans les contenus :
 *
 *   ![Alt](img.webp)          l'image et l'italique se suivent SANS ligne
 *   *La légende.*             vide, donc markdown n'en fait qu'UN paragraphe.
 *
 *   ![Alt](img.webp)          séparés par une ligne vide, deux paragraphes ;
 *                             c'est la forme que ProjetBody marque md-caption.
 *   *La légende.*
 */
function legendeDe(img) {
  const paragraphe = img.closest("p");
  if (!paragraphe) return "";

  // Forme 1 — l'italique partage le paragraphe de l'image. On ne le prend que
  // s'il n'y a rien d'autre autour : sinon on ramasserait une emphase perdue
  // au milieu d'un vrai paragraphe de texte.
  const em = paragraphe.querySelector(":scope > em");
  if (em) {
    const reste = [...paragraphe.childNodes].filter((n) => {
      if (n === em || n === img) return false;
      if (n.nodeType === Node.TEXT_NODE) return n.textContent.trim() !== "";
      return true;
    });
    if (!reste.length) return em.textContent.trim();
  }

  // Forme 2 — la légende est le paragraphe suivant.
  return legendeDuParagraphe(paragraphe.nextElementSibling);
}

/** La galerie, lue dans le DOM au moment où on en a besoin. */
function galerie(images) {
  return images.map((img, i) => ({
    id: `image-${i}`,
    type: "photo",
    // `currentSrc` retomberait sur la variante servie au navigateur ;
    // `src` est le fichier d'origine, c'est-à-dire la taille réelle.
    src: img.getAttribute("src") ?? img.src,
    alt: img.alt || "",
    legende: legendeDe(img),
  }));
}

export default function ImagesPleinEcran({ targetSelector = ".article-body" }) {
  // Les images vivent dans le DOM, pas dans React : un ref suffit, et la
  // galerie se construit au clic. Rien à synchroniser, donc pas d'état posé
  // depuis l'effet.
  const imagesRef = useRef([]);
  const [ouverture, setOuverture] = useState(null);

  useEffect(() => {
    const cible = document.querySelector(targetSelector);
    if (!cible) return;

    const images = [...cible.querySelectorAll("img[data-zoomable]")];
    if (!images.length) return;
    imagesRef.current = images;

    const ouvrir = (i) => (e) => {
      e.preventDefault();
      setOuverture({ medias: galerie(imagesRef.current), index: i });
    };
    const auClavier = (i) => (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      setOuverture({ medias: galerie(imagesRef.current), index: i });
    };

    // Une <img> décorée n'est pas un <button> : on lui donne le rôle, le
    // focus et l'activation au clavier, pour que la fonction existe aussi
    // sans souris.
    const poses = images.map((img, i) => {
      const clic = ouvrir(i);
      const touche = auClavier(i);
      img.addEventListener("click", clic);
      img.addEventListener("keydown", touche);
      img.classList.add("ll-image-zoomable");
      img.setAttribute("role", "button");
      img.setAttribute("tabindex", "0");
      img.setAttribute(
        "aria-label",
        img.alt ? `Agrandir l'image : ${img.alt}` : "Agrandir l'image",
      );
      return () => {
        img.removeEventListener("click", clic);
        img.removeEventListener("keydown", touche);
        img.classList.remove("ll-image-zoomable");
        img.removeAttribute("role");
        img.removeAttribute("tabindex");
        img.removeAttribute("aria-label");
      };
    });

    return () => {
      poses.forEach((defaire) => defaire());
      imagesRef.current = [];
    };
  }, [targetSelector]);

  const fermer = useCallback(() => setOuverture(null), []);
  const changerIndex = useCallback(
    (index) => setOuverture((o) => (o ? { ...o, index } : o)),
    [],
  );

  if (!ouverture) return null;

  return (
    <MediaLightbox
      medias={ouverture.medias}
      index={ouverture.index}
      onIndex={changerIndex}
      onClose={fermer}
      libelle="de la page"
    />
  );
}
