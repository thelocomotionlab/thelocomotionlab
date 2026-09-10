// public/sw.js
//
// LE SERVICE WORKER DU STUDIO.
//
// L'app entière est son scope, et c'est justement pourquoi elle est séparée du
// site : un service worker mal réglé qui sert une page périmée ne peut ici
// gêner que le studio, jamais un article publié.
//
// POURQUOI PAS DE PRÉCACHE. Les assets de Next portent un nom haché, calculé au
// build : un fichier écrit à la main ne peut pas les connaître. On met donc en
// cache À L'USAGE — première visite en ligne, ensuite ça marche hors réseau.
// C'est exactement le mode d'emploi du studio : on l'ouvre chez soi, on s'en
// sert au bivouac.
//
// DEUX STRATÉGIES, et le choix se fait sur une seule question — « une version
// périmée est-elle acceptable ? » :
//   • NAVIGATIONS : réseau d'abord. Sinon un déploiement ne serait jamais vu,
//     et on travaillerait des semaines sur une version morte sans le savoir.
//   • ASSETS HACHÉS (/_next/static) : cache d'abord. Leur nom change à chaque
//     build, donc ce qui est en cache est par construction encore juste.
//   • IMAGES et POLICES : cache d'abord aussi, elles ne bougent pas.
//
// Ce qui n'est JAMAIS mis en cache : les tuiles de relief et d'imagerie (autre
// origine). Les planches image marchent hors ligne, Survol non — c'est annoncé
// dans l'interface plutôt que découvert au bivouac.

const VERSION = "studio-v2";
const CACHE = `locomotionlab-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/", "/manifest.webmanifest"]))
      .catch(() => {}) // hors ligne à l'installation : on prendra à l'usage
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Ce qui se met en cache : même origine, et rien de dynamique. */
function cachable(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname === "/" ||
      url.pathname === "/manifest.webmanifest")
  );
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // tuiles de relief & co : jamais

  // Navigation : réseau d'abord, cache en filet.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((rep) => {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(request, copie));
          return rep;
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match("/"))),
    );
    return;
  }

  if (!cachable(url)) return;

  // Asset : cache d'abord, et on complète le cache au passage.
  e.respondWith(
    caches.match(request).then(
      (enCache) =>
        enCache ??
        fetch(request).then((rep) => {
          // Une réponse partielle (206) ou opaque n'est pas rejouable : on la
          // sert sans la garder, sinon on servirait un fichier tronqué.
          if (rep.ok && rep.status === 200) {
            const copie = rep.clone();
            caches.open(CACHE).then((c) => c.put(request, copie));
          }
          return rep;
        }),
    ),
  );
});
