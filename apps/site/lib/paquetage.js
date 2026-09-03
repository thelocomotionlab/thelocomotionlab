// lib/paquetage.js
//
// LE PAQUETAGE D'UNE AVENTURE, lu depuis l'export CSV de LighterPack.
//
// Valentin tient ses inventaires sur LighterPack et en exporte un .csv ; ce
// fichier est LA source, déposé tel quel dans public/paquetages/. Rien n'est
// ressaisi : ce module le lit, convertit les masses en grammes et agrège par
// catégorie. Tout est pur — pas d'accès disque ici, le composant s'en charge.
//
// Colonnes de l'export (en-tête LighterPack, en anglais) :
//   Item Name, Category, desc, qty, weight, unit, url, price, worn, consumable
// On ignore price (le site n'affiche pas de prix), worn et consumable.

/** Masse en grammes pour une unité LighterPack. Inconnue → grammes. */
const GRAMMES_PAR_UNITE = {
  gram: 1,
  g: 1,
  kilogram: 1000,
  kg: 1000,
  ounce: 28.349523125,
  oz: 28.349523125,
  pound: 453.59237,
  lb: 453.59237,
};

/**
 * Parseur CSV minimal mais correct sur ce que LighterPack produit : champs
 * entre guillemets (avec virgules et guillemets doublés dedans), fins de
 * ligne CRLF ou LF, ligne vide finale. Renvoie des tableaux de chaînes.
 */
export function parseCsv(texte) {
  const lignes = [];
  let ligne = [];
  let champ = "";
  let entreGuillemets = false;

  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];

    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else {
          entreGuillemets = false;
        }
      } else {
        champ += c;
      }
      continue;
    }

    if (c === '"') entreGuillemets = true;
    else if (c === ",") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i += 1;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  if (champ !== "" || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }

  // Une ligne vide (export terminé par un retour) n'est pas un article.
  return lignes.filter((l) => l.some((v) => v.trim() !== ""));
}

/** Les lignes d'un CSV avec en-tête, en objets clé → valeur. */
export function lireCsv(texte) {
  const [entete, ...corps] = parseCsv(texte);
  if (!entete) return [];
  const cles = entete.map((k) => k.trim());
  return corps.map((valeurs) =>
    Object.fromEntries(cles.map((k, i) => [k, (valeurs[i] ?? "").trim()])),
  );
}

function nombre(v, defaut = 0) {
  const brut = String(v ?? "").trim();
  if (brut === "") return defaut;
  const n = Number(brut.replace(",", "."));
  return Number.isFinite(n) ? n : defaut;
}

/**
 * Le paquetage agrégé : catégories triées de la plus lourde à la plus légère,
 * articles idem, masses en grammes.
 *
 *   {
 *     total: 10121,                       // grammes, au départ
 *     nombreArticles: 47,
 *     categories: [{ nom, articles: [{ nom, quantite, masseUnitaire, masse, url, description }], masse }],
 *   }
 */
export function agregerPaquetage(texteCsv) {
  const lignes = lireCsv(texteCsv);
  const parCategorie = new Map();

  for (const l of lignes) {
    const nom = (l["Item Name"] ?? l.name ?? "").trim();
    if (!nom) continue;

    const quantite = Math.max(0, nombre(l.qty, 1));
    const facteur = GRAMMES_PAR_UNITE[(l.unit ?? "gram").trim().toLowerCase()] ?? 1;
    const masseUnitaire = nombre(l.weight) * facteur;
    const categorie = (l.Category ?? "").trim() || "Sans catégorie";

    if (!parCategorie.has(categorie)) parCategorie.set(categorie, []);
    parCategorie.get(categorie).push({
      nom,
      quantite,
      masseUnitaire,
      masse: quantite * masseUnitaire,
      url: (l.url ?? "").trim() || null,
      description: (l.desc ?? "").trim() || null,
    });
  }

  const categories = [...parCategorie.entries()]
    .map(([nom, articles]) => ({
      nom,
      articles: [...articles].sort((a, b) => b.masse - a.masse),
      masse: articles.reduce((s, a) => s + a.masse, 0),
    }))
    .sort((a, b) => b.masse - a.masse);

  return {
    total: categories.reduce((s, c) => s + c.masse, 0),
    nombreArticles: categories.reduce((s, c) => s + c.articles.length, 0),
    categories,
  };
}

/** « 3 230 g » — espace fine insécable, comme partout sur le site. */
export function grammes(g) {
  return `${Math.round(g).toLocaleString("fr-FR")} g`;
}

/** « 10,1 kg » — une décimale, virgule française. */
export function kilos(g) {
  return `${(g / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}
