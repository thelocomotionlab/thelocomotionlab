// lib/getRecentActivity.js
//
// Les feeds « ce qui bouge » : accueil, carrousel, contenus liés.
//
// La clé de tri est la DATE D'ACTIVITÉ d'un atome. Pour les quatre sortes
// fermées, c'est la date de publication du frontmatter. Pour un carnet, qui
// n'a pas de fin, c'est la date de sa note la plus récente : un carnet remonte
// quand on y écrit, sans qu'aucun champ ne soit à tenir à la main.

import {
  listEntries,
  listByPilier,
  routeFor,
  etatDe,
} from "./contentRoutes.mjs";
import { derniereNote } from "./extractCarnetNotes";

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** La date d'activité d'un atome : ses notes s'il en a, sa date sinon. */
export function dateActivite(entry) {
  const publiee = safeDate(entry.data.date);
  if (entry.kind !== "carnet") return publiee;
  return derniereNote(entry.slug) ?? publiee;
}

/** La forme commune consommée par les cartes et les carrousels. */
export function shapeEntry(entry) {
  return {
    kind: entry.kind,
    kindLabel: entry.label,
    pilier: entry.pilier,
    slug: entry.slug,
    href: routeFor(entry),
    title: entry.data.title ?? entry.slug,
    description: entry.data.description ?? "",
    cover: entry.data.cover ?? "",
    etat: etatDe(entry),
    branche: entry.branche,
    date: safeDate(entry.data.date),
    activite: dateActivite(entry),
  };
}

function parActiviteDesc(a, b) {
  const ad = a.activite?.getTime() ?? 0;
  const bd = b.activite?.getTime() ?? 0;
  if (bd !== ad) return bd - ad;
  // Départage stable : la date de publication, puis le slug.
  const ap = a.date?.getTime() ?? 0;
  const bp = b.date?.getTime() ?? 0;
  if (bp !== ap) return bp - ap;
  return a.slug.localeCompare(b.slug);
}

function publies(entries) {
  return entries.filter((e) => e.published).map(shapeEntry).sort(parActiviteDesc);
}

/** Tous les atomes publiés, du plus actif au plus ancien. */
export function getRecentAll({ limit = Number.POSITIVE_INFINITY } = {}) {
  return publies(listEntries()).slice(0, limit);
}

/** Les atomes publiés d'un pilier. */
export function getRecentByPilier(pilier, { limit = Number.POSITIVE_INFINITY } = {}) {
  return publies(listByPilier(pilier)).slice(0, limit);
}

/** Le feed « terrain » : les quatre sortes d'Explorer, fiches comprises. */
export function getRecentExplorer({ limit = 3 } = {}) {
  return getRecentByPilier("explorer", { limit });
}

/** Le feed « savoir » : les concepts. */
export function getRecentComprendre({ limit = 3 } = {}) {
  return getRecentByPilier("comprendre", { limit });
}
