// lib/liensInternes.mjs
//
// LA RÈGLE QUI MANQUAIT : une ancre morte ne fait pas échouer un build, elle ne
// fait rien du tout. C'est ce qui rend une découpe dangereuse — on coupe un
// fichier, et trois liens pointent silencieusement dans le vide.
//
// Ce module vérifie, sur chaque atome PUBLIÉ :
//   • que toute ancre `](#x)` vise un titre du même fichier ;
//   • que tout lien `](/comprendre/x)` ou `](/explorer/x)` mène à un atome
//     publié, ou à un alias qui y mène.
//
// Ce qui est commenté en HTML ou dans un bloc de code est ignoré : c'est du
// brouillon, il n'est jamais rendu.

import { listEntries, routeFor, SLUG_ALIASES, PILIERS } from "./contentRoutes.mjs";

const COMMENTAIRES = /<!--[\s\S]*?-->/g;
const BLOCS_DE_CODE = /```[\s\S]*?```/g;
const TITRE = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const ANCRE = /\]\(#([^)\s]+)\)/g;
const LIEN_PILIER = /\]\((\/(?:comprendre|explorer)\/[^)#\s]+)/g;

/**
 * L'id que rehype-slug posera sur un titre. Même algorithme que
 * lib/extractToc.js, en lecture directe du markdown : les marqueurs d'emphase
 * tombent d'eux-mêmes, puisque seuls lettres, chiffres, espaces et tirets
 * survivent.
 */
function baseSlug(texte) {
  return String(texte)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Tous les ids de titres d'un markdown, doublons numérotés comme au rendu. */
export function idsDeTitres(markdown = "") {
  const vus = new Map();
  const ids = new Set();

  for (const [, , texte] of markdown.matchAll(TITRE)) {
    const base = baseSlug(texte);
    if (!base) continue;
    const n = vus.get(base) ?? 0;
    vus.set(base, n + 1);
    ids.add(n === 0 ? base : `${base}-${n}`);
  }
  return ids;
}

function nettoyer(markdown = "") {
  return markdown.replace(COMMENTAIRES, " ").replace(BLOCS_DE_CODE, " ");
}

export function assertLiensInternes({
  entries = listEntries(),
  aliases = SLUG_ALIASES,
} = {}) {
  const publies = entries.filter((e) => e.published);
  const routes = new Set(publies.map(routeFor));

  // Un lien vers une ancienne adresse reste valide : le 308 le rattrape.
  const redirigees = new Set(
    Object.keys(aliases).flatMap((ancien) =>
      Object.values(PILIERS).map((p) => `${p}/${ancien}`)
    )
  );

  const erreurs = [];

  for (const entry of publies) {
    const texte = nettoyer(entry.content);
    const ids = idsDeTitres(texte);
    // `sommaire` n'est pas un titre : c'est l'id du bloc de plan que
    // ProjetBody pose en tête des sortes longues.
    ids.add("sommaire");

    for (const [, brute] of texte.matchAll(ANCRE)) {
      let ancre = brute;
      try {
        ancre = decodeURIComponent(brute);
      } catch {
        // Une ancre mal encodée reste comparée telle quelle.
      }
      if (!ids.has(ancre)) {
        erreurs.push(
          `${entry.file} : l'ancre « #${ancre} » ne vise aucun titre de ce ` +
            `fichier. Le titre a-t-il été déplacé dans un autre atome ?`
        );
      }
    }

    for (const [, route] of texte.matchAll(LIEN_PILIER)) {
      if (!routes.has(route) && !redirigees.has(route)) {
        erreurs.push(
          `${entry.file} : le lien « ${route} » ne mène à aucun atome publié ` +
            `ni à un alias connu.`
        );
      }
    }
  }

  if (erreurs.length) {
    throw new Error(
      "Liens internes cassés (docs/systeme-de-contenu.md §6) :\n" +
        erreurs.map((e) => `  • ${e}`).join("\n")
    );
  }
}
