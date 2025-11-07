import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { spawn } from "child_process";

const BASE_PATH = path.resolve("dist");
const START_URL = "http://localhost:4173"; // port du "vite preview" ou "serve dist"

const serve = spawn("npx", ["serve", "dist", "-l", "4173"], { stdio: "inherit" });

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  await wait(3000); // laisse le temps au serveur de démarrer

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
      await wait(1500); // attend que Helmet et React aient fini d'injecter les balises
    } catch (err) {
      console.warn(`⚠️ Erreur lors du chargement de ${url}: ${err.message}`);
      return;
    }

    // ignore les fichiers non HTML
    if (/\.(md|png|jpg|jpeg|webp|ico|json|xml|pdf|svg|mp4|webm|gpx)$/i.test(url)) return;

    const html = await page.content();
    const relativePath = url.replace(START_URL, "").replace(/\/$/, "");
    const outDir = path.join(BASE_PATH, relativePath);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, html);
    console.log(`✅ Page prérendue : ${relativePath || "/"}`);

    // cherche les liens internes
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
      const abs = `${START_URL}${link.startsWith("/") ? link : "/" + link}`;
      if (!visited.has(abs)) toVisit.add(abs);
    }
  }

  // boucle principale
  while (toVisit.size > 0) {
    const next = [...toVisit][0];
    toVisit.delete(next);
    await crawl(next);
  }

  await browser.close();
  serve.kill();

  console.log("🎉 Prérendu complet terminé !");
})();
