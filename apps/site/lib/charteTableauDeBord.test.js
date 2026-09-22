// lib/charteTableauDeBord.test.js
//
// LA CHARTE VIENT DE packages/ui ET DE NULLE PART AILLEURS (CLAUDE.md, invariant 1).
//
// Ce test garde le code du tableau de bord contre la dérive la plus facile : recopier
// une couleur vue dans la maquette plutôt que d'appeler le jeton qui la porte. Une
// valeur en dur ne se voit pas — elle marche, jusqu'au jour où la charte change et où
// un écran reste en arrière, seul, sans que personne sache pourquoi.
//
// Il est scopé au tableau de bord, et c'est volontaire : le reste du site porte des
// valeurs calculées (cartes, planches, SVG) qui passent par le miroir JS des tokens
// (`packages/ui/src/tokens.ts`) et qu'un test à la lettre condamnerait à tort. Étendre
// la garde au site entier est un chantier à part.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SURVEILLES = [
  "components/twin/tableau-de-bord",
  "app/services/twin/tableau-de-bord",
];

function fichiersDe(dossier) {
  const complet = path.join(RACINE, dossier);
  if (!fs.existsSync(complet)) return [];
  return fs
    .readdirSync(complet, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(jsx?|tsx?)$/.test(e.name))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

const FICHIERS = SURVEILLES.flatMap(fichiersDe);

/** Ce qu'on lit, sans les commentaires : ils citent des couleurs en toute légitimité. */
function codeDe(chemin) {
  return fs
    .readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const INTERDITS = [
  // Une couleur écrite en toutes lettres, où qu'elle soit — y compris dans une classe
  // Tailwind arbitraire, qui n'est qu'une façon de la cacher entre crochets.
  ["une couleur hexadécimale", /#[0-9a-fA-F]{3,8}\b/],
  ["une couleur rgb()/hsl()", /\b(rgba?|hsla?)\s*\(/],
  ["une couleur moderne", /\b(oklch|oklab|lab|lch|color-mix)\s*\(/],
  ["une famille de police", /font-family\s*:/],
  // Les crochets Tailwind, pour ce que la charte porte et elle seule. Les TAILLES
  // arbitraires (text-[22px], w-[300px]) restent permises : la charte ne porte pas de
  // grille de mise en page, et la maquette donne ses cotes au pixel.
  ["un fond ou un filet arbitraire", /\b(bg|ring|fill|stroke|from|via|to)-\[/],
  ["une ombre arbitraire", /\bshadow-\[/],
  ["un arrondi arbitraire", /\brounded-[a-z]*-?\[/],
  // Les palettes livrées avec Tailwind : elles existent, elles sont jolies, et elles
  // ne sont pas la charte.
  [
    "une couleur Tailwind hors charte",
    /\b(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  ],
];

describe("la charte du tableau de bord", () => {
  it("surveille bien les écrans du tableau de bord", () => {
    expect(FICHIERS.length).toBeGreaterThan(0);
    expect(FICHIERS.some((f) => f.endsWith("File.jsx"))).toBe(true);
    expect(FICHIERS.some((f) => f.endsWith("Athlete.jsx"))).toBe(true);
  });

  it.each(FICHIERS)("%s ne porte aucune valeur de charte en dur", (chemin) => {
    const code = codeDe(chemin);
    for (const [quoi, motif] of INTERDITS) {
      const trouve = code.match(motif);
      expect(trouve, `${path.relative(RACINE, chemin)} porte ${quoi} : ${trouve?.[0]}`).toBe(
        null,
      );
    }
  });

  it("les actions passent par Button et les champs par Field", () => {
    const interactifs = FICHIERS.filter((f) => /components\/twin/.test(f)).map(codeDe);
    const avecBouton = interactifs.filter((code) => /<button\b/.test(code));
    // Une exception, et une seule : le bandeau du haut, dont le bouton « privé » est
    // du texte cliquable et non une action — lui donner l'allure d'un CTA mentirait
    // sur ce qu'il fait.
    expect(avecBouton).toHaveLength(1);
    expect(interactifs.some((code) => /<Field\b/.test(code))).toBe(true);
  });

  it("aucun écran n'annonce de durée pour une ingestion", () => {
    // Décision du chantier : l'interface montre un état et l'avancement que le job
    // renvoie, jamais « quelques secondes » ni « environ une minute ». On ne sait pas
    // combien de temps prend une archive avant de l'avoir lue.
    const DUREES = /quelques (secondes|minutes|instants)|environ une (minute|heure)|en une minute/i;
    for (const chemin of FICHIERS) {
      const trouve = fs.readFileSync(chemin, "utf8").match(DUREES);
      expect(trouve, `${path.relative(RACINE, chemin)} annonce « ${trouve?.[0]} »`).toBe(null);
    }
  });
});
