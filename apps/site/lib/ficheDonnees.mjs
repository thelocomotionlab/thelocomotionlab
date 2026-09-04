// lib/ficheDonnees.mjs
//
// Les chiffres d'une fiche, LUS depuis ses données plutôt qu'écrits à la main.
// C'est ce qui permet à une carte de fiche d'afficher une masse et un nombre
// d'articles sans qu'aucune photo ni aucun champ de frontmatter n'existe : la
// variété vient des données, pas des images.
//
// Une fiche sans paquetage (une nutrition, un plan de course) retourne null,
// et sa carte reste purement typographique.

import fs from "node:fs";
import path from "node:path";

import { agregerPaquetage, kilos } from "./paquetage";

const SRC_PAQUETAGE = /<paquetage\s+[^>]*src="([^"]+)"/i;

export function donneesDeFiche(entry) {
  const trouve = entry?.content?.match(SRC_PAQUETAGE);
  if (!trouve) return null;

  const src = trouve[1];
  if (!src.startsWith("/")) return null;

  const fichier = path.join(process.cwd(), "public", src.replace(/^\//, ""));
  if (!fs.existsSync(fichier)) return null;

  const { total, nombreArticles } = agregerPaquetage(
    fs.readFileSync(fichier, "utf8")
  );
  if (!total) return null;

  return {
    masse: kilos(total),
    articles: `${nombreArticles} article${nombreArticles > 1 ? "s" : ""}`,
  };
}
