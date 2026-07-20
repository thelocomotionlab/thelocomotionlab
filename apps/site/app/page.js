// app/page.js — refonte accueil 2026 (design_handoff_accueil)
//
// Page d'accueil en cinq actes : hero pleine hauteur → Comprendre (lavis
// bleu + registre des articles) → Explorer (photo Dolomites + cartes du
// terrain) → manifeste du labo (registre 4 lignes) → bande de capture email.
// Les textes et valeurs (couleurs, tailles) viennent du handoff, validés
// par Valentin ; les données (registre, cartes) du contenu Markdown.
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";

import EmailCapture, { MICRO_PROMESSE } from "@/components/EmailCapture";
import ExplorerCarousel from "@/components/ExplorerCarousel";
import ExplorerLiveIndicator from "@/components/ExplorerLiveIndicator";
import { getExplorerCarouselItems } from "@/lib/carouselItems";
import { listArticleEntries } from "@/lib/contentRoutes.mjs";

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
      "Comprendre le corps comme un scientifique, l'utiliser comme un animal : science, terrain et outils de la robustesse physiologique.",
    url: "https://thelocomotionlab.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Locomotion Lab",
    description:
      "Comprendre le corps comme un scientifique, l'utiliser comme un animal : science, terrain et outils de la robustesse physiologique.",
  },
};

// TEMP: single hero only (keep structure for later)
const HEROES = [
  {
    src: "/images/heroes/hero-01.webp",
    alt: "Coureur en trail dans une forêt baignée par la lumière du soir, illustration éditoriale du Locomotion Lab.",
    objectPosition: "50% 50%",
  },
];

/* ============================
   REGISTRE DES ARTICLES (section Comprendre)
   ============================ */

// Statut d'une entrée du registre, dérivé du frontmatter :
// publié → PUBLIÉ (ligne cliquable) ; brouillon teaser:true → À PARAÎTRE ;
// autre brouillon → À VENIR (ligne estompée).
const REGISTRE_BADGES = {
  publie: {
    label: "PUBLIÉ",
    className:
      "border-brand-primary-dark/55 bg-brand-primary/14 text-brand-primary-dark",
  },
  aParaitre: {
    label: "À PARAÎTRE",
    className:
      "border-brand-accent-dark/55 bg-brand-accent-light/14 text-brand-accent-dark",
  },
  aVenir: {
    label: "À VENIR",
    className: "border-black/25 text-gray-500",
  },
};

// La zone du registre défile (RegistreScroller) : on borne large ; publiés
// d'abord, puis « à paraître », puis « à venir », par date décroissante
// dans chaque groupe.
const REGISTRE_MAX_ROWS = 8;

function getRegistreRows() {
  const entries = listArticleEntries().filter((e) => e.kind === "article");

  const statusOf = (e) => {
    if (e.published) return "publie";
    return e.data.teaser === true ? "aParaitre" : "aVenir";
  };
  const GROUP_ORDER = { publie: 0, aParaitre: 1, aVenir: 2 };

  const dateKey = (e) => {
    const d = e.data.date ? new Date(e.data.date) : null;
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  };

  return entries
    .sort(
      (a, b) =>
        GROUP_ORDER[statusOf(a)] - GROUP_ORDER[statusOf(b)] ||
        dateKey(b) - dateKey(a)
    )
    .slice(0, REGISTRE_MAX_ROWS)
    .map((e) => ({
      slug: e.slug,
      title: e.data.title || e.slug,
      theme:
        (e.data.tags || []).find((t) => t && t.trim())?.toUpperCase() ?? "",
      status: statusOf(e),
    }));
}

function RegistreRow({ row, isLast }) {
  const badge = REGISTRE_BADGES[row.status];
  const rowClassName = [
    "flex snap-start items-center gap-3 px-1 py-[18px] md:gap-4",
    isLast ? "" : "border-b border-brand-primary-dark/25",
    // Le prototype ne met pas de hover sur la ligne estompée « À VENIR »
    // (estompe adoucie à 65 % pour rester lisible).
    row.status === "aVenir"
      ? "opacity-65"
      : "transition-colors hover:bg-brand-primary/8",
  ].join(" ");

  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-brand-text md:text-[16.5px]">
          {row.title}
        </span>
        {row.theme ? (
          <span className="mt-[3px] block font-mono text-[11px] tracking-[0.12em] text-gray-500">
            {row.theme}
          </span>
        ) : null}
      </span>
      <span
        className={`flex-none whitespace-nowrap rounded-[3px] border px-2 py-1 font-mono text-[10px] tracking-[0.1em] md:px-2.5 md:text-[11px] ${badge.className}`}
      >
        {badge.label}
      </span>
    </>
  );

  return row.status === "publie" ? (
    <Link href={`/comprendre/${row.slug}`} className={rowClassName}>
      {inner}
    </Link>
  ) : (
    <div className={rowClassName}>{inner}</div>
  );
}

function RegistrePanel({ rows }) {
  return (
    <div className="rounded border border-brand-primary-dark/45 border-t-[3px] border-t-brand-primary-dark bg-white px-6 pb-6 shadow-[0_6px_24px_rgba(0,0,0,0.1)] md:px-8 md:pb-[26px]">
      {/* En-tête centré verticalement entre le bord supérieur et le filet. */}
      <div className="flex items-center border-b-[1.5px] border-brand-primary-dark/40 py-[18px] md:py-5">
        <span className="font-mono text-[12px] font-bold tracking-[0.2em] text-gray-600">
          DERNIERS ARTICLES
        </span>
      </div>

      {/* Zone défilante : ~3 lignes visibles, fine barre bleue en
          indicateur quand il y a plus d'articles. */}
      <div className="ll-vscroll max-h-[248px] snap-y overflow-y-auto">
        {rows.map((row, i) => (
          <RegistreRow key={row.slug} row={row} isLast={i === rows.length - 1} />
        ))}
      </div>

      <p className="mt-3 font-mono text-[11px] tracking-[0.16em]">
        <a
          href="#email"
          className="text-brand-accent-dark underline underline-offset-[3px] hover:text-brand-deep"
        >
          ÊTRE PRÉVENU·E DES PROCHAINES PARUTIONS
        </a>
      </p>
    </div>
  );
}

/* ============================
   MANIFESTE DU LABO
   ============================ */

// « Ce qui anime ce labo » : 4 piliers en registre pleine largeur
// (design_handoff_labo). Textes finaux, validés.
const MANIFESTE = [
  {
    verb: "Douter",
    suite: "des normes établies.",
    texte:
      "Relire les dogmes de l’entraînement et de la santé à la lumière des études — et de millions d’années d’évolution.",
  },
  {
    verb: "Éprouver",
    suite: "par soi-même.",
    texte:
      "Être son propre laboratoire : tester en conditions réelles, se tromper, recommencer. La connaissance qui reste est celle qui est vécue.",
  },
  {
    verb: "Jouer",
    suite: "pour prendre du plaisir et durer.",
    texte:
      "Le jeu est le moteur le plus durable : bouger comme un animal, rester curieux, faire de la pratique une récréation plutôt qu’une discipline.",
  },
  {
    verb: "Partager",
    suite: "pour ancrer et transmettre.",
    texte:
      "Écrire, raconter, accompagner : ce qui est partagé s’ancre plus profondément — et fait avancer les autres.",
  },
];

// Style commun des liens du pied de section (« cette philosophie en action »).
const MANIFESTE_LINK_CLASS =
  "text-[14.5px] font-semibold text-brand-primary-dark transition hover:text-brand-accent-dark";

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

  const registreRows = getRegistreRows();
  // Carrousel Explorer : dernières entrées du feed terrain (récits + projets).
  const explorerItems = getExplorerCarouselItems({ limit: 8 });

  return (
    // -mb-12 : annule le mt-12 du Footer partagé pour que la bande email
    // touche directement le footer (design), sans impacter les autres pages.
    <div className="-mb-12">
      <Script
        id="json-ld-sitelinks"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── HERO — gabarit et ton de l'ancienne accueil : overlay léger
             uniforme, texte modeste, bloc calé vers le bas ───────────── */}
      <section className="relative grid min-h-[70vh] place-items-end overflow-hidden pb-12 pt-10 text-center sm:min-h-[68vh] sm:pb-16 sm:pt-14 md:pb-20 md:pt-16">
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

        <div className="relative z-10 mx-auto w-full max-w-4xl px-4 sm:px-6">
          <h1 className="font-heading text-2xl font-bold leading-tight text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.4)] sm:text-3xl md:text-4xl">
            Comprendre le corps comme un scientifique,
            <span className="mt-1.5 block font-lora text-[21px] font-medium italic leading-snug text-brand-accent-light sm:text-[26px] md:text-[30px]">
              l&rsquo;utiliser comme un animal.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-[680px] text-base leading-relaxed text-white/90 text-pretty sm:text-lg">
            Explorer la robustesse physiologique comme instrument de confiance
            en soi, force et bien-être.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <Link
              href="/quete"
              className="inline-block rounded-full bg-brand-accent px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-primary-dark"
            >
              La quête du labo
            </Link>
          </div>
        </div>
      </section>

      {/* ── 01 · COMPRENDRE — lavis bleu + registre des articles ───── */}
      <section
        id="comprendre"
        className="scroll-mt-20 bg-brand-wash bg-lab-grid-blue px-6 py-11 [background-size:28px_28px] md:px-16 md:py-24 md:[background-size:32px_32px]"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-16">
          <div>
            <p className="mb-3.5 font-mono text-[13px] font-bold tracking-[0.25em] text-brand-slate">
              / INTELLECT
            </p>
            <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.01em] text-brand-slate-dark md:text-[64px]">
              Comprendre
            </h2>
            <p className="mt-3.5 font-lora text-xl italic text-brand-deep">
              La science derrière les concepts.
            </p>
            <p className="mt-5 max-w-[460px] text-[16.5px] leading-[1.7] text-gray-700 text-pretty">
              Des articles de fond, sourcés et accessibles, qui décortiquent ce
              qui rend un corps capable d&rsquo;encaisser, de s&rsquo;adapter
              et de durer, puis le traduisent en pratiques concrètes,
              éprouvées sur le terrain.
            </p>
            {/* Desktop : CTA dans la colonne texte ; mobile : sous le
                registre (dupliqué ci-dessous). */}
            <Link
              href="/comprendre"
              className="mt-7 hidden rounded-full bg-brand-accent px-[26px] py-3 text-[15.5px] font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.15)] transition hover:bg-brand-primary-dark md:inline-block"
            >
              Voir tout
            </Link>
          </div>

          <RegistrePanel rows={registreRows} />

          <div className="-mt-4 md:hidden">
            <Link
              href="/comprendre"
              className="inline-block rounded-full bg-brand-accent px-[26px] py-3 text-[15.5px] font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.15)] transition hover:bg-brand-primary-dark"
            >
              Voir tout
            </Link>
          </div>
        </div>
      </section>

      {/* ── 02 · EXPLORER — Dolomites + cartes du terrain ──────────── */}
      <section
        id="explorer"
        className="relative scroll-mt-20 overflow-hidden px-6 py-11 md:px-16 md:pb-[88px] md:pt-24"
      >
        <Image
          src="/images/heroes/explorer-dolomites.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: "55% 38%" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, rgba(64,36,20,0.92) 0%, rgba(90,52,30,0.72) 48%, rgba(90,52,30,0.3) 100%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-[2] mx-auto max-w-6xl">
          <p className="mb-3.5 font-mono text-[13px] font-bold tracking-[0.25em] text-brand-accent-light">
            / INSTINCT
          </p>
          <h2 className="font-lora text-[40px] font-semibold italic leading-none text-white md:text-[64px]">
            Explorer
          </h2>
          <p className="mt-3.5 font-lora text-xl italic text-brand-accent-light">
            Être son propre laboratoire.
          </p>
          <p className="mt-[18px] max-w-[520px] text-[16.5px] leading-[1.7] text-white/88 text-pretty">
            Récits d&rsquo;aventures et projets au long cours : explorations en
            autonomie, saisons de trail, expérimentations. C&rsquo;est ici que
            la robustesse se développe, s&rsquo;éprouve et s&rsquo;affine.
          </p>

          <div className="mt-8 md:mt-[38px]">
            <ExplorerCarousel
              items={explorerItems}
              actions={
                <>
                  <Link
                    href="/explorer"
                    className="inline-block rounded-full border-[1.5px] border-white/70 px-[26px] py-3 text-[15.5px] font-semibold text-white transition hover:bg-white hover:text-brand-deep-dark"
                  >
                    Voir tout
                  </Link>
                  <ExplorerLiveIndicator />
                </>
              }
            />
          </div>
        </div>
      </section>

      {/* ── 03 · LE LABO — manifeste en registre (design_handoff_labo) ── */}
      <section className="bg-brand-bg px-6 py-11 md:px-16 md:pb-[76px] md:pt-[84px]">
        <div className="mx-auto max-w-[1100px]">
          <p className="text-center font-mono text-[13px] font-bold tracking-[0.25em] text-brand-slate">
            / LE LABO
          </p>
          <h2 className="mt-3 text-center font-heading text-[28px] font-bold text-brand-primary-dark md:text-[40px]">
            Ce qui anime ce labo
          </h2>

          <div className="mt-8 border-t border-black/12 md:mt-11">
            {MANIFESTE.map((row) => (
              <div
                key={row.verb}
                className="grid grid-cols-1 gap-2.5 border-b border-black/9 px-1 py-[22px] transition-colors hover:bg-white md:grid-cols-[minmax(0,1fr)_380px] md:items-center md:gap-7 md:px-2.5 md:py-[30px]"
              >
                <p className="text-[24px] font-bold leading-[1.15] text-brand-slate-dark md:text-[34px]">
                  {row.verb}{" "}
                  <span className="font-lora font-medium italic text-brand-deep">
                    {row.suite}
                  </span>
                </p>
                <p className="text-[14.5px] leading-[1.6] text-gray-700 [text-wrap:pretty]">
                  {row.texte}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-[30px] flex flex-wrap items-baseline justify-center gap-x-[26px] gap-y-3">
            <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-gray-400">
              CETTE PHILOSOPHIE EN ACTION —
            </span>
            <Link href="/quete" className={MANIFESTE_LINK_CLASS}>
              La quête →
            </Link>
            <Link href="/outils" className={MANIFESTE_LINK_CLASS}>
              Les outils →
            </Link>
            <a href="#email" className={MANIFESTE_LINK_CLASS}>
              L&rsquo;accompagnement →
            </a>
          </div>
        </div>
      </section>

      {/* ── Capture email — bande accent ────────────────────────────── */}
      <section
        id="email"
        className="scroll-mt-24 bg-brand-accent px-6 py-11 md:px-16"
      
>        <div className="mx-auto flex max-w-[1000px] flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
          <div>
            <p className="text-[21px] font-bold text-white">
              Recevoir les prochaines explorations
            </p>
            <p className="mt-1 text-[13px] italic text-white/85">
              {MICRO_PROMESSE}
            </p>
          </div>
          <div className="w-full flex-none md:max-w-[420px]">
            <EmailCapture
              variant="band"
              title={null}
              description={null}
              promise={null}
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
