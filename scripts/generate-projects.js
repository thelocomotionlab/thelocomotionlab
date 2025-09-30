import fs from "fs";
import path from "path";
import matter from "gray-matter";

const projectsDir = path.resolve("public/projets");
const outputFile = path.resolve("src/content/projects.json");

const files = fs.readdirSync(projectsDir).filter(f => f.endsWith(".md"));

const projects = files.map(file => {
  const filePath = path.join(projectsDir, file);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const slug = path.basename(file, ".md");

  // extraire toutes les notes (## date - texte)
  const notes = [...content.matchAll(/^##\s+(.+)$/gm)].map(m => m[1]);

  return {
    slug,
    title: data.title || slug,
    date: data.date || null,
    status: data.status || "en cours",
    cover: data.cover || null,
    description: data.description || "",
    notes: notes.slice(-2).reverse() // garder les 2 dernières, ordre décroissant
  };
});

projects.sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync(outputFile, JSON.stringify(projects, null, 2));

console.log(`✅ ${projects.length} projets générés dans ${outputFile}`);
