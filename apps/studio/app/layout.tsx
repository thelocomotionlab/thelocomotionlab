import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { fontVariables } from "@locomotionlab/ui/fonts";

export const metadata: Metadata = {
  title: "Studio — Locomotion Lab",
  description:
    "Le poste de travail des visuels du labo : planches d'itinéraire, stories et survols, entièrement dans le navigateur.",
  manifest: "/manifest.webmanifest",
  // Le studio n'est lié de nulle part. `noindex` demande de ne pas l'indexer
  // même au robot qui aurait déjà l'URL — ce qu'un `Disallow` ne fait pas, et
  // qui publierait le chemin dans un fichier public par-dessus le marché.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Studio", statusBarStyle: "black-translucent" },
  // Déclarer `icons` ici REMPLACE la détection par fichier (app/icon.png) : il
  // faut donc y poser aussi l'icône d'onglet, sans quoi le navigateur retombe
  // sur un /favicon.ico qui n'existe pas.
  icons: {
    icon: [
      { url: "/images/assets/studio-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/assets/studio-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/images/assets/studio-apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1C18",
  // Le plan de travail a son propre zoom (Ctrl + molette, pincement) : laisser
  // le navigateur zoomer par-dessus ferait deux échelles superposées, et le
  // double tap sur une poignée déclencherait un zoom au lieu d'une sélection.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${fontVariables} font-sans h-full overflow-hidden`}>{children}</body>
    </html>
  );
}
