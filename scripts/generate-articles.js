// scripts/generate-articles.js
import fs from "fs";
import matter from "gray-matter";

const folder = "./public/articles";
const output = "./src/content/articles.json";

const articles = fs
  .readdirSync(folder)
  .filter((f) => f.endsWith(".md"))
  .map((filename) => {
    const file = fs.readFileSync(`${folder}/${filename}`, "utf8");
    const { data } = matter(file);
    return {
      slug: filename.replace(".md", ""),
      title: data.title || filename.replace(".md", ""),
      date: data.date || "",
      description: data.description || "",
      cover: data.cover || "",
      published: data.published !== false, // <= clé importante
    };
  })
  // 🔸 On garde uniquement les articles publiés
  .filter((a) => a.published)
  // tri chronologique
  .sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync(output, JSON.stringify(articles, null, 2));
console.log(`✅ ${articles.length} articles publiés exportés vers ${output}`);
