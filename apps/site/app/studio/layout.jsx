// app/studio/layout.jsx
//
// La coque du studio. Elle n'existe que pour DEUX choses que seule une route
// peut porter :
//   • son propre manifeste — installer depuis /studio pose une icône SÉPARÉE
//     sur l'écran d'accueil, sombre, qui ouvre directement l'espace de création
//     en plein écran. Sans ça, on retomberait sur l'app du site ;
//   • `noindex, nofollow` sur toute la branche, hérité par les pages filles.
export const metadata = {
  manifest: "/studio.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Studio",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [{ url: "/images/assets/studio-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#1A1C18",
};

export default function StudioLayout({ children }) {
  return children;
}
