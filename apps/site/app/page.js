// app/page.js — refonte accueil 2026 (design_handoff_accueil)
//
// Page d'accueil en cinq actes : hero pleine hauteur → Comprendre (lavis
// bleu + registre des articles) → Explorer (photo Dolomites + cartes du
// terrain) → inventaire du labo (3 colonnes) → bande de capture email.
// Les textes et valeurs (couleurs, tailles) viennent du handoff, validés
// par Valentin ; les données (registre, cartes) du contenu Markdown.
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";

import EmailCapture, { MICRO_PROMESSE } from "@/components/EmailCapture";
import ExplorerLiveIndicator from "@/components/ExplorerLiveIndicator";
import { getRecentExplorer } from "@/lib/getRecentActivity";
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

// Le panneau reste lisible avec 4 lignes maximum ; publiés d'abord, puis
// « à paraître », puis « à venir », par date décroissante dans chaque groupe.
const REGISTRE_MAX_ROWS = 4;

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

function RegistreRow({ row, index, isLast, rowCount }) {
  const badge = REGISTRE_BADGES[row.status];
  // Mobile : registre limité à 2 lignes (README du handoff) — la dernière
  // ligne VISIBLE (mobile comme desktop) ne porte pas de séparateur.
  const isLastMobile = index === Math.min(rowCount, 2) - 1;
  const rowClassName = [
    index >= 2 ? "hidden md:flex" : "flex",
    "items-center gap-3 px-1 py-[18px] md:gap-4",
    "border-brand-primary-dark/25",
    isLastMobile ? "" : "border-b",
    isLast ? "md:border-b-0" : "md:border-b",
    // Le prototype ne met pas de hover sur la ligne estompée « À VENIR ».
    row.status === "aVenir"
      ? "opacity-55"
      : "transition-colors hover:bg-brand-primary/8",
  ].join(" ");

  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-brand-text md:text-[16.5px]">
          {row.title}
        </span>
        {row.theme ? (
          <span className="mt-[3px] block font-mono text-[11px] tracking-[0.12em] text-gray-400">
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
    <div className="rounded border border-brand-primary-dark/45 border-t-[3px] border-t-brand-primary-dark bg-white px-6 pb-6 pt-7 shadow-[0_6px_24px_rgba(0,0,0,0.1)] md:px-8 md:pb-[26px] md:pt-[30px]">
      <div className="flex items-baseline justify-between border-b-[1.5px] border-brand-primary-dark/40 pb-2.5">
        <span className="font-mono text-[11.5px] tracking-[0.2em] text-gray-400">
          REGISTRE DES ARTICLES
        </span>
        <span className="font-mono text-[11.5px] text-gray-400">
          {new Date().getFullYear()}
        </span>
      </div>

      {rows.map((row, i) => (
        <RegistreRow
          key={row.slug}
          row={row}
          index={i}
          isLast={i === rows.length - 1}
          rowCount={rows.length}
        />
      ))}

      <p className="mt-3 font-mono text-[10.5px] tracking-[0.16em] text-gray-400">
        + EN PRÉPARATION —{" "}
        <a
          href="#email"
          className="text-brand-accent-dark underline underline-offset-[3px] hover:text-brand-deep"
        >
          ÊTRE PRÉVENU·E
        </a>
      </p>
    </div>
  );
}

/* ============================
   CARTES EXPLORER (feed récits + projets)
   ============================ */

// Méta de carte : « Récit · 09/12/2025 » ou « Projet · En cours » /
// « Projet · Terminé le 30/11/2025 » (mêmes règles que le pilier /explorer).
function ExplorerCardMeta({ item }) {
  const kindLabel = item.type === "Projet" ? "Projet" : "Récit";

  let detail = null;
  if (item.type === "Projet") {
    if (item.status === "En cours") {
      detail = <span className="font-bold text-brand-accent-dark">En cours</span>;
    } else if (item.status === "Terminé" && item.completedAt) {
      detail = `Terminé le ${item.completedAt.toLocaleDateString("fr-FR")}`;
    } else {
      detail = item.status;
    }
  } else if (item.date) {
    detail = item.date.toLocaleDateString("fr-FR");
  }

  return (
    <span className="block truncate text-[10.5px] uppercase tracking-[0.1em] text-gray-400 md:mb-1">
      {kindLabel}
      {detail ? <> · {detail}</> : null}
    </span>
  );
}

// Carte : bloc vertical 250px sur desktop, ligne compacte (vignette 78×62)
// sur mobile — un seul markup, deux dispositions responsive.
function ExplorerCard({ item }) {
  return (
    <Link
      href={item.href}
      className="group flex w-full items-center gap-3 overflow-hidden rounded-[10px] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition-transform duration-200 md:block md:w-[250px] md:rounded-[14px] md:hover:-translate-y-1.5"
    >
      <span className="relative block h-[62px] w-[78px] flex-none md:h-[130px] md:w-full">
        {item.cover ? (
          <Image
            src={item.cover}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 768px) 250px, 78px"
            loading="lazy"
          />
        ) : (
          <span className="absolute inset-0 bg-brand-bg" aria-hidden="true" />
        )}
      </span>
      <span className="block min-w-0 flex-1 py-2 pr-3 md:px-4 md:pb-4 md:pt-3.5">
        <ExplorerCardMeta item={item} />
        <span className="block text-[15px] font-semibold leading-[1.3] text-brand-deep">
          {item.title}
        </span>
      </span>
    </Link>
  );
}

/* ============================
   INVENTAIRE DU LABO
   ============================ */

const INVENTAIRE = [
  {
    num: "01",
    title: "La quête",
    text: "Pourquoi la robustesse plutôt que la performance, et les règles du jeu du Lab.",
    href: "/quete",
    cta: "Lire",
  },
  {
    num: "02",
    title: "Locomotion Twin",
    text: "Le premier instrument : un plan de pacing individualisé, construit par analyse approfondie de tes données d'entraînement.",
    href: "/outils/twin",
    cta: "Découvrir",
  },
  {
    num: "03",
    title: "Le direct",
    text: "Pendant les grandes traversées : carte en direct, journal de bord et messages du terrain.",
    href: "/live",
    cta: "Suivre",
  },
];

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
  // Cartes Explorer : 3 dernières entrées du feed terrain (récits + projets).
  const explorerItems = getRecentExplorer({ limit: 3 });

  return (
    // -mb-12 : annule le mt-12 du Footer partagé pour que la bande email
    // touche directement le footer (design), sans impacter les autres pages.
    <div className="-mb-12">
      <Script
        id="json-ld-sitelinks"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── HERO — même gabarit que l'ancienne accueil (70vh) ───────── */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden pb-12 pt-10 text-center sm:min-h-[68vh] sm:pb-16 sm:pt-14 md:pb-20 md:pt-16">
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: hero.objectPosition }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(15,20,20,0.55), rgba(15,20,20,0.75))",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-[1020px] px-5 sm:px-10 md:px-20">
          <h1 className="font-heading text-[29px] font-bold leading-[1.12] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.4)] md:text-[56px]">
            Comprendre le corps comme un scientifique,
            <span className="mt-2.5 block font-lora text-[24px] font-medium italic leading-[1.15] text-brand-accent-light md:text-[46px]">
              l&rsquo;utiliser comme un animal.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-[680px] text-base leading-relaxed text-white/88 text-pretty md:text-[18.5px]">
            Explorer la robustesse physiologique comme instrument de confiance
            en soi, force et bien-être.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <Link
              href="/quete"
              className="inline-block rounded-full bg-brand-accent px-7 py-3 text-base font-semibold text-white shadow-cta transition hover:bg-brand-primary-dark"
            >
              La quête du labo
            </Link>
          </div>
        </div>

        <div
          className="absolute bottom-[22px] left-1/2 -translate-x-1/2 animate-[ll-blink_2.6s_ease-in-out_infinite] font-mono text-[11px] tracking-[0.25em] text-white/55"
          aria-hidden="true"
        >
          ↓ 01 — COMPRENDRE
        </div>
      </section>

      {/* ── 01 · COMPRENDRE — lavis bleu + registre des articles ───── */}
      <section
        id="comprendre"
        className="scroll-mt-20 bg-brand-wash bg-lab-grid-blue px-6 py-11 [background-size:28px_28px] md:px-16 md:py-24 md:[background-size:32px_32px]"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-16">
          <div>
            <p className="mb-3.5 font-mono text-[13px] tracking-[0.25em] text-brand-slate">
              / 01 — LA SCIENCE
            </p>
            <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.01em] text-brand-slate-dark md:text-[64px]">
              Comprendre
            </h2>
            <p className="mt-3.5 font-lora text-xl italic text-brand-deep">
              La science de la robustesse physiologique.
            </p>
            <p className="mt-5 max-w-[460px] text-[16.5px] leading-[1.7] text-gray-700 text-pretty">
              Des articles de fond, sourcés et vulgarisés, qui décortiquent ce
              qui rend un corps capable d&rsquo;encaisser, de s&rsquo;adapter
              et de durer — puis le traduisent en pratiques concrètes,
              éprouvées sur le terrain.
            </p>
            <Link
              href="/comprendre"
              className="mt-7 inline-block rounded-full bg-brand-accent px-[26px] py-3 text-[15.5px] font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.15)] transition hover:bg-brand-primary-dark"
            >
              Ouvrir la section →
            </Link>
          </div>

          <RegistrePanel rows={registreRows} />
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
          <p className="mb-3.5 font-mono text-[13px] tracking-[0.25em] text-brand-accent-light">
            / 02 — LE TERRAIN
          </p>
          <h2 className="font-lora text-[40px] font-semibold italic leading-none text-white md:text-[64px]">
            Explorer
          </h2>
          <p className="mt-3.5 font-lora text-xl italic text-brand-accent-light">
            Le terrain comme banc d&rsquo;essai.
          </p>
          <p className="mt-[18px] max-w-[520px] text-[16.5px] leading-[1.7] text-white/88 text-pretty">
            Récits d&rsquo;aventures et projets au long cours — traversées en
            autonomie, saisons de trail, expérimentations. C&rsquo;est ici que
            la robustesse se construit et se vérifie, une aventure à la fois.
          </p>

          <div className="mt-8 flex flex-col gap-3 md:mt-[38px] md:flex-row md:flex-wrap md:gap-5">
            {explorerItems.map((item) => (
              <ExplorerCard key={`${item.type}-${item.slug}`} item={item} />
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-5 md:mt-[34px] md:gap-[22px]">
            <Link
              href="/explorer"
              className="inline-block rounded-full border-[1.5px] border-white/70 px-[26px] py-3 text-[15.5px] font-semibold text-white transition hover:bg-white hover:text-brand-deep-dark"
            >
              Tous les récits &amp; projets →
            </Link>
            <ExplorerLiveIndicator />
          </div>
        </div>
      </section>

      {/* ── 03 · INVENTAIRE — que trouve-t-on dans ce labo ? ───────── */}
      <section className="bg-brand-bg bg-lab-grid px-6 py-11 [background-size:28px_28px] md:px-16 md:pb-[76px] md:pt-[84px] md:[background-size:32px_32px]">
        <div className="mx-auto max-w-[1000px]">
          <p className="mb-3 text-center font-mono text-xs tracking-[0.25em] text-gray-400">
            / 03 — L&rsquo;INVENTAIRE
          </p>
          <h2 className="text-center font-heading text-[28px] font-bold text-brand-primary-dark md:text-[40px]">
            Que trouve-t-on dans ce labo&nbsp;?
          </h2>

          <div className="mt-8 grid grid-cols-1 border-t border-black/12 md:mt-11 md:grid-cols-3">
            {INVENTAIRE.map((cell, i) => (
              <div
                key={cell.num}
                className={`px-[26px] pb-8 pt-[30px] transition-colors hover:bg-white ${
                  i < INVENTAIRE.length - 1
                    ? "border-b border-black/9 md:border-b-0 md:border-r md:border-r-black/9"
                    : ""
                }`}
              >
                <p className="font-mono text-xs font-bold text-brand-accent">
                  {cell.num}
                </p>
                <h3 className="mt-2.5 font-heading text-[21px] font-bold text-brand-deep">
                  {cell.title}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-[1.6] text-gray-700">
                  {cell.text}
                </p>
                <Link
                  href={cell.href}
                  className="mt-3.5 inline-block text-[14.5px] font-semibold text-brand-primary-dark transition hover:text-brand-accent-dark"
                >
                  {cell.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capture email — bande accent ────────────────────────────── */}
      <section
        id="email"
        className="scroll-mt-24 bg-brand-accent px-6 py-11 md:px-16"
      >
        <div className="mx-auto flex max-w-[1000px] flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
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
