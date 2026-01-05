// app/page.js
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";
import { cookies } from "next/headers";

import RecentActivity from "@/components/RecentActivity";
import { getRecentActivity } from "@/lib/getRecentActivity";

export const metadata = {
  title: "The Locomotion Lab",
  description:
    "Le Locomotion Lab est un laboratoire vivant d'exploration de la locomotion humaine, du trail primal à la grimpe d’arbres et à l’hormèse.",
  alternates: {
    canonical: "https://thelocomotionlab.com/",
  },
  openGraph: {
    title: "The Locomotion Lab",
    description:
      "Espace d'exploration de la locomotion humaine, entre rigueur scientifique et expériences personnelles.",
    url: "https://thelocomotionlab.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Locomotion Lab",
    description:
      "Espace d'exploration de la locomotion humaine, entre rigueur scientifique et expériences personnelles.",
  },
};

const HERO_COOKIE = "ll_hero_index";

const HEROES = [
  {
    src: "/images/heroes/hero-01.webp",
    alt: "Trail en forêt – The Locomotion Lab",
    objectPosition: "50% 70%",
  },
  {
    src: "/images/heroes/hero-02.webp",
    alt: "Exploration en nature – The Locomotion Lab",
    objectPosition: "50% 60%",
  },
  {
    src: "/images/heroes/hero-03.webp",
    alt: "Mouvement en terrain naturel – The Locomotion Lab",
    objectPosition: "50% 65%",
  },
  {
    src: "/images/heroes/hero-04.webp",
    alt: "Locomotion et endurance – The Locomotion Lab",
    objectPosition: "50% 70%",
  },
  {
    src: "/images/heroes/hero-05.webp",
    alt: "Carnet de terrain – The Locomotion Lab",
    objectPosition: "50% 60%",
  },
];

function clampIndex(n, max) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, n), max);
}

export default async function HomePage() {
  // ✅ Next 16: cookies() is async
  const cookieStore = await cookies();
  const raw = cookieStore.get(HERO_COOKIE)?.value;
  const heroIndex = clampIndex(Number(raw), HEROES.length - 1);
  const hero = HEROES[heroIndex] ?? HEROES[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "The Locomotion Lab",
    url: "https://thelocomotionlab.com",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://thelocomotionlab.com/recherche?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
    hasPart: [
      {
        "@type": "SiteNavigationElement",
        name: "Projets",
        url: "https://thelocomotionlab.com/projets",
      },
      {
        "@type": "SiteNavigationElement",
        name: "Carnets",
        url: "https://thelocomotionlab.com/articles",
      },
      {
        "@type": "SiteNavigationElement",
        name: "Le Labo",
        url: "https://thelocomotionlab.com/labo",
      },
    ],
  };

  const recent = getRecentActivity({ limit: 6 });

  return (
    <div>
      <Script
        id="json-ld-sitelinks"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO */}
      <section className="relative min-h-[70vh] grid place-items-center text-center rounded-2xl overflow-hidden mt-6">
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

        <div className="relative z-10 px-4 sm:px-6 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white drop-shadow-xl font-heading">
            Explorer la locomotion humaine ancestrale.
          </h1>

          <p className="mt-4 text-base sm:text-lg md:text-xl text-white/90 leading-relaxed">
            Carnets, projets et expériences autour du mouvement, de l’ultra-endurance et de l’hormèse.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/labo"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
            >
              Entrer dans le labo
            </Link>

            <Link
              href="#activite"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-white/90 text-brand-deep font-semibold shadow-card hover:shadow-lg transition-shadow"
            >
              Voir l’activité récente
            </Link>
          </div>
        </div>
      </section>

      {/* FEED */}
      <div id="activite">
        <RecentActivity items={recent} />
      </div>

      {/* TEXTE (conservé mais hiérarchisé) */}
      <section className="py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-6">
          <p className="text-lg md:text-xl leading-relaxed text-gray-700">
            Le <span className="font-heading font-semibold">Locomotion Lab</span> est un espace d’exploration du mouvement
            humain sous toutes ses formes : trail primal, déplacement dans les arbres, locomotion animale…
          </p>

          <details className="mx-auto max-w-2xl text-left bg-white rounded-2xl shadow-card p-6">
            <summary className="cursor-pointer font-semibold text-brand-deep">
              Lire la démarche du Labo
            </summary>

            <div className="mt-4 text-base leading-relaxed text-gray-700 space-y-4">
              <p>
                L&apos;objectif est d&apos;analyser et de décortiquer les facteurs favorisant la fluidité, l&apos;endurance et la
                résilience dans le mouvement, pour optimiser potentiel et bien-être.
              </p>
              <p>
                Rigueur scientifique et expériences personnelles fusionnent pour proposer des contenus utiles et accessibles.
                Bienvenue dans ce laboratoire vivant.
              </p>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
