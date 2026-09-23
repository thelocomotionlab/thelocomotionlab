// lib/twinTableauDeBord.mjs
//
// CE QUE LA FILE DIT, en mots et en couleurs.
//
// Le moteur rend des états : `recu`, `ingere`, `composer`, `a_publier_ou_envoyer`…
// Ce module les traduit une fois pour toutes — un libellé, un ton de pastille, un
// rang dans les sept pas. Les écrans n'ont alors plus qu'à afficher.
//
// Trois tons seulement, ceux de la charte : l'ocre de ce qui s'annonce, le bleu-vert
// de ce qui se déroule, la terracotta de ce qui est derrière nous.

/** Le verbe suivant, tel qu'il s'écrit sur le bouton de la dernière colonne. */
export const VERBES = {
  ingerer: "Ingérer",
  composer: "Composer",
  publier: "Publier",
  envoyer: "Envoyer",
  saisir_resultat: "Saisir le résultat",
  rien: "",
};

/** Les compteurs, dans l'ordre où l'écran les pose. `en_attente` ne s'affiche pas :
 *  ce sont les dossiers qui n'attendent aucun geste. */
export const COMPTEURS = [
  ["a_ingerer", "À ingérer"],
  ["a_composer", "À composer"],
  ["a_publier_ou_envoyer", "À publier ou envoyer"],
  ["resultat_a_saisir", "Résultat à saisir"],
];

/** Le statut en sept pas. La barre de la File en montre l'avancée. */
export const PAS = [
  "reçu",
  "ingéré",
  "niveau",
  "plan généré",
  "publié",
  "envoyé",
  "résultat saisi",
];

const INGESTION = {
  recu: { mot: "Archive reçue", ton: "annonce" },
  en_cours: { mot: "Ingestion en cours", ton: "deroule" },
  ingere: { mot: "Ingérée", ton: "derriere" },
  illisible: { mot: "Archive illisible", ton: "derriere" },
};

const PLAN = {
  a_composer: { mot: "à composer", ton: "annonce" },
  genere: { mot: "plan généré", ton: "annonce" },
  publie: { mot: "publié", ton: "deroule" },
  envoye: { mot: "envoyé", ton: "deroule" },
  fige: { mot: "figé", ton: "derriere" },
  resultat: { mot: "résultat saisi", ton: "derriere" },
};

/** Les deux mots du niveau servi. */
export const NIVEAUX = { base: "Plan de base", calibre: "Plan calibré" };

/**
 * Le statut d'un dossier, en un mot et un ton. Tant que l'archive n'est pas lue,
 * c'est l'ingestion qui parle ; après, c'est le plan.
 */
export function statutDuDossier(dossier) {
  if (dossier.ingestion !== "ingere") {
    return INGESTION[dossier.ingestion] ?? { mot: "—", ton: "annonce" };
  }
  if (!dossier.plan_statut) return { mot: "à composer", ton: "annonce" };
  return PLAN[dossier.plan_statut] ?? { mot: dossier.plan_statut, ton: "annonce" };
}

// Où en est un dossier dans les sept pas, une fois l'archive lue. « niveau » (le 3ᵉ)
// est posé par l'ingestion elle-même : un athlète ingéré l'a forcément.
const APRES_INGESTION = { a_composer: 3, genere: 4, publie: 5, envoye: 6, fige: 6, resultat: 7 };

/**
 * Combien des sept pas sont franchis. Tant que l'archive n'est pas lue, un seul :
 * elle est reçue. Une archive illisible reste donc à un et n'avance plus — c'est ce
 * qui la rend visible dans une liste.
 */
export function pasFranchis(dossier) {
  if (dossier.ingestion !== "ingere") return 1;
  return dossier.plan_statut ? (APRES_INGESTION[dossier.plan_statut] ?? 3) : 3;
}

/**
 * L'instant d'une date ISO, RAMENÉ DANS SON PROPRE FUSEAU.
 *
 * Un départ de course est une heure locale : « 13h00 » à Nice reste 13h00 qu'on le
 * lise depuis Nice, depuis un serveur en UTC ou depuis un avion. La chaîne porte son
 * décalage (« +02:00 ») ; on l'applique et on formate ensuite en UTC, plutôt que de
 * laisser le navigateur poser le sien — sinon la même course affiche deux heures
 * différentes selon qui regarde, et c'est l'heure du départ.
 */
function dansSonFuseau(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const decalage = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  if (!decalage) return d; // pas de fuseau écrit (« Z » ou date nue) : rien à décaler
  const minutes =
    (decalage[1] === "-" ? -1 : 1) * (Number(decalage[2]) * 60 + Number(decalage[3]));
  return new Date(d.getTime() + minutes * 60_000);
}

const EN_UTC = { timeZone: "UTC" };

/** Une date ISO en date française courte : « ven. 25 sept. 2026 · 13h00 ». */
export function departLisible(iso) {
  if (!iso) return "";
  const d = dansSonFuseau(iso);
  if (d === null) return "";
  const jour = d.toLocaleDateString("fr-FR", {
    ...EN_UTC,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const heure = d.toLocaleTimeString("fr-FR", {
    ...EN_UTC,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${jour} · ${heure.replace(":", "h")}`;
}

/** Une date ISO en jour français : « 13/09/2026 ». */
export function jourLisible(iso) {
  const d = iso ? dansSonFuseau(iso) : null;
  return d === null ? "" : d.toLocaleDateString("fr-FR", EN_UTC);
}

/** Des octets en taille lisible. 0 rend une chaîne vide : une archive de 0 octet
 *  n'existe pas, c'est une valeur absente. */
export function tailleLisible(octets) {
  if (!octets) return "";
  const unites = ["o", "Ko", "Mo", "Go"];
  let valeur = Number(octets);
  let rang = 0;
  while (valeur >= 1024 && rang < unites.length - 1) {
    valeur /= 1024;
    rang += 1;
  }
  // Une décimale sous 10, aucune au-dessus — et aucune non plus sur un compte rond :
  // « 1,0 Ko » fait croire à une mesure fine là où il n'y a qu'un nombre entier.
  const fin = valeur >= 10 || rang === 0 || Number.isInteger(valeur) ? 0 : 1;
  return `${valeur.toFixed(fin).replace(".", ",")} ${unites[rang]}`;
}

const FORMATS = new Map();

function formatA(decimales) {
  if (!FORMATS.has(decimales)) {
    FORMATS.set(
      decimales,
      new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }),
    );
  }
  return FORMATS.get(decimales);
}

/** Un nombre à la française — virgule décimale, milliers séparés par une espace fine —,
 * ou un tiret quand la donnée manque. */
export function nombre(valeur, decimales = 0, unite = "") {
  if (valeur === null || valeur === undefined || Number.isNaN(Number(valeur))) return "—";
  const texte = formatA(decimales).format(Number(valeur));
  return unite ? `${texte} ${unite}` : texte;
}

/** Des heures décimales en « 21 h 15 ». */
export function duree(heures) {
  if (heures === null || heures === undefined) return "—";
  const h = Math.floor(heures);
  const m = Math.round((heures - h) * 60);
  return m === 60 ? `${h + 1} h 00` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Le statut d'un plan seul, en un mot et un ton (écran Plan, Registre, fiche). */
export function statutDuPlan(statut) {
  return PLAN[statut] ?? { mot: statut || "—", ton: "annonce" };
}

/**
 * Une durée saisie par un humain, en heures décimales — ou `null` si elle ne se lit pas.
 *
 * Accepte ce qu'on recopie d'un classement : « 34h12 », « 34 h 12 », « 34:12 »,
 * « 34:12:05 », « 34h », ou un nombre d'heures (« 34,5 »). Une saisie illisible rend
 * `null` plutôt qu'un zéro : un temps de course inventé fausserait le registre.
 */
export function lireUneDuree(texte) {
  const s = String(texte ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const horloge = /^(\d{1,3})[h:](\d{1,2})?(?::(\d{1,2}))?(?:min|m)?$/.exec(s);
  if (horloge) {
    const [, h, m = "0", sec = "0"] = horloge;
    if (Number(m) >= 60 || Number(sec) >= 60) return null;
    const heures = Number(h) + Number(m) / 60 + Number(sec) / 3600;
    return heures > 0 ? heures : null;
  }
  const decimal = /^(\d+(?:[.,]\d+)?)$/.exec(s);
  if (decimal) {
    const heures = Number(decimal[1].replace(",", "."));
    return heures > 0 ? heures : null;
  }
  return null;
}

/** Un instant ISO en heure de passage : « sam. 22h37 », dans le fuseau de la course. */
export function heureDePassage(iso) {
  const d = iso ? dansSonFuseau(iso) : null;
  if (d === null) return "";
  const jour = d.toLocaleDateString("fr-FR", { ...EN_UTC, weekday: "short" });
  const heure = d.toLocaleTimeString("fr-FR", { ...EN_UTC, hour: "2-digit", minute: "2-digit" });
  return `${jour} ${heure.replace(":", "h")}`;
}

/** Un nombre signé à la française : « +2,4 », « −1,0 ». */
export function signe(valeur, decimales = 1) {
  if (valeur === null || valeur === undefined || Number.isNaN(Number(valeur))) return "—";
  const texte = Math.abs(Number(valeur)).toFixed(decimales).replace(".", ",");
  return `${Number(valeur) < 0 ? "−" : "+"}${texte}`;
}

/** La valeur de `liste` la plus proche de `valeur` — l'aimant des bornes de phase. */
export function lePlusProche(valeur, liste) {
  let meilleur = null;
  for (const candidat of liste) {
    if (meilleur === null || Math.abs(candidat - valeur) < Math.abs(meilleur - valeur)) {
      meilleur = candidat;
    }
  }
  return meilleur;
}

/**
 * L'échelle d'un profil altimétrique : les deux fonctions qui placent un kilomètre et une
 * altitude dans un cadre `largeur × hauteur`, et les deux chemins SVG du profil (le trait
 * et l'aire sous lui). `profil` est la liste de couples [km, altitude] que le moteur rend.
 *
 * L'altitude part du minimum arrondi à la centaine sous lui : un parcours qui ne descend
 * jamais sous 500 m ne gaspille pas le tiers bas du cadre.
 */
export function echelleDuProfil(profil, { largeur = 1000, hauteur = 300, marge = 8 } = {}) {
  const points = (profil ?? []).filter((p) => Array.isArray(p) && p.length >= 2);
  const kmMax = points.length ? Math.max(...points.map((p) => p[0])) : 1;
  const altitudes = points.map((p) => p[1]);
  const altMin = altitudes.length ? Math.floor(Math.min(...altitudes) / 100) * 100 : 0;
  const altMax = altitudes.length ? Math.ceil(Math.max(...altitudes) / 100) * 100 : 1;
  const x = (km) => (Math.max(0, Math.min(km, kmMax)) / (kmMax || 1)) * largeur;
  const y = (alt) =>
    marge + (1 - (alt - altMin) / (altMax - altMin || 1)) * (hauteur - 2 * marge);
  const ligne = points
    .map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`)
    .join(" ");
  const aire = points.length
    ? `${ligne} L${x(points[points.length - 1][0]).toFixed(1)} ${hauteur} L${x(points[0][0]).toFixed(1)} ${hauteur} Z`
    : "";
  /** L'altitude du profil à un kilomètre donné, par interpolation. */
  const altitudeA = (km) => {
    if (!points.length) return altMin;
    for (let i = 1; i < points.length; i += 1) {
      if (points[i][0] >= km) {
        const [k0, a0] = points[i - 1];
        const [k1, a1] = points[i];
        return k1 === k0 ? a1 : a0 + ((a1 - a0) * (km - k0)) / (k1 - k0);
      }
    }
    return points[points.length - 1][1];
  };
  return { x, y, ligne, aire, kmMax, altMin, altMax, altitudeA, largeur, hauteur };
}

// Les messages des navigateurs et de webpack quand un morceau de JavaScript manque.
const VERSION_REMPLACEE =
  /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i;

/** L'erreur d'une page ouverte avant un redéploiement : elle réclame des fichiers de
 *  l'ancienne version, que le nouveau déploiement ne sert plus. */
export function versionRemplacee(erreur) {
  return VERSION_REMPLACEE.test(`${erreur?.name ?? ""} ${erreur?.message ?? ""}`);
}

/**
 * Les lignes « Sur ce segment » du tableau de marche, telles que l'écran les tient :
 * {numéro de ligne: texte}. Une ligne se désigne par le ravitaillement qui la ferme.
 */
export function lignesDeLEcran(consignes) {
  return Object.fromEntries((consignes ?? []).map((c) => [c.index, c.texte]));
}

/** Et ce qui part au moteur : les seules lignes écrites, chacune sur une ligne. */
export function lignesPourLeMoteur(lignes) {
  return Object.entries(lignes ?? {})
    .map(([index, texte]) => ({ index: Number(index), texte: String(texte ?? "").replace(/\s+/g, " ").trim() }))
    .filter((c) => c.texte)
    .sort((a, b) => a.index - b.index);
}

/**
 * Les caractères qu'une ligne de la feuille imprime à pleine taille, mesurés sur la feuille
 * compilée : au-delà, le texte rétrécit pour tenir sur la ligne. La colonne perd de la place
 * quand les colonnes eau et ravito s'impriment, c'est-à-dire quand les deux débits sont déclarés.
 */
export function longueurQuiTient(nutritionDeclaree) {
  return nutritionDeclaree ? 25 : 40;
}
