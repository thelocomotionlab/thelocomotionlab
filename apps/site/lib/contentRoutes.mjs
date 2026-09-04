// lib/contentRoutes.mjs
//
// SOURCE UNIQUE du modèle de contenu : cinq sortes, une par dossier de
// `content/`. Mode d'emploi complet : docs/systeme-de-contenu.md.
//
//   - KINDS : la table sorte → dossier → pilier → corps de rendu ;
//   - les champs de relation (parent, concepts, fiches, lie), normalisés une
//     fois pour toutes à la lecture ;
//   - routeFor() : l'URL d'un atome, dérivée de son pilier ;
//   - assertContentRules() : les règles vérifiées AU BUILD. Elles font échouer
//     la compilation en NOMMANT le fichier fautif — c'est la contrepartie de la
//     seule fragilité du modèle, la décision de rangement au moment d'écrire ;
//   - SLUG_ALIASES : les adresses d'avant, redirigées en 308.
//
// La sorte vient du DOSSIER, jamais d'un champ de frontmatter : un fichier mal
// rangé se voit à l'œil nu, et il n'existe aucun état où le dossier et le champ
// se contredisent.
//
// Format .mjs : ce module est importé à la fois par le code applicatif (pages,
// émetteurs d'URL) et par next.config.mjs (redirections 308), qui est chargé
// par Node en dehors de webpack.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/** LA table. Une sorte = un dossier = un pilier = une question de lecteur. */
export const KINDS = {
  // Comprendre — « pourquoi ça marche ? »
  concept: {
    dir: "concepts",
    pilier: "comprendre",
    label: "Concept",
    corps: "article",
  },
  // Explorer — le terrain, sous quatre formes.
  expedition: {
    dir: "expeditions",
    pilier: "explorer",
    label: "Expédition",
    corps: "projet",
  },
  protocole: {
    dir: "protocoles",
    pilier: "explorer",
    label: "Protocole",
    corps: "projet",
  },
  carnet: {
    dir: "carnets",
    pilier: "explorer",
    label: "Carnet",
    corps: "projet",
  },
  fiche: {
    dir: "fiches",
    pilier: "explorer",
    label: "Fiche",
    corps: "projet",
  },
};

/** Les deux piliers éditoriaux, et leur préfixe d'URL. */
export const PILIERS = { comprendre: "/comprendre", explorer: "/explorer" };

/** L'ordre des sections de l'index d'Explorer. */
export const ORDRE_EXPLORER = ["expedition", "protocole", "carnet", "fiche"];

/**
 * L'état d'un atome : un champ et un vocabulaire par sorte concernée. Il rend
 * publiable ce qui n'est pas fini, parce qu'il annonce ce que c'est.
 */
export const ETATS = {
  concept: { champ: "maturite", valeurs: ["graine", "pousse", "etabli"] },
  protocole: { champ: "statut", valeurs: ["en-test", "eprouve", "abandonne"] },
};

export const ETAT_LABELS = {
  graine: "Graine",
  pousse: "Pousse",
  etabli: "Établi",
  "en-test": "En test",
  eprouve: "Éprouvé",
  abandonne: "Abandonné",
};

/**
 * Les branches de la carte de Comprendre — des familles de fluctuations
 * auxquelles le corps est exposé. Une branche ne s'AFFICHE qu'à partir de deux
 * concepts publiés qui la portent (cf. app/comprendre/page.jsx) : cette table
 * dit ce qui est nommable, pas ce qui est montré.
 */
export const BRANCHES = {
  energie: "Énergie",
  thermique: "Thermique",
  "charge-et-tissus": "Charge et tissus",
  respiration: "Respiration",
  esprit: "Esprit",
  instruments: "Instruments",
};

/**
 * Le slug de la page-pilier de Comprendre : le concept de plus haut niveau,
 * celui dont tous les autres sont des briques. Il ouvre l'index, seul, avant
 * la liste et les branches. Tant qu'il n'existe pas, l'index commence par la
 * liste — aucun encadré ne vient dire qu'il manque.
 */
export const PAGE_PILIER = "robustesse-physiologique";

/**
 * Le nombre de concepts publiés à partir duquel une branche s'affiche. En
 * dessous, elle n'apparaît nulle part : ni titre, ni encadré, ni mot en gris.
 * Une branche naît de la liste quand la liste la demande.
 */
export const SEUIL_BRANCHE = 2;

/** Les champs de relation, et la sorte que chacun doit désigner. */
const RELATIONS = {
  concepts: "concept",
  fiches: "fiche",
  lie: "concept",
};

/** Les sortes qu'un `parent:` de fiche peut désigner. */
const PARENTS_POSSIBLES = ["expedition", "protocole"];

/**
 * Les adresses d'avant, `ancien slug → slug actuel`.
 *
 * Deux cas, une seule table :
 *   • un RENOMMAGE — l'ancien slug n'existe plus (« saison-trail-2026 ») ;
 *   • un CHANGEMENT DE PILIER à slug constant, écrit `x: x` — l'atome existe
 *     toujours, mais son ancienne URL était sous l'autre pilier.
 *
 * Chaque entrée produit un 308 depuis les deux piliers et les deux anciens
 * rayons, moins sa propre destination (cf. lib/legacyRedirects.mjs).
 * Cette table est destinée à grossir : toute PR qui renomme ou scinde un atome
 * y inscrit l'ancien slug.
 */
export const SLUG_ALIASES = {
  // Le journal de bord est un carnet, pas un projet : il n'a pas de fin.
  "saison-trail-2026": "carnet-2026",
  // Les notes de préparation de la Réunion sont le carnet 2025 ; le récit,
  // lui, est devenu l'expédition « reunion-2025 ».
  "traversee-reunion": "carnet-2025",
  "recit-reunion-2025": "reunion-2025",
  "mon-tour-des-ecrins-en-80-heures": "tour-des-ecrins",
  "initiation-exposition-au-froid": "froid-stresseur",
  // La genèse garde son slug et change de pilier : c'est un concept.
  "la-genese": "la-genese",
};

const CONTENT_ROOT = () => path.join(process.cwd(), "content");

function normaliserListe(valeur) {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter((v) => typeof v === "string" && v);
}

function normaliserTexte(valeur) {
  return typeof valeur === "string" && valeur ? valeur : null;
}

function readKind(kind) {
  const { dir, pilier, label, corps } = KINDS[kind];
  const dirPath = path.join(CONTENT_ROOT(), dir);
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath)
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const filePath = path.join(dirPath, fn);
      const { data, content } = matter(fs.readFileSync(filePath, "utf8"));

      return {
        slug: fn.replace(/\.md$/, ""),
        kind,
        pilier,
        label,
        corps,
        file: path.posix.join("content", dir, fn),
        filePath,
        data,
        content,
        published: data.published !== false && data.draft !== true,
        // Les relations et les états, normalisés une fois pour toutes.
        parent: normaliserTexte(data.parent),
        concepts: normaliserListe(data.concepts),
        fiches: normaliserListe(data.fiches),
        lie: normaliserListe(data.lie),
        maturite: normaliserTexte(data.maturite),
        statut: normaliserTexte(data.statut),
        branche: normaliserTexte(data.branche),
        archive: normaliserTexte(data.archive),
        origine: normaliserTexte(data.origine),
      };
    });
}

/** Tous les atomes des cinq dossiers, brouillons compris. */
export function listEntries() {
  return Object.keys(KINDS).flatMap(readKind);
}

/** Les atomes d'une ou plusieurs sortes. */
export function listByKind(...kinds) {
  const voulues = new Set(kinds);
  return listEntries().filter((e) => voulues.has(e.kind));
}

/** Les atomes d'un pilier (« comprendre » | « explorer »). */
export function listByPilier(pilier) {
  return listEntries().filter((e) => e.pilier === pilier);
}

/** L'URL d'un atome : son pilier, puis son slug. Aucune sous-route. */
export function routeFor(entry) {
  return `${PILIERS[entry.pilier]}/${entry.slug}`;
}

/** La valeur brute de l'état d'un atome (« graine », « eprouve »…), ou null. */
export function etatCleDe(entry) {
  const etat = ETATS[entry.kind];
  if (!etat) return null;
  return entry[etat.champ] ?? null;
}

/** L'état affichable d'un atome (« Graine », « Éprouvé »…), ou null. */
export function etatDe(entry) {
  const cle = etatCleDe(entry);
  return cle ? ETAT_LABELS[cle] ?? null : null;
}

/**
 * LES RÈGLES DE BUILD.
 *
 * Elles accumulent leurs erreurs au lieu de s'arrêter à la première, et
 * nomment le fichier fautif. Les deux paramètres n'existent que pour les
 * tests : le build appelle assertContentRules() sans argument, et vérifie donc
 * le contenu réel du site contre la vraie table d'alias.
 */
export function assertContentRules({
  entries = listEntries(),
  aliases = SLUG_ALIASES,
} = {}) {
  const erreurs = [];

  // 1. Unicité GLOBALE des slugs. `parent:`, `concepts:`, `fiches:` et `lie:`
  //    désignent un atome par son slug nu : deux homonymes rendraient la
  //    référence ambiguë, même dans deux piliers différents.
  const parSlug = new Map();
  for (const entry of entries) {
    const autre = parSlug.get(entry.slug);
    if (autre) {
      erreurs.push(
        `Collision de slugs « ${entry.slug} » : « ${autre.file} » et ` +
          `« ${entry.file} » produisent la même identité. Renomme l'un des deux.`
      );
    } else {
      parSlug.set(entry.slug, entry);
    }
  }

  for (const entry of entries) {
    // 2. `parent` : obligatoire pour une fiche (c'est une annexe, elle
    //    n'existe jamais seule), et toujours résolvable.
    if (entry.kind === "fiche" && !entry.parent) {
      erreurs.push(
        `${entry.file} : une fiche doit déclarer « parent: » — l'expédition ou ` +
          `le protocole depuis lequel on la consulte.`
      );
    }
    if (entry.parent) {
      const cible = parSlug.get(entry.parent);
      if (!cible || !PARENTS_POSSIBLES.includes(cible.kind)) {
        erreurs.push(
          `${entry.file} : « parent: ${entry.parent} » ne désigne aucune ` +
            `expédition ni aucun protocole de content/.`
        );
      }
    }

    // 3. Les relations résolvent, chacune vers la sorte qu'elle promet — et
    //    un atome PUBLIÉ ne cite jamais un brouillon : ces relations
    //    engendrent des liens visibles, qui mèneraient à un 404.
    //    `parent:` échappe à la règle : une fiche peut vivre avant que
    //    l'expédition qui la porte soit publiée, son lien de retour est
    //    conditionnel.
    for (const [champ, sorteAttendue] of Object.entries(RELATIONS)) {
      for (const slug of entry[champ]) {
        const cible = parSlug.get(slug);
        if (!cible || cible.kind !== sorteAttendue) {
          erreurs.push(
            `${entry.file} : « ${champ}: [… ${slug} …] » ne désigne aucun ` +
              `atome de sorte « ${sorteAttendue} » dans content/.`
          );
        } else if (entry.published && !cible.published) {
          erreurs.push(
            `${entry.file} : « ${champ}: [… ${slug} …] » désigne un brouillon ` +
              `(${cible.file}). Un atome publié ne peut pas citer ce qui n'est ` +
              `pas publié.`
          );
        }
      }
    }

    // 4. L'état : le vocabulaire dépend de la sorte, et un atome PUBLIÉ le
    //    porte toujours — c'est ce que sa carte et sa page annoncent.
    const etat = ETATS[entry.kind];
    if (etat) {
      const valeur = entry[etat.champ];
      if (valeur && !etat.valeurs.includes(valeur)) {
        erreurs.push(
          `${entry.file} : « ${etat.champ}: » doit valoir ` +
            `${etat.valeurs.join(" | ")} — reçu « ${valeur} ».`
        );
      } else if (!valeur && entry.published) {
        erreurs.push(
          `${entry.file} : un atome publié doit porter « ${etat.champ}: » ` +
            `(${etat.valeurs.join(" | ")}).`
        );
      }
    }

    // 5. `branche` : facultative, mais jamais inventée.
    if (entry.branche && !Object.hasOwn(BRANCHES, entry.branche)) {
      erreurs.push(
        `${entry.file} : « branche: ${entry.branche} » n'est pas une branche ` +
          `connue (${Object.keys(BRANCHES).join(", ")}).`
      );
    }
  }

  // 6. Les alias mènent quelque part, et ne masquent jamais un atome vivant —
  //    sauf le cas du changement de pilier, écrit « x: x ».
  for (const [ancien, actuel] of Object.entries(aliases)) {
    if (!parSlug.has(actuel)) {
      erreurs.push(
        `SLUG_ALIASES : « ${ancien} » pointe vers « ${actuel} », qui n'existe ` +
          `pas dans content/.`
      );
    }
    if (ancien !== actuel && parSlug.has(ancien)) {
      erreurs.push(
        `SLUG_ALIASES : « ${ancien} » est redirigé alors qu'un atome porte ce ` +
          `slug (${parSlug.get(ancien).file}). Retire l'alias ou renomme l'atome.`
      );
    }
  }

  if (erreurs.length) {
    throw new Error(
      "Règles de contenu non respectées (docs/systeme-de-contenu.md §6) :\n" +
        erreurs.map((e) => `  • ${e}`).join("\n")
    );
  }
}

/** Un atome publié du pilier Comprendre, ou null. */
export function findComprendreEntry(slug) {
  return (
    listByPilier("comprendre").find((e) => e.slug === slug && e.published) ??
    null
  );
}

/** Un atome publié du pilier Explorer, ou null. */
export function findExplorerEntry(slug) {
  return (
    listByPilier("explorer").find((e) => e.slug === slug && e.published) ?? null
  );
}
