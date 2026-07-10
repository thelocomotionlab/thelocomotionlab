// app/page.js
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";

import FeedSection from "@/components/RecentActivity";
import EmailCapture from "@/components/EmailCapture";
import LiveStatusBlock from "@/components/LiveStatusBlock";
import { getRecentActivity } from "@/lib/getRecentActivity";
import { extractProjectNotes } from "@/lib/extractProjectNotes";

import { Activity, BookOpen, Gauge } from "lucide-react";


export const metadata = {
  title: "The Locomotion Lab",
  description:
    "Comprendre le corps comme un scientifique, l'utiliser comme un animal : le Locomotion Lab explore la robustesse physiologique — science, terrain et instruments.",
  alternates: {
    canonical: "https://thelocomotionlab.com/",
  },
  openGraph: {
    title: "The Locomotion Lab",
    description:
      "Comprendre le corps comme un scientifique, l'utiliser comme un animal : science, terrain et instruments de la robustesse physiologique.",
    url: "https://thelocomotionlab.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Locomotion Lab",
    description:
      "Comprendre le corps comme un scientifique, l'utiliser comme un animal : science, terrain et instruments de la robustesse physiologique.",
  },
};


// ✅ TEMP: single hero only (keep structure for later)
const HEROES = [
  {
    src: "/images/heroes/hero-01.webp",
    alt: "Coureur en trail dans une forêt baignée par la lumière du soir, illustration éditoriale du Locomotion Lab.",
    objectPosition: "50% 50%",
  },
];

function Separator() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6">
      <div className="h-[1px] bg-gray-300/80" />
    </div>
  );
}


export default async function HomePage() {
  const hero = HEROES[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "The Locomotion Lab",
    url: "https://thelocomotionlab.com",
    hasPart: [
      {
        "@type": "SiteNavigationElement",
        name: "Comprendre",
        url: "https://thelocomotionlab.com/comprendre",
      },
      {
        "@type": "SiteNavigationElement",
        name: "Explorer",
        url: "https://thelocomotionlab.com/explorer",
      },
      {
        "@type": "SiteNavigationElement",
        name: "La quête",
        url: "https://thelocomotionlab.com/quete",
      },
    ],
  };

  // Dernières parutions : feed mixte récits + articles + projets, tri métier
  // (date de publication pour les carnets, activité/complétion pour les projets).
  const recentItems = getRecentActivity({ limit: 6 });
  const projectNotesMap = Object.fromEntries(
    recentItems
      .filter((item) => item.type === "Projet")
      .map((p) => [p.slug, extractProjectNotes(p.slug)])
  );

  return (
    <div>
      <Script
        id="json-ld-sitelinks"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO — la formule du Lab en titre, CTA vers La quête */}
      <section
        className="
          relative
          min-h-[70vh] sm:min-h-[68vh]
          grid place-items-end
          text-center
          overflow-hidden
          w-full
          mt-0
          rounded-none
          pt-10 sm:pt-14 md:pt-16
          pb-12 sm:pb-16 md:pb-20
        "
      >
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: hero.objectPosition }}
        />

        <div className="absolute inset-0 bg-black/35" aria-hidden="true" />

        <div className="relative z-10 px-4 sm:px-6 max-w-xl sm:max-w-2xl md:max-w-4xl mx-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white drop-shadow-xl font-heading leading-tight">
            Comprendre le corps comme un scientifique,
            <br className="hidden sm:block" /> l&rsquo;utiliser comme un
            animal.
          </h1>

          <p className="mt-4 text-base sm:text-lg text-white/90 leading-relaxed">
            <span className="hidden sm:inline">
              Explorer la robustesse physiologique comme instrument de confiance en soi, force et bien-être.
            </span>
          </p>

          <div className="mt-8 flex items-center justify-center">
            <Link
              href="/quete"
              className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
            >
              La quête du labo
            </Link>
          </div>
        </div>
      </section>

      {/* BLOC LIVE — EN DIRECT ou prochain départ (composant de la PR3) */}
      <div className="mt-8 px-4 sm:px-6">
        <LiveStatusBlock />
      </div>

      {/* DERNIÈRES PARUTIONS — feed mixte récits + articles + projets */}
      <FeedSection
        title="Dernières parutions"
        icon={<BookOpen size={22} aria-hidden="true" className="text-brand-primary" />}
        items={recentItems}
        notesMap={projectNotesMap}
        ctaHref="/explorer"
        ctaLabel="Voir tout"
      />

      {/* Line */}
      <div>
        <Separator />
      </div>

      {/* CARTE LOCOMOTION TWIN */}
      <section className="py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <article className="bg-white rounded-2xl shadow-card p-6 sm:p-8 text-center transform transition duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <h2 className="flex items-center justify-center gap-2 text-2xl font-bold font-heading text-brand-deep mb-3">
              <Gauge
                size={24}
                className="shrink-0 text-brand-primary"
                aria-hidden="true"
              />
              <span>Locomotion Twin</span>
            </h2>
            <p className="text-gray-700 mb-6 max-w-xl mx-auto">
              Une prédiction honnête de ton temps de course, calibrée sur tes
              propres données d&rsquo;entraînement — le premier instrument du
              Lab.
            </p>
            <Link
              href="/outils/twin"
              className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
            >
              Découvrir le Twin
            </Link>
          </article>
        </div>
      </section>

      {/* Line */}
      <div>
        <Separator />
      </div>

      {/* LAB DESCRIPTION (no card) + CTA + capture email */}
      <section className="py-6 md:py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h3 className="flex items-center justify-center gap-2 text-2xl md:text-xl font-bold text-brand-primary">
            <Activity
              size={22}
              className="shrink-0 text-brand-primary"
              aria-hidden="true"
            />
            <span>Qu&rsquo;est-ce que le Locomotion Lab&nbsp;?</span>
          </h3>


          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            Il s&rsquo;agit d&rsquo;un <strong>espace d&rsquo;exploration</strong> de la locomotion humaine sous toutes ses formes.
          </p>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            Son but est d&rsquo;explorer, décortiquer et analyser les facteurs et pratiques favorisant la <strong>robustesse physiologique</strong>.
          </p>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            <strong>Rigueur scientifique</strong> et expériences personnelles se mélangent pour proposer des contenus utiles et accessibles.
          </p>


          <div className="mt-4">
            <Link
              href="/about"
              className="inline-flex items-center md:text-lg justify-center px-5 py-2 hover:underline text-brand-deep font-semibold"
            >
              En savoir plus →
            </Link>
          </div>

          <div className="mt-4">
            <h4 className="text-lg font-semibold text-brand-accent text-center mb-3">
              Recevoir les prochaines explorations
            </h4>

            <EmailCapture
              title={null}
              description={null}
              source="home"
              placeholder="Votre adresse e-mail"
              buttonLabel="M'inscrire"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
