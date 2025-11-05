import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { spawn } from "child_process";

const BASE_PATH = path.resolve("dist");
const START_URL = "http://localhost:4173"; // port du "vite preview" ou de "serve dist"

// Lancer un petit serveur pour servir le build
const serve = spawn("npx", ["serve", "dist", "-l", "4173", "--single"], { stdio: "inherit" });

// Petit helper pour attendre
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  await wait(2000); // laisse le temps au serveur de démarrer

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const visited = new Set();
  const toVisit = new Set([START_URL]);

  async function crawl(url) {
    if (visited.has(url)) return;
    visited.add(url);
    console.log(`🧭 Exploration : ${url}`);

    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
    } catch (err) {
      console.warn(`⚠️ Erreur lors du chargement de ${url}: ${err.message}`);
      return;
    }

    // Ignore les fichiers non HTML
    if (/\.(md|png|jpg|jpeg|webp|ico|json|xml|pdf|svg|mp4|webm)$/i.test(url)) {
      console.log(`⏭ Ignoré (non HTML) : ${url}`);
      return;
    }

    // Sauvegarde du HTML complet rendu
    const html = await page.content();
    const relativePath = url.replace(START_URL, "");
    const filePath = path.join(BASE_PATH, relativePath, "index.html");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, html);
    console.log(`✅ Page prérendue : ${relativePath || "/"}`);

    // Recherche des liens internes pour explorer récursivement
    const links = await page.$$eval("a[href]", (as) =>
      as
        .map((a) => a.getAttribute("href"))
        .filter(
          (href) =>
            href &&
            !href.startsWith("http") &&
            !href.startsWith("#") &&
            !href.startsWith("mailto:") &&
            !href.startsWith("tel:") &&
            !href.includes("blob:")
        )
    );

    for (const link of links) {
      const absolute = `${START_URL}${link.startsWith("/") ? link : "/" + link}`;
      if (!visited.has(absolute)) toVisit.add(absolute);
    }
  }

  // Boucle principale de crawl
  while (toVisit.size > 0) {
    const next = [...toVisit][0];
    toVisit.delete(next);
    await crawl(next);
  }

  await browser.close();
  serve.kill();

  // --- Génération automatique du sitemap.xml ---
  const sitemapPath = path.join(BASE_PATH, "sitemap.xml");

  const urls = [...visited]
    .filter((url) => url.startsWith(START_URL))
    .map((url) => {
      const relative = url
        .replace(START_URL, "")
        .replace(/\/$/, "")
        .replace(/\.html$/, "");
      const clean = relative.startsWith("/") ? relative : "/" + relative;
      return `<url><loc>https://thelocomotionlab.com${clean}</loc></url>`;
    });

  const uniqueUrls = [...new Set(urls)];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${uniqueUrls.join("\n")}
  </urlset>`;

  fs.writeFileSync(sitemapPath, sitemap);
  console.log(`🗺️ Sitemap généré : ${sitemapPath}`);

  console.log("🎉 Prérendu complet terminé !");
})();
