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
    template: "%s | The Locomotion Lab",
  },
  description:
    "Explorations de la locomotion humaine, analyse de la foulée et aventures sportives.",
  metadataBase: new URL("https://thelocomotionlab.com"),

  manifest: "/site.webmanifest",

  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: ["/favicon.ico"],
  },

  openGraph: {
    title: "The Locomotion Lab",
    description:
      "Explorations de la locomotion humaine et aventures sportives.",
    url: "https://thelocomotionlab.com",
    siteName: "The Locomotion Lab",
    images: [
      {
        url: "/images/assets/og-image.jpg",
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
        <main className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
          {children}
        </main>
        <Footer />
        <ShareButton />
      </body>
    </html>
  );
}