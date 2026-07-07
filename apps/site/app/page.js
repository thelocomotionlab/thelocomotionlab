// app/page.js
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";

import FeedSection from "@/components/RecentActivity";
import EmailCapture from "@/components/EmailCapture";
import { getRecentArticles, getRecentProjects } from "@/lib/getRecentActivity";
import { extractProjectNotes } from "@/lib/extractProjectNotes";

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
        name: "Manifeste",
        url: "https://thelocomotionlab.com/manifeste",
      },
    ],
  };

  const recentArticles = getRecentArticles({ limit: 6 });
  const recentProjects = getRecentProjects({ limit: 6 });
  const projectNotesMap = Object.fromEntries(
    recentProjects.map((p) => [p.slug, extractProjectNotes(p.slug)])
  );

  return (
    <div>
      <Script
        id="json-ld-sitelinks"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO */}
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
            Explorer la locomotion humaine primordiale
          </h1>

          <p className="mt-4 text-base sm:text-lg text-white/90 leading-relaxed">
            <span className="sm:hidden">
              Carnets, projets, expérimentations
            </span>
            <span className="hidden sm:inline">
              Carnets, projets et expérimentations autour du mouvement, de l’ultra-endurance et de l’hormèse
            </span>
          </p>

          <div className="mt-8 flex items-center justify-center">
            <Link
              href="/manifeste"
              className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
            >
              Entrer dans le labo
            </Link>
          </div>
        </div>
      </section>

      {/* ENCART TEMPORAIRE LIVE 
      <div className="bg-brand-primary text-white text-center py-3 px-4 flex items-center justify-center gap-3">
        <span className="pulse-fast w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
        <p className="text-sm sm:text-base font-medium">
          Traversée du Vercors en direct –{" "}
          <Link
            href="https://www.thelocomotionlab.com/live"
            className="underline underline-offset-2 font-semibold hover:opacity-80 transition"
          >
            Rejoindre le live
          </Link>
        </p>
      </div>
      */}

      {/* FEED 1: ARTICLES — les items pointent vers /comprendre ou
          /explorer selon leur type ; refonte « dernières parutions » en PR5 */}
      <FeedSection
        title="Derniers articles"
        icon={<BookOpen size={22} aria-hidden="true" className="text-brand-primary" />}
        items={recentArticles}
        ctaHref="/explorer"
        ctaLabel="Voir tout"
      />

      {/* Line */}
      <div>
        <Separator />
      </div>

      {/* FEED 2: PROJETS */}
      <FeedSection
        title="Derniers projets"
        icon={<FlaskConical size={22} aria-hidden="true" className="text-brand-primary" />}
        items={recentProjects}
        notesMap={projectNotesMap}
        ctaHref="/explorer"
        ctaLabel="Voir tout"
      />

      {/* Line */}
      <div >
        <Separator />
      </div>

      {/* LAB DESCRIPTION (no card) + CTA + newsletter just below (no separator between) */}
      <section className="py-6 md:py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h3 className="flex items-center justify-center gap-2 text-2xl md:text-xl font-bold text-brand-primary">
            <Activity
              size={22}
              className="shrink-0 text-brand-primary"
              aria-hidden="true"
            />
            <span>Qu’est-ce que le Locomotion Lab&nbsp;?</span>
          </h3>


          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            Il s’agit d’un <strong>espace d’exploration</strong> de la locomotion humaine sous toutes ses formes.
          </p>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            Son but est d’explorer, décortiquer et analyser les facteurs et pratiques favorisant la <strong>robustesse physiologique</strong>.
          </p>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-gray-700">
            <strong>Rigueur scientifique</strong> et expériences personnelles se mélangent pour proposer des contenus utiles et accessibles.          
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

            <EmailCapture
              title={null}         // ✅ only the title above
              description={null}    // ✅ no extra text
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
