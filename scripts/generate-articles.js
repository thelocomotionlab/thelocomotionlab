import fs from "fs";
import path from "path";
import matter from "gray-matter";

const articlesDir = path.resolve("public/articles");
const outputFile = path.resolve("src/content/articles.json");

const files = fs.readdirSync(articlesDir).filter(f => f.endsWith(".md"));

const articles = files.map(file => {
  const filePath = path.join(articlesDir, file);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data } = matter(raw);

  // slug = nom du fichier sans extension
  const slug = path.basename(file, ".md");

  return {
    slug,
    title: data.title || slug,
    date: data.date || null,
    cover: data.cover || null,     // Ajout de la cover
    tags: data.tags || []          // pratique pour filtrer plus tard
  };
});

// Tri du plus récent au plus ancien
articles.sort((a, b) => new Date(b.date) - new Date(a.date));

// Écriture dans articles.json
fs.writeFileSync(outputFile, JSON.stringify(articles, null, 2));

console.log(`✅ ${articles.length} articles générés dans ${outputFile}`);
