// lib/registre.mjs
//
// LA GRAMMAIRE DU REGISTRE : ce qui n'a pas de photo se montre en ligne.
//
// Concepts, protocoles, fiches et notes de carnet n'ont pas d'image, et c'est
// très bien — une ligne par entrée (icône, titre, « en bref », état, date)
// reste lisible à cinquante entrées, ne répète rien et ne laisse aucun
// rectangle vide. Ce module fabrique l'item d'une ligne à partir d'un atome ;
// components/Registre.jsx le dessine.

import {
  listEntries,
  routeFor,
  etatCleDe,
  ETAT_LABELS,
} from "./contentRoutes.mjs";
import { donneesDeFiche } from "./ficheDonnees.mjs";

/** Une table slug → atome, pour résoudre les concepts cités. */
export function indexParSlug(entries = listEntries()) {
  return new Map(entries.map((e) => [e.slug, e]));
}

/**
 * La clé d'icône d'un atome : sa branche, sinon celle du premier concept
 * qu'il cite, sinon sa sorte. C'est la branche — la famille de fluctuations —
 * qui se lit en un coup d'œil dans un registre, pas la sorte.
 */
export function iconeDe(entry, parSlug) {
  if (entry.branche) return entry.branche;
  for (const slug of entry.concepts ?? []) {
    const concept = parSlug?.get(slug);
    if (concept?.branche) return concept.branche;
  }
  return entry.kind;
}

function dateCourte(valeur) {
  if (!valeur) return null;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR");
}

/** La puce d'un atome : son état, ou la valeur d'une fiche. */
export function chipDe(entry) {
  const cle = etatCleDe(entry);
  if (cle) return { label: ETAT_LABELS[cle] ?? cle, ton: cle };

  if (entry.kind === "fiche") {
    const donnees = donneesDeFiche(entry);
    const valeur = donnees
      ? `${donnees.masse} · ${donnees.articles}`
      : entry.data.valeur;
    if (valeur) return { label: String(valeur), ton: "val" };
  }
  return null;
}

/** Une ligne de registre, sérialisable telle quelle vers un composant client. */
export function itemRegistre(entry, parSlug) {
  return {
    slug: entry.slug,
    href: routeFor(entry),
    kind: entry.kind,
    kindLabel: entry.label,
    title: entry.data.title ?? entry.slug,
    resume: entry.data.description ?? "",
    date: dateCourte(entry.data.date),
    chip: chipDe(entry),
    icone: iconeDe(entry, parSlug),
  };
}
