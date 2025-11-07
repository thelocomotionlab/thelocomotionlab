import fs from "fs";
import path from "path";
import matter from "gray-matter";

const distPath = path.resolve("dist");
const projectsPath = path.resolve("src/content/projets");
const articlesPath = path.resolve("src/content/articles");

// --- Fonction pour lister tous les fichiers HTML dans dist ---
function getHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getHtmlFiles(fullPath));
    } else if (file === "index.html") {
      results.push(fullPath);
    }
  }
  return results;
}

// --- Extrait la description des fichiers markdown ---
function extractDescription(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    return data.description || content.split("\n").find((l) => l.trim())?.slice(0, 160);
  } catch {
    return null;
  }
}

// --- Construit une map { /slug -> description } ---
const metas = {};
for (const [base, type] of [
  [projectsPath, "projets"],
  [articlesPath, "articles"],
]) {
  if (!fs.existsSync(base)) continue;
  for (const file of fs.readdirSync(base)) {
    if (!file.endsWith(".md")) continue;
    const slug = file.replace(/\.md$/, "");
    metas[`/${type}/${slug}`] = extractDescription(path.join(base, file));
  }
}

// --- Injection dans tous les fichiers HTML du build ---
const htmlFiles = getHtmlFiles(distPath);
for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");
  const relPath = file.replace(distPath, "").replace(/\/index\.html$/, "");

  const desc =
    metas[relPath] ||
    (relPath.startsWith("/projets")
      ? "Suivi vivant des expérimentations du Locomotion Lab : ultra minimalisme, respiration consciente, préparation physique et résilience."
      : relPath.startsWith("/articles")
      ? "Carnets du Labo : récits, analyses et expérimentations autour du mouvement et de la conscience corporelle."
      : "Exploration de la locomotion humaine sous toutes ses formes avec une approche scientifique et expérimentale.");

  // Supprime anciennes meta descriptions
  html = html.replace(/<meta name="description"[^>]*>/g, "");

  // Injecte la meta description
  html = html.replace("</head>", `  <meta name="description" content="${desc}">\n</head>`);

  fs.writeFileSync(file, html);
  console.log(`✅ Injecté dans ${relPath || "/"}`);
}

console.log("🎉 Meta descriptions injectées avec succès !");
