// app/layout.js
import "./globals.css";
// KaTeX (math) styles: required to hide the MathML fallback and avoid duplicated/overlapping glyphs.
import "katex/dist/katex.min.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ubuntu, lora, ubuntuMono } from "@locomotionlab/ui/fonts";
import ShareButton from "@/components/ShareButton";
import ChromeDuSite from "@/components/ChromeDuSite";
import { OG_IMAGE, OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo";

export const metadata = {
  title: {
    default: "The Locomotion Lab",
    template: "%s | The Locomotion Lab", // Permet d'avoir "Titre Article | The Locomotion Lab" automatiquement
  },
  description: "Explorations de la locomotion humaine, analyse de la foulée et aventures sportives.",
  metadataBase: new URL('https://thelocomotionlab.com'), // Indispensable pour que les images sociales marchent
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/images/assets/favicon.ico" },
      { url: "/images/assets/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [
      { url: "/images/assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/images/assets/favicon.ico"],
  },
  // 👇 C'est ça qui manquait pour que tes liens soient beaux :
  openGraph: {
    title: "The Locomotion Lab",
    description: "Explorations de la locomotion humaine et aventures sportives.",
    url: "https://thelocomotionlab.com",
    siteName: "The Locomotion Lab",
    images: [
      {
        url: OG_IMAGE,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: OG_IMAGE_ALT,
      },
    ],
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body
        className={`${ubuntu.variable} ${lora.variable} ${ubuntuMono.variable} font-sans text-brand-text relative min-h-screen`}
      >
        <a href="#main-content" className="skip-link">
          Aller au contenu principal
        </a>
        {/* Navbar, pied et bouton de partage disparaissent sur les routes en
            plein écran (le studio) : cf. components/ChromeDuSite.jsx */}
        <ChromeDuSite>
          <Navbar />
        </ChromeDuSite>
        <main id="main-content">
          {children}
        </main>
        <ChromeDuSite>
          <Footer />
          {/* Bouton de partage global, par-dessus le reste */}
          <ShareButton />
        </ChromeDuSite>
      </body>
    </html>
  );
}