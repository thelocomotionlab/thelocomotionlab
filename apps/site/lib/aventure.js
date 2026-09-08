// lib/aventure.js
//
// CE QUE LA PAGE AVENTURE A BESOIN DE RÉSOUDRE HORS DU FRONTMATTER.
//
// Les sections déclarent des références — un jeu de paquetage, des slugs de
// billets, des ids de protocoles ; le build a vérifié qu'elles existent, cette
// couche les transforme en ce que les composants savent afficher.

import fs from "node:fs";
import path from "node:path";

import { agregerPaquetage, grammes } from "@/lib/paquetage";
import { specDuGraphe } from "@/lib/grapheDePreparation";
import { blocs, parSorte, recitDe, urlDe } from "@/lib/contenu";
import { dateLisible } from "@/lib/lisible";

const PAQUETAGES = path.join(process.cwd(), "public/paquetages");
const REPLAYS = path.join(process.cwd(), "public/replays");

/** L'état d'une campagne, tel qu'il s'affiche. */
export const ETATS = {
  termine: "Terminé",
  "en-cours": "En cours",
  "en-preparation": "En préparation",
};

/**
 * La période d'une aventure, dite comme on la dirait : « Du 29/09 au
 * 30/11/2025 ». Une aventure sans fin n'annonce qu'un départ.
 *
 * L'année du début est tue quand c'est la même qu'à la fin.
 */
export function campagneLisible(campagne) {
  const debut = dateLisible(campagne.debut);
  if (!campagne.fin) return `Départ le ${debut}`;

  const [jourDebut, moisDebut] = campagne.debut.split("-").reverse();
  const fin = dateLisible(campagne.fin);
  const memeAnnee = campagne.debut.slice(0, 4) === campagne.fin.slice(0, 4);
  const debutCourt = memeAnnee ? `${jourDebut}/${moisDebut}` : debut;
  return `Prépa du ${debutCourt} au ${fin}`;
}

/**
 * Une entrée du `resume` en valeur et libellé.
 *
 * `{ label, valeur }` dit les deux : « OFF » sous « Type de projet ». Une
 * chaîne détache son nombre de son unité — « 9 800 m D+ » se lit « 9 800 » sous
 * « m D+ » — et reste entière quand elle n'en a pas : « sandales » n'a pas de
 * valeur à détacher.
 */
export function chiffreDeCarte(entree) {
  if (typeof entree === "object" && entree !== null) {
    return { valeur: entree.valeur, libelle: entree.label };
  }

  const texte = entree;
  const trouve = /^([\d\s.,]+)\s+(.+)$/.exec(texte.trim());
  if (!trouve) return { valeur: texte, libelle: null };
  return { valeur: trouve[1].trim(), libelle: trouve[2].trim() };
}

/** Le jeu de données d'un paquetage, agrégé depuis son CSV. */
function paquetage(ref) {
  const csv = path.join(PAQUETAGES, `${ref}.csv`);
  if (!fs.existsSync(csv)) return null;

  // agregerPaquetage rend déjà { total, nombreArticles, categories[{nom, masse,
  // articles[{nom, masse}]}] } : la forme qu'attend le composant.
  return {
    paquetage: agregerPaquetage(fs.readFileSync(csv, "utf8")),
    csvUrl: `/paquetages/${ref}.csv`,
    provenance: "masses pesées",
  };
}

/** Ce qui, dans un paquetage, est de la nourriture. */
const CATEGORIE_ALIMENTAIRE = /aliment|nutrition|nourriture|ravitaillement/i;

/**
 * Les calories d'un article, lues dans sa DESCRIPTION.
 *
 * LighterPack n'a pas de champ d'énergie — la description est le seul champ
 * libre qu'il exporte. Une description qui contient « 615 kcal » vaut donc
 * déclaration, et la valeur est comptée PAR UNITÉ, comme la masse : trois
 * gruaux à 615 kcal font 1 845 kcal.
 */
const KCAL = /([\d]+(?:[.,\s ][\d]+)*)\s*k?cal/i;

export function caloriesDe(description) {
  const trouve = KCAL.exec(description ?? "");
  if (!trouve) return null;
  const nombre = Number(trouve[1].replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(nombre) ? nombre : null;
}

/** « 1 845 kcal » — même espace fine que les masses. */
function calories(valeur) {
  return `${Math.round(valeur).toLocaleString("fr-FR")} kcal`;
}

/**
 * Le tableau de nutrition embarquée, tiré de la catégorie alimentaire d'un
 * paquetage. `null` si le CSV n'existe pas ou n'a pas de telle catégorie : la
 * section n'affichera alors que son texte.
 *
 * La colonne d'apport n'apparaît que si au moins un article annonce ses
 * calories : un paquetage qui ne les renseigne pas n'a pas de colonne vide.
 */
function nutritionDuPaquetage(ref) {
  const donnees = paquetage(ref);
  const categorie = donnees?.paquetage.categories.find((c) => CATEGORIE_ALIMENTAIRE.test(c.nom));
  if (!categorie) return null;

  const apports = categorie.articles.map((article) => {
    const parUnite = caloriesDe(article.description);
    return parUnite === null ? null : parUnite * article.quantite;
  });
  const avecApport = apports.some((apport) => apport !== null);
  const total = apports.reduce((somme, apport) => somme + (apport ?? 0), 0);

  return {
    colonnes: ["Aliment", "Qté", "Masse", ...(avecApport ? ["Apport"] : [])],
    lignes: [
      ...categorie.articles.map((article, rang) => [
        article.nom,
        String(article.quantite),
        grammes(article.masse),
        ...(avecApport ? [apports[rang] === null ? "" : calories(apports[rang])] : []),
      ]),
      [
        "Total emporté",
        "",
        grammes(categorie.masse),
        ...(avecApport ? [calories(total)] : []),
      ],
    ],
  };
}

/**
 * Tout ce que SectionsAventure ne sait pas rendre seul : les données de
 * paquetage, la nutrition embarquée, les billets des séances, les protocoles
 * rattachés, les corps des sections libres, la carte du récit.
 *
 * `cover`, `carte` et `graphe` sont des fabriques fournies par l'app : ce
 * module ne rend pas de JSX, il donne les chemins, les repères et la spec, la
 * page en fait une image, une carte et une figure.
 */
export function rendusDe(aventure, { libres = {}, cover, carte, graphe } = {}) {
  const sections = aventure.frontmatter.sections;
  const rendus = { libres };

  const jeux = {};
  for (const section of sections.filter((section) => section.type === "paquetage")) {
    const donnees = paquetage(section.ref);
    if (donnees) jeux[section.ref] = donnees;
  }
  if (Object.keys(jeux).length > 0) rendus.paquetages = jeux;

  // La nutrition embarquée est déjà pesée dans le paquetage : une section qui
  // déclare un `ref` la lit là plutôt que de la faire recopier.
  const tables = {};
  for (const section of sections.filter((s) => s.type === "nutrition" && s.ref)) {
    const table = nutritionDuPaquetage(section.ref);
    if (table) tables[section.ref] = table;
  }
  if (Object.keys(tables).length > 0) rendus.nutritions = tables;

  // La trace d'une section geo : la carte la lit dans public/tracks, où vivent
  // les GPX du site, et le bouton de téléchargement pointe au même endroit.
  const geo = sections.find((section) => section.type === "geo");
  if (geo?.gpx) {
    const gpxUrl = `/tracks/${geo.gpx}`;
    rendus.geo = {
      gpxUrl,
      carte: carte ? carte(gpxUrl, geo.reperes ?? []) : undefined,
    };
  }

  // Le direct d'une campagne se lit à partir du slug : une aventure dont le
  // direct a été archivé (public/replays/<slug>/aventure.json) renvoie vers sa
  // page d'archive, où vivent la progression, le carnet de bord et les médias.
  if (sections.some((section) => section.type === "direct")) {
    const slug = aventure.frontmatter.slug;
    if (fs.existsSync(path.join(REPLAYS, slug, "aventure.json"))) {
      rendus.direct = { archiveUrl: `/live/archives/${slug}` };
    }
  }

  const preparation = sections.find((section) => section.type === "preparation");
  if (preparation) {
    rendus.billets = billetsParSlug();
    if (preparation.graphe && graphe) {
      const spec = specDuGraphe(preparation.graphe);
      if (spec) rendus.graphe = graphe(spec);
    }
    if (preparation.protocoles?.length) {
      rendus.protocoles = preparation.protocoles.map((id) =>
        blocs.carte(id, aventure.chemin),
      );
    }
  }

  const recit = recitDe(aventure.frontmatter);
  if (recit) {
    const coverDuRecit = recit.frontmatter.cover;
    rendus.recit = {
      titre: recit.frontmatter.titre,
      url: urlDe(recit),
      chapeau: recit.frontmatter.chapeau,
      publieLe: `Publié le ${dateLisible(recit.frontmatter.date)}`,
      lecture: recit.frontmatter.lecture,
      cover:
        cover && coverDuRecit && coverDuRecit !== "TODO"
          ? cover(coverDuRecit, recit.frontmatter.titre)
          : undefined,
      action:
        aventure.frontmatter.etat === "termine" ? "Lire le récit" : "Suivre l'aventure",
    };
  }

  return rendus;
}

/** Les billets publiés, par slug — la dernière colonne des séances les résout. */
function billetsParSlug() {
  const billets = {};
  for (const page of parSorte("billet")) {
    billets[page.frontmatter.slug] = { titre: page.frontmatter.titre, url: urlDe(page) };
  }
  return billets;
}
