/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Tree-shake les gros packages d'icônes / charts / animations :
  // Next n'embarquera dans le bundle client que ce qui est vraiment importé.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
    ],
  },

  images: {
    // Sur Cloudflare Pages, l'optimisation d'images Next a des limites :
    // ces formats sont utilisés si la pipeline d'optimisation est active,
    // sinon les WebP existants dans /public sont servis tels quels.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 828, 1080, 1200, 1920],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 jours
  },

  // Sur Cloudflare Pages via @cloudflare/next-on-pages, ces headers sont
  // traduits en règles `_headers` lors du déploiement.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      // Cache long pour les assets immuables servis depuis /public/images
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Cache long pour les replays GPX / JSON statiques
      {
        source: "/replays/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/live",
        /* destination: 'https://www.thelocomotionlab.com/projets/traversee-reunion#la-travers%C3%A9e-de-la-r%C3%A9union-en-direct', */
        destination:
          "https://www.thelocomotionlab.com/projets/saison-trail-2026#projet-off-fontaine-rémuzat",
        // `permanent: false` effectue une redirection 307 (équivalent au 302).
        // Passe-le à `true` (308/301) uniquement si cette URL `/live` pointera
        // TOUJOURS vers cette page précise, même après ton retour de la Réunion.
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
