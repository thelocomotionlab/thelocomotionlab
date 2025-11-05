import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { spawn } from "child_process";

const BASE_PATH = path.resolve("dist");
const START_URL = "http://localhost:4173"; // port utilisé par vite preview ou "serve dist"

// Lance un petit serveur pour servir le build
const serve = spawn("npx", ["serve", "dist", "-l", "4173"], { stdio: "inherit" });

// Petite attente pour être sûr que le serveur est prêt
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  await wait(2000);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  // URLs à visiter
  const visited = new Set();
  const toVisit = new Set([START_URL]);

  async function crawl(url) {
    if (visited.has(url)) return;
    visited.add(url);
    console.log(`🧭 Exploration : ${url}`);

    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

    // Ignore les fichiers non-HTML (Markdown, images, etc.)
    if (/\.(md|png|jpg|jpeg|webp|ico|json|xml|pdf)$/i.test(url)) {
      console.log(`⏭ Ignoré (fichier non HTML) : ${url}`);
      return;
    }

    // Sauvegarde du HTML complet
    const html = await page.content();
    const relativePath = url.replace(START_URL, "");
    const filePath = path.join(BASE_PATH, relativePath, "index.html");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, html);
    console.log(`✅ Page pré-rendue : ${relativePath || "/"}`);

    // Trouve tous les liens internes
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

  // Boucle principale
  while (toVisit.size > 0) {
    const next = [...toVisit][0];
    toVisit.delete(next);
    await crawl(next);
  }

  await browser.close();
  serve.kill();
  console.log("🎉 Prérendu terminé !");
})();
