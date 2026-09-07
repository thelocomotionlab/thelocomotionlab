// lib/contenu.js
//
// LA LECTURE DU CONTENU POUR LES PAGES.
//
// Le modèle, ses schémas et ses règles vivent dans @locomotionlab/contenu ; ce
// module n'est que la porte d'entrée du site : il charge l'arborescence une
// fois, ne garde que ce qui est publié, et range par sorte et par slug.
//
// §8 : un contenu qui ne déclare pas `statut: publie` n'est pas routé,
// n'apparaît dans aucun index et ne figure pas au sitemap. Le filtre est ici,
// une seule fois, pour que personne n'ait à y penser ailleurs.

import path from "node:path";
import fs from "node:fs";

import { chargerContenu, construireIndexDesBlocs, creerResolveur } from "@locomotionlab/contenu";

// La racine de l'app. `import.meta.url` ne convient pas : webpack l'analyse
// statiquement et cherche à résoudre le chemin comme un module. Le contenu est
// lu au build, et le build tourne toujours depuis apps/site.
const RACINE = process.cwd();

const ARBORESCENCE = {
  contenu: path.join(RACINE, "content"),
  base: RACINE,
  bibliographie: path.join(RACINE, "content/bibliography.json"),
  paquetages: path.join(RACINE, "public/paquetages"),
};

/** Toutes les pages, brouillons compris — le build les a déjà validées. */
function toutCharger() {
  const { pages } = chargerContenu(ARBORESCENCE);
  const { index } = construireIndexDesBlocs(pages);
  return { pages, index };
}

const { pages: TOUTES, index: BLOCS } = toutCharger();

/** Les pages routées : celles qui déclarent `statut: publie`. */
const PUBLIEES = TOUTES.filter((page) => page.frontmatter.statut === "publie");

/** Le résolveur de cartes, sur l'index des blocs. */
export const blocs = creerResolveur(BLOCS);

/**
 * La bibliographie du site, clé → entrée, dans le vocabulaire de la charte.
 *
 * Le fichier source est en anglais et hétérogène : `link` sur une entrée, `doi`
 * brut sur onze autres, rien sur les livres. On en tire un lien quand c'est
 * possible, pour que « Lire » ne manque pas là où le DOI existe. L'entrée
 * `template`, qui n'est qu'un gabarit de champs, ne fait pas partie de la
 * bibliographie.
 */
function lireLaBibliographie(chemin) {
  const brut = JSON.parse(fs.readFileSync(chemin, "utf8"));
  const entrees = {};

  for (const [cle, entree] of Object.entries(brut)) {
    if (cle === "template") continue;
    entrees[cle] = {
      auteur: entree.author,
      annee: entree.year,
      titre: entree.title,
      journal: entree.journal ?? entree.publisher,
      lien: entree.link ?? (entree.doi ? `https://doi.org/${entree.doi}` : undefined),
    };
  }

  return entrees;
}

export const bibliographie = lireLaBibliographie(ARBORESCENCE.bibliographie);

/** Les pages publiées d'une sorte. */
export function parSorte(sorte) {
  return PUBLIEES.filter((page) => page.frontmatter.sorte === sorte);
}

/** Une page publiée, par sa sorte et son slug. `undefined` si elle est en brouillon. */
export function parSlug(sorte, slug) {
  return PUBLIEES.find(
    (page) => page.frontmatter.sorte === sorte && page.frontmatter.slug === slug,
  );
}

/** Les aventures, de la campagne la plus récente à la plus ancienne. */
export function aventures() {
  return [...parSorte("aventure")].sort((a, b) =>
    dateDeCampagne(b.frontmatter).localeCompare(dateDeCampagne(a.frontmatter)),
  );
}

/** La date qui classe une aventure : sa fin quand elle en a une, sinon son début. */
export function dateDeCampagne(aventure) {
  return aventure.campagne.fin ?? aventure.campagne.debut;
}

/** Le récit d'une aventure, s'il est publié. */
export function recitDe(aventure) {
  return aventure.recit ? parSlug("recit", aventure.recit) : undefined;
}

/** L'aventure que porte un récit. */
export function aventureDe(recit) {
  return parSlug("aventure", recit.aventure);
}

/**
 * Le registre du Blog : tout ce qui est narratif et daté, récits d'aventure
 * compris, du plus récent au plus ancien.
 */
export function registreDuBlog() {
  const entrees = [
    ...parSorte("billet").map((page) => ({ page, date: page.frontmatter.date })),
    ...parSorte("recit").map((page) => ({ page, date: page.frontmatter.date })),
  ];
  return entrees.sort((a, b) => b.date.localeCompare(a.date)).map((entree) => entree.page);
}

/** Les articles Science, de la révision la plus récente à la plus ancienne. */
export function articles() {
  return [...parSorte("article")].sort((a, b) =>
    dateDArticle(b.frontmatter).localeCompare(dateDArticle(a.frontmatter)),
  );
}

/** La date qui classe un article : sa dernière révision, sinon sa publication. */
export function dateDArticle(article) {
  return article.revise_le ?? article.publie_le;
}

/** L'URL publique d'une page. Un récit vit sous son aventure. */
export function urlDe(page) {
  const { sorte, slug } = page.frontmatter;
  if (sorte === "aventure") return `/aventures/${slug}`;
  if (sorte === "billet") return `/blog/${slug}`;
  if (sorte === "article") return `/science/${slug}`;
  return `/aventures/${page.frontmatter.aventure}/recit`;
}

/** Les blocs écrits dans une page, pour marquer l'index Blog. */
export function blocsDe(page) {
  return blocs.parSource(page.frontmatter.sorte, page.frontmatter.slug);
}

/**
 * Le bloc Aventures de l'accueil (§8).
 *
 * Une campagne y montre SON RÉCIT quand il existe — le nom de l'aventure en
 * surtitre, le titre du récit en titre — et sa propre carte sinon. L'action
 * dépend de l'état : on lit un récit sur une campagne terminée, on suit celle
 * qui est en cours. Le tri est celui des aventures : l'événement le plus
 * récent d'abord.
 */
export function blocAventuresDeLAccueil(limite = 3) {
  return aventures()
    .slice(0, limite)
    .map((page) => {
      const { frontmatter } = page;
      const recit = recitDe(frontmatter);
      const termine = frontmatter.etat === "termine";

      if (recit) {
        return {
          genre: "recit",
          surtitre: frontmatter.titre,
          titre: recit.frontmatter.titre,
          url: urlDe(recit),
          cover: recit.frontmatter.cover,
          chiffres: recit.frontmatter.chiffres ?? frontmatter.resume,
          etat: frontmatter.etat,
          date: dateDeCampagne(frontmatter),
          action: termine ? "Lire le récit" : "Suivre la campagne",
        };
      }

      return {
        genre: "campagne",
        surtitre: "Aventure",
        titre: frontmatter.titre,
        url: urlDe(page),
        cover: frontmatter.cover,
        chiffres: frontmatter.resume,
        etat: frontmatter.etat,
        date: dateDeCampagne(frontmatter),
        action: termine ? "Voir la campagne" : "Suivre la campagne",
      };
    });
}
