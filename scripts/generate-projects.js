// scripts/generate-projects.js
import fs from "fs";
import matter from "gray-matter";

const folder = "./public/projets";
const output = "./src/content/projects.json";

const projects = fs
  .readdirSync(folder)
  .filter((f) => f.endsWith(".md"))
  .map((filename) => {
    const file = fs.readFileSync(`${folder}/${filename}`, "utf8");
    const { data } = matter(file);
    return {
      slug: filename.replace(".md", ""),
      title: data.title || filename.replace(".md", ""),
      date: data.date || "",
      status: data.status || "",
      description: data.description || "",
      cover: data.cover || "",
      published: data.published !== false, // <= idem
    };
  })
  // 🔸 on ne garde que ceux qui sont publiés
  .filter((p) => p.published)
  // tri du plus récent au plus ancien
  .sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync(output, JSON.stringify(projects, null, 2));
console.log(`✅ ${projects.length} projets publiés exportés vers ${output}`);
