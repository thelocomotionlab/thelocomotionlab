// app/live/page.jsx
//
// Hub live permanent : direct actif (embed pleine page) OU « prochain
// départ » (bloc + capture email) — la bascule vit dans <LiveHub> (client).
// En bas de page, dans les deux états : cross-links curés vers Explorer et
// la phrase pack. Cette page remplace l'ancienne redirection /live de
// next.config.mjs.
import Link from "next/link";

import LiveHub from "@/components/LiveHub";

export const metadata = {
  // [PROVISOIRE] Descriptions meta à affiner avec les textes définitifs (PR5).
  title: "Live – Le direct des aventures du Lab",
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
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live – The Locomotion Lab",
    description:
      "Suivi en direct des aventures du Locomotion Lab — ou le prochain départ.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

// Cross-links curés (§5.1 du brief) : le projet Journal d'aventures 2026,
// le récit Réunion, le récit Vercors-Drôme.
const CROSS_LINKS = [
  {
    href: "/explorer/saison-trail-2026",
    kind: "Projet",
    title: "Journal d'aventures 2026",
  },
  {
    href: "/explorer/recit-reunion-2025",
    kind: "Récit",
    title: "L'île intense vous dites ?",
  },
  {
    href: "/explorer/immersion-primale-entre-vercors-et-drome",
    kind: "Récit",
    title: "Immersion primale entre Vercors et Drôme",
  },
];

export default function LivePage() {
  return (
    <div className="px-4 sm:px-6 py-12">
      {/* L'en-tête de page vit dans LiveHub : l'état « En cours » (design
          live-v2) apporte son propre header ; l'état « Prochain départ »
          garde l'en-tête du chantier 1. */}
      <LiveHub />

      {/* Cross-links, dans les deux états */}
      <section className="mt-14 max-w-4xl mx-auto">
        <h2 className="text-xl font-bold font-heading text-brand-deep text-center mb-6">
          À lire en attendant, pour aller plus loin
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CROSS_LINKS.map(({ href, kind, title }) => (
            <Link
              key={href}
              href={href}
              // prefetch coupé : Next préchargerait les IMAGES des pages cibles
              // (~1,5 Mo) — mortel pour le budget « premier chargement » du live.
              prefetch={false}
              className="group bg-white rounded-2xl shadow-card p-5 hover:shadow-lg transition-shadow flex flex-col"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                {kind}
              </p>
              <p className="font-semibold text-brand-deep group-hover:underline">
                {title}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Phrase pack (texte n°9, fixe), discrète */}
      <p className="mt-12 max-w-4xl mx-auto text-center text-sm text-gray-600 italic">
        Ce dispositif de suivi est conçu et développé au Lab. Il vous ferait
        envie pour vos propres aventures ?{" "}
        <Link href="/contact" className="underline hover:text-brand-accent">
          Écrivez-moi
        </Link>
        .
      </p>
    </div>
  );
}
