// scripts/live-preview.mjs
//
// SIMULATEUR LOCAL DES ÉTATS DE /live.
//
// Parcourir les pages avant / pendant / après demandait jusqu'ici de manipuler
// le VPS (`./track start`, `./track stop`, `./track reset`) — donc d'abîmer une
// vraie session pour faire du design. Ce serveur sert les MÊMES fichiers que la
// prod (live-timer.json, live-positions.json, journal.json), fabriqués à la
// demande dans l'état voulu. Zéro dépendance, rien qui sorte de la machine.
//
//   node scripts/live-preview.mjs --etat encours
//   node scripts/live-preview.mjs --etat avant
//   node scripts/live-preview.mjs --etat fige --avance 100
//
// Il affiche la commande exacte à lancer dans un second terminal.
//
// ⚠️ L'état « repos » ne passe PAS par ici : il est décidé au build par
// NEXT_PUBLIC_LIVE_STATUT (le simulateur n'est même pas nécessaire).
//
// ⚠️ Le journal simulé contient du texte et des PHOTOS (de quoi exercer la
// visionneuse plein écran), mais pas de vidéo : il faudrait committer un vrai
// MP4 pour ça, et la publication de vidéos est de toute façon derrière un
// drapeau côté service (VIDEO_ENABLED).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Arguments -------------------------------------------------------------
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i] ?? true);
}
const ETATS = new Set(["avant", "encours", "fige"]);
const etat = String(args.get("etat") ?? "encours");
const port = Number(args.get("port") ?? 3999);
const avancePct = Math.min(100, Math.max(0, Number(args.get("avance") ?? 42)));
const sansJournal = args.has("sans-journal");

if (!ETATS.has(etat)) {
  console.error(`État inconnu : « ${etat} ». Attendu : ${[...ETATS].join(" | ")}.`);
  process.exit(2);
}

// --- Trace de référence : on rejoue le VRAI parcours configuré --------------
const { liveConfig } = await import(`file://${path.join(SITE_DIR, "lib", "liveConfig.js")}`);
const tracePath = path.join(SITE_DIR, "public", liveConfig.aventure.trace.replace(/^\//, ""));

let trace = null;
try {
  trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
} catch {
  console.error(
    `Trace introuvable : ${tracePath}\n` +
      `(elle vient de liveConfig.aventure.trace ; génère-la avec « pnpm -F site build:track … »)`,
  );
  process.exit(2);
}

const DEPART_MS = Date.now() - 26 * 3600_000; // départ il y a 26 h → on est à J2

/**
 * Fabrique une trace vécue en suivant les N premiers pour-cent du parcours
 * prévu, avec un bruit de quelques mètres — sinon la carte est trop propre pour
 * juger le rendu.
 */
function fabriquerPositions() {
  const coords = trace.coords ?? [];
  const profile = trace.profile ?? [];
  const jusqua = Math.max(1, Math.round((coords.length * avancePct) / 100));
  const pas = Math.max(1, Math.round(jusqua / 400)); // ~400 points, comme une vraie session

  const points = [];
  let distance = 0;
  let dplus = 0;
  let dminus = 0;
  let precedent = null;

  for (let i = 0; i < jusqua; i += pas) {
    const [lon, lat] = coords[i];
    // Altitude : reprise du profil prévu, indexé au prorata.
    const p = profile[Math.min(profile.length - 1, Math.round((i / coords.length) * profile.length))];
    const alt = Number.isFinite(p?.alt) ? p.alt : 1000;
    const jitter = () => (Math.random() - 0.5) * 0.00012; // ±~7 m

    const point = {
      idx: points.length,
      fixTime: new Date(DEPART_MS + (i / jusqua) * 26 * 3600_000).toISOString(),
      latitude: lat + jitter(),
      longitude: lon + jitter(),
      alt,
      distMeters: 0,
      distKm: 0,
      dPlus: 0,
      dMinus: 0,
    };
    if (precedent) {
      const R = 6_371_000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(point.latitude - precedent.latitude);
      const dLon = toRad(point.longitude - precedent.longitude);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(precedent.latitude)) * Math.cos(toRad(point.latitude)) * Math.sin(dLon / 2) ** 2;
      distance += 2 * R * Math.asin(Math.sqrt(h));
      const d = point.alt - precedent.alt;
      if (d > 0) dplus += d;
      else dminus += -d;
    }
    point.distMeters = distance;
    point.distKm = distance / 1000;
    point.dPlus = dplus;
    point.dMinus = dminus;
    points.push(point);
    precedent = point;
  }

  const dernier = points.at(-1);
  return {
    meta: { pointCount: points.length, updatedAt: new Date().toISOString() },
    stats: {
      distance,
      dplus: Math.round(dplus),
      dminus: Math.round(dminus),
      durationSeconds: Math.round((Date.now() - DEPART_MS) / 1000),
      lastFixTime: dernier?.fixTime ?? null,
    },
    profile: points,
    debug: { simulateur: true, avancePct },
  };
}

function fabriquerTimer() {
  if (etat === "avant") return { running: false, startTime: null, stopTime: null };
  const start = new Date(DEPART_MS).toISOString();
  if (etat === "fige") {
    return { running: false, startTime: start, stopTime: new Date(Date.now() - 900_000).toISOString() };
  }
  return { running: true, startTime: start, stopTime: null };
}

// Fausses photos : un SVG de relief, teinte et cadrage variables selon l'index.
// SVG et non WebP pour ne dépendre d'AUCUN binaire — et des formats DIFFÉRENTS
// (paysage, portrait, carré) parce que c'est là que la visionneuse plein écran
// se casse quand elle est mal faite.
const PHOTOS = [
  { w: 1600, h: 1067, teinte: 196 },
  { w: 1080, h: 1440, teinte: 28 },
  { w: 1200, h: 1200, teinte: 96 },
];

function fabriquerPhoto(i) {
  const { w, h, teinte } = PHOTOS[i % PHOTOS.length];
  const crete = Array.from({ length: 14 }, (_, k) => {
    const x = (k / 13) * w;
    const y = h * (0.52 + 0.22 * Math.sin(k * 1.3 + i) * Math.cos(k * 0.7));
    return `${x.toFixed(0)} ${y.toFixed(0)}`;
  }).join(" L ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="hsl(${teinte} 32% 78%)"/>
    <circle cx="${w * 0.78}" cy="${h * 0.2}" r="${Math.min(w, h) * 0.09}" fill="hsl(${teinte} 60% 92%)"/>
    <path d="M 0 ${h} L ${crete} L ${w} ${h} Z" fill="hsl(${teinte} 26% 42%)"/>
    <path d="M 0 ${h} L ${crete} L ${w} ${h} Z" fill="hsl(${teinte} 22% 26%)" transform="translate(0 ${h * 0.16})"/>
    <text x="${w / 2}" y="${h * 0.92}" font-family="sans-serif" font-size="${Math.min(w, h) * 0.06}"
          fill="hsl(${teinte} 20% 92%)" text-anchor="middle">photo simulée ${i + 1}</text>
  </svg>`;
}

function fabriquerJournal() {
  if (sansJournal || etat === "avant") return { schemaVersion: 1, entries: [], count: 0 };
  const textes = [
    "Départ dans le froid. Les jambes ne savent pas encore ce qui les attend.",
    "Premier col passé. Le vent s'est levé d'un coup dans la montée finale.",
    "Pause ravito au refuge. Soupe, deux cafés, et les chaussettes qui sèchent.",
    "La crête est plus longue que sur la carte. Elle l'est toujours.",
    "Nuit courte. Bivouac à l'abri d'un bloc, ciel dégagé, aucune lumière en bas.",
    "Deuxième jour. Les cuisses parlent, la tête écoute à peine.",
  ];
  // Une entrée sur deux porte une photo : de quoi tester la visionneuse plein
  // écran (ouverture, flèches, légendes) sans toucher au VPS.
  let photo = 0;
  const entries = textes.map((text, i) => {
    const base = {
      id: `sim-${String(i).padStart(4, "0")}`,
      ts: new Date(DEPART_MS + ((i + 1) / (textes.length + 1)) * 26 * 3600_000).toISOString(),
      text,
    };
    if (i % 2 === 1) {
      const { w, h } = PHOTOS[photo % PHOTOS.length];
      const media = { url: `/journal/media/sim-photo-${photo}.svg`, width: w, height: h };
      photo += 1;
      return { ...base, type: "photo", media };
    }
    return { ...base, type: "text" };
  });
  return { schemaVersion: 1, entries, count: entries.length };
}

// --- Serveur ---------------------------------------------------------------
const routes = {
  "/live-timer.json": fabriquerTimer,
  "/live-positions.json": fabriquerPositions,
  "/journal/journal.json": fabriquerJournal,
};

const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };

  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();

  // Le formulaire « Laisse un mot » doit répondre en local, sinon impossible de
  // travailler ses états succès/erreur. Rien n'est envoyé nulle part.
  const photo = url.pathname.match(/^\/journal\/media\/sim-photo-(\d+)\.svg$/);
  if (photo) {
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(fabriquerPhoto(Number(photo[1])));
    return;
  }

  if (req.method === "POST" && url.pathname === "/journal/message") {
    req.resume();
    return req.on("end", () => {
      console.log("  ✉️  message visiteur reçu (jeté — simulateur)");
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end('{"ok":true}');
    });
  }

  const fabrique = routes[url.pathname];
  if (!fabrique) {
    // story.png / og.png ne sont pas simulés : le bouton de partage retombe
    // proprement sur son onglet de repli, ce qui est aussi un cas à voir.
    return res.writeHead(404, cors).end("non simulé");
  }
  res.writeHead(200, { ...cors, "Content-Type": "application/json" });
  res.end(JSON.stringify(fabrique(), null, 2));
});

serveur.listen(port, () => {
  const libelle = { avant: "AVANT (compte à rebours)", encours: "EN COURS (direct)", fige: "EN COURS FIGÉ (badge TERMINÉ)" }[etat];
  console.log(`
┌─ Simulateur /live ─────────────────────────────────────────────
│  http://localhost:${port}
│  État servi   : ${libelle}
│  Parcours     : ${liveConfig.aventure.trace} (${avancePct} % parcourus)
│  Journal      : ${sansJournal || etat === "avant" ? "vide" : "6 entrées"}
└────────────────────────────────────────────────────────────────

Dans un AUTRE terminal, lance le site branché dessus :

  NEXT_PUBLIC_TRACKING_PROXY=http://localhost:${port} \\
  NEXT_PUBLIC_JOURNAL_API=http://localhost:${port} \\
  NEXT_PUBLIC_LIVE_STATUT=avant \\
  pnpm -F site dev

puis ouvre http://localhost:3000/live

Les QUATRE états, un par un :
  • avant    → --etat avant                   (+ NEXT_PUBLIC_LIVE_STATUT=avant)
  • pendant  → --etat encours                 (+ NEXT_PUBLIC_LIVE_STATUT=avant)
  • figé     → --etat fige                    (+ NEXT_PUBLIC_LIVE_STATUT=avant)
  • repos    → simulateur INUTILE             (NEXT_PUBLIC_LIVE_STATUT=repos)

⚠️ .env.local est lu par Next et GAGNE sur ces variables : s'il y définit
   NEXT_PUBLIC_LIVE_STATUT, même vide, c'est lui qui s'applique.

Ctrl-C pour arrêter.
`);
});
