// app/page.js
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";

import FeedSection from "@/components/RecentActivity";
import NewsletterSignup from "@/components/NewsletterSignup";
import { getRecentArticles, getRecentProjects } from "@/lib/getRecentActivity";

import {
  Activity,
  BookOpen,
  FlaskConical,
  HeartHandshake,
  Menu,
  X,
  Search,
} from "lucide-react";


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


// ✅ TEMP: single hero only (keep structure for later)
const HEROES = [
  {
    src: "/images/heroes/hero-01.webp",
    alt: "Trail en forêt – The Locomotion Lab",
    objectPosition: "50% 70%",
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

  const recentArticles = getRecentArticles({ limit: 3 });
  const recentProjects = getRecentProjects({ limit: 3 });

  return (
    <div>
      <Script
        id="json-ld-sitelinks"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO */}
      <section className="relative min-h-[68vh] grid items-end justify-items-center pb-10 sm:pb-14 md:pb-16 text-center rounded-2xl overflow-hidden mt-6">

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
          <h1 className="text-4xl sm:text-5xl md:text-4xl font-extrabold text-white drop-shadow-xl font-heading">
            Explorer la locomotion humaine primordiale
          </h1>

          <p className="mt-4 text-base sm:text-lg md:text-lg text-white/90 leading-relaxed">
            Carnets, projets et expériences autour du mouvement, de l’ultra-endurance et de l’hormèse
          </p>

          <div className="mt-7 flex items-center justify-center">
            <Link
              href="/labo"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
            >
              Entrer dans le labo
            </Link>
          </div>
        </div>
      </section>


      {/* FEED 1: ARTICLES */}
      <FeedSection
        title="Derniers articles"
        Icon={BookOpen}
        items={recentArticles}
        ctaHref="/articles"
        ctaLabel="Voir tout"
      />

      {/* Line */}
      <div>
        <Separator />
      </div>

      {/* FEED 2: PROJETS */}
      <FeedSection
        title="Derniers projets"
        Icon={FlaskConical}
        items={recentProjects}
        ctaHref="/projets"
        ctaLabel="Voir tout"
      />

      {/* Line */}
      <div >
        <Separator />
      </div>

      {/* LAB DESCRIPTION (no card) + CTA + newsletter just below (no separator between) */}
      <section className="py-6 md:py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h3 className="flex items-center justify-center gap-2 text-xl md:text-2xl font-bold text-brand-primary">
            <Activity
              size={22}
              className="shrink-0 text-brand-primary"
              aria-hidden="true"
            />
            <span>Qu’est-ce que le Locomotion Lab&nbsp;?</span>
          </h3>


          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            Il s'agit d'un <strong>espace d'exploration</strong> de la locomotion humaine sous toutes ses formes.
          </p>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            Son but est d'explorer, décortiquer et analyser les facteurs et pratiques favorisant <strong>fluidité</strong>, <strong>endurance</strong> et <strong>adaptabilité</strong> dans le mouvement.
          </p>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            <strong>Rigueur scientifique</strong> et expériences personnelles fusionnent pour proposer des contenus utiles et accessibles.          
          </p>


          <div className="mt-4">
            <Link
              href="/about"
              className="inline-flex items-center md:text-lg justify-center px-5 py-2 hover:underline text-brand-deep font-semibold"
            >

{/*className="inline-flex items-center gap-1 text-sm font-medium text-brand-deep hover:underline"*/}

              En savoir plus →
            </Link>
          </div>

          {/* ✅ No separator here */}
          <div className="mt-4">
            <h4 className="text-lg font-semibold text-brand-accent text-center mb-3">
              Recevoir les prochaines explorations
            </h4>

            <NewsletterSignup
              title={null}         // ✅ only the title above
              description={null}    // ✅ no extra text
              placeholder="Votre adresse e-mail"
              buttonLabel="M'inscrire"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
