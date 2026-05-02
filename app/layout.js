// app/layout.js
import "./globals.css";
// KaTeX (math) styles: required to hide the MathML fallback and avoid duplicated/overlapping glyphs.
import "katex/dist/katex.min.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Ubuntu, Lora } from "next/font/google";
import ShareButton from "@/components/ShareButton";

const ubuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-ubuntu",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});

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
      { url: "/images/assets/favicon.svg", type: "image/svg+xml" },
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
        url: "/images/assets/og-image.jpg", // Ton image existante
        width: 1200,
        height: 630,
        alt: "The Locomotion Lab - Explorations",
      },
    ],
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        className={`${ubuntu.variable} ${lora.variable} font-sans text-gray-700 relative min-h-screen`}
      >
        <Navbar />
        <main>
          {children}
        </main>
        <Footer />

        {/* Bouton de partage global, par-dessus le reste */}
        <ShareButton />
      </body>
    </html >
  );
}