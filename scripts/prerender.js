// scripts/prerender.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { spawn, execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const START_URL = "http://localhost:4173";

// 🧹 Tuer tout processus déjà sur 4173
try {
  execSync("lsof -ti:4173 | xargs kill -9", { stdio: "ignore" });
} catch {}

// 🧭 Extraire automatiquement les routes React depuis App.jsx
function extractRoutesFromFile(filePath) {
  const code = fs.readFileSync(filePath, "utf-8");
  // capture path="/quelque-chose"
  const routeRegex = /path=["'`](\/[^"'`]*)["'`]/g;
  const routes = new Set(["/"]); // toujours inclure la home
  let match;
  while ((match = routeRegex.exec(code))) {
    routes.add(match[1]);
  }
  return Array.from(routes);
}

const routesFromApp = extractRoutesFromFile(path.resolve("src/App.jsx"));
const seeds = Array.from(new Set(["/", ...routesFromApp]));
console.log("🧭 Routes détectées :", seeds);

// 🟢 Lance vite preview avec fallback SPA
const serve = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "preview", "--port", "4173", "--strictPort"],
  { stdio: "inherit" }
);

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  await wait(2500); // laisse le temps au serveur de démarrer

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const visited = new Set();
  const toVisit = new Set(seeds.map((r) => `${START_URL}${r}`));

  async function savePage(url) {
    if (/\.(md|png|jpe?g|webp|ico|json|xml|pdf|svg|mp4|webm|gpx|txt|map)$/i.test(url)) return;

    const html = await page.content();
    const relative = url.replace(START_URL, "");
    const cleanPath = relative === "/" ? "" : relative.replace(/\/$/, "");

    const outDir = path.join(DIST_DIR, cleanPath);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, html);
    console.log(`✅ Page prérendue : ${cleanPath || "/"}`);
  }

  async function crawl(url) {
    if (visited.has(url)) return;
    visited.add(url);
    console.log(`🧭 Exploration : ${url}`);

    let response;
    try {
      response = await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
    } catch (err) {
      console.warn(`⚠️ Erreur chargement ${url}: ${err.message}`);
      return;
    }

    const status = response?.status();
    if (status >= 400) console.warn(`⚠️ Statut ${status} pour ${url}`);

    await wait(400); // petit délai pour laisser React charger
    await savePage(url);

    // 🔍 Récupère les liens internes
    const links = await page.$$eval("a[href]", (as) =>
      as
        .map((a) => a.getAttribute("href") || "")
        .filter(Boolean)
        .filter((href) => {
          if (href.startsWith("http")) return false;
          if (href.startsWith("#")) return false;
          if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
          if (href.includes("blob:") || href.startsWith("javascript:")) return false;
          if (/\.(md|png|jpe?g|webp|ico|json|xml|pdf|svg|mp4|webm|gpx|txt|map)$/i.test(href)) return false;
          return true;
        })
        .map((href) => (href.startsWith("/") ? href : `/${href}`))
    );

    for (const link of links) {
      const abs = `${START_URL}${link}`;
      if (!visited.has(abs)) toVisit.add(abs);
    }
  }

  // 🚀 Boucle principale
  while (toVisit.size > 0) {
    const next = [...toVisit][0];
    toVisit.delete(next);
    await crawl(next);
  }

  await browser.close();
  serve.kill();
  console.log("🎉 Prérendu complet terminé !");
})();
