// app/layout.js
import "./globals.css";
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
  title: "The Locomotion Lab",
  description:
    "Explorations de la locomotion humaine (site du Locomotion Lab).",
  // Configuration des icônes pointant vers ton dossier public/images/assets/
  manifest: "/images/assets/site.webmanifest",
  icons: {
    icon: [
      { url: "/images/assets/favicon.ico" },
      { url: "/images/assets/favicon.svg", type: "image/svg+xml" },
      {
        url: "/images/assets/favicon-96x96.png",
        type: "image/png",
        sizes: "96x96",
      },
    ],
    apple: [
      {
        url: "/images/assets/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: ["/images/assets/favicon.ico"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        className={`${ubuntu.variable} ${lora.variable} font-sans text-gray-700 relative min-h-screen`}
      >
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          {children}
        </main>
        <Footer />

        {/* Bouton de partage global, par-dessus le reste */}
        <ShareButton />
      </body>
    </html>
  );
}