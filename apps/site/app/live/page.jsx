// app/live/page.jsx
//
// Hub live permanent : direct actif (embed pleine page) OU « prochain
// départ » (bloc + capture email) — la bascule vit dans <LiveHub> (client).
// En bas de page, dans les deux états : cross-links curés vers Explorer et
// la phrase pack. Cette page remplace l'ancienne redirection /live de
// next.config.mjs.
import Link from "next/link";

import LiveHub from "@/components/LiveHub";
import ExplorerCarousel from "@/components/ExplorerCarousel";
import TwinCohorteTeaser from "@/components/TwinCohorteTeaser";
import SectionHeading from "@/components/SectionHeading";
import { getExplorerCarouselItems } from "@/lib/carouselItems";
import { journalApiBase } from "@/lib/liveConfig";

// Carte de partage dynamique : URL stable régénérée côté VPS
// (≤ 3 min), cache-buster PAR BUILD — chaque déploiement force les scrapers à
// re-crawler ; entre deux, l'URL stable sert une image fraîche à tout nouveau
// partage (limite du site 100 % statique).
const OG_IMAGE = `${journalApiBase}/journal/og.png?v=${Date.now()}`;

export const metadata = {
  title: "Live – Le direct des aventures du labo",
  description:
    "Suivi en direct des aventures du Locomotion Lab — ou le prochain départ : Tour des Écrins en autonomie, 20–24 août 2026.",
  alternates: {
    canonical: "https://thelocomotionlab.com/live",
  },
  openGraph: {
    title: "Live – The Locomotion Lab",
    description:
      "Suivi en direct des aventures du Locomotion Lab — ou le prochain départ.",
    url: "https://thelocomotionlab.com/live",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live – The Locomotion Lab",
    description:
      "Suivi en direct des aventures du Locomotion Lab — ou le prochain départ.",
    images: [OG_IMAGE],
  },
};

export default function LivePage() {
  // Dernières parutions du terrain (récits + projets) : mêmes cartes et
  // même carrousel que la page d'accueil.
  const carouselItems = getExplorerCarouselItems({ limit: 8 });

  return (
    <div className="px-4 sm:px-6 py-12">
      {/* L'en-tête de page vit dans LiveHub : l'état « En cours » (design
          live-v2) apporte son propre header ; l'état « Prochain départ »
          garde l'en-tête du chantier 1. */}
      <LiveHub />

      {/* Dernières parutions, dans tous les états — titre en Lora italique
          + filet, comme les sections du pilier Explorer. */}
      <section className="mt-14 max-w-4xl mx-auto">
        <SectionHeading className="mb-6">À lire également</SectionHeading>
        <ExplorerCarousel items={carouselItems} tone="light" />
      </section>

      {/* Appel à la cohorte du Twin, au-dessus de la phrase pack. */}
      <TwinCohorteTeaser className="mt-12 max-w-4xl mx-auto" />

      {/* Phrase pack (texte n°9, fixe), discrète */}
      <p className="mt-12 max-w-4xl mx-auto text-center text-sm text-gray-600 italic">
        Ce dispositif de suivi est déployable sur une grande variété
        d&rsquo;aventures.{" "}
        <Link href="/contact" className="underline hover:text-brand-accent">
          Écris-moi s&rsquo;il t&rsquo;intéresse
        </Link>
        .
      </p>
    </div>
  );
}
