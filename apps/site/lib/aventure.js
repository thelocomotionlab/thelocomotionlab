// lib/aventure.js
//
// CE QUE LA PAGE AVENTURE A BESOIN DE RÉSOUDRE HORS DU FRONTMATTER.
//
// Les sections déclarent des références — un jeu de paquetage, des slugs de
// billets, des ids de protocoles ; le build a vérifié qu'elles existent, cette
// couche les transforme en ce que les composants savent afficher.

import fs from "node:fs";
import path from "node:path";

import { agregerPaquetage } from "@/lib/paquetage";
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

/** « Campagne 29/09 → 30/11/2025 ». Une campagne sans fin n'annonce qu'un départ. */
export function campagneLisible(campagne) {
  const debut = dateLisible(campagne.debut);
  if (!campagne.fin) return `Départ le ${debut}`;

  const [jourDebut, moisDebut, anneeDebut] = campagne.debut.split("-").reverse();
  const fin = dateLisible(campagne.fin);
  const memeAnnee = campagne.debut.slice(0, 4) === campagne.fin.slice(0, 4);
  const debutCourt = memeAnnee ? `${jourDebut}/${moisDebut}` : debut;
  return `Campagne ${debutCourt} → ${fin}`;
}

/**
 * Un chiffre du `resume` en valeur et libellé : « 9 800 m D+ » se lit « 9 800 »
 * sous « m D+ ». Une entrée qui ne commence pas par un nombre reste entière —
 * « sandales » n'a pas de valeur à détacher.
 */
export function chiffreDeCarte(texte) {
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

/**
 * Tout ce que SectionsAventure ne sait pas rendre seul : les données de
 * paquetage, les billets des séances, les protocoles rattachés, les corps des
 * sections libres, la carte du récit.
 *
 * `cover` et `carte` sont des fabriques fournies par l'app : ce module ne rend
 * pas de JSX, il donne les chemins, la page en fait une image et une carte.
 */
export function rendusDe(aventure, { libres = {}, cover, carte } = {}) {
  const sections = aventure.frontmatter.sections;
  const rendus = { libres };

  const jeux = {};
  for (const section of sections.filter((section) => section.type === "paquetage")) {
    const donnees = paquetage(section.ref);
    if (donnees) jeux[section.ref] = donnees;
  }
  if (Object.keys(jeux).length > 0) rendus.paquetages = jeux;

  // La trace d'une section geo : la carte la lit dans public/tracks, où vivent
  // les GPX du site, et le bouton de téléchargement pointe au même endroit.
  const geo = sections.find((section) => section.type === "geo");
  if (geo?.gpx) {
    const gpxUrl = `/tracks/${geo.gpx}`;
    rendus.geo = { gpxUrl, carte: carte ? carte(gpxUrl) : undefined };
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
        aventure.frontmatter.etat === "termine" ? "Lire le récit" : "Suivre la campagne",
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
