// app/page.js
//
// L'ACCUEIL, en cinq actes : hero pleine hauteur → Science (lavis bleu +
// registre des articles) → Aventures (photo + cartes de campagne) → Blog
// (les dernières entrées du carnet) → La philosophie → bande de capture email.
//
// Les trois blocs de contenu lisent le modèle : les articles publiés, les
// campagnes — chacune montrant son récit quand il existe, sa propre carte
// sinon (§8) — et le registre du Blog.
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";

import EmailCapture from "@/components/EmailCapture";
import LiveBanner from "@/components/LiveBanner";
import PhilosophieSection from "@/components/PhilosophieSection";
import { blocAventuresDeLAccueil } from "@/lib/contenu";
import { entrees as entreesDuBlog } from "@/lib/blog";
import { entrees as articlesDeScience } from "@/lib/science";
import { ETATS, chiffreDeCarte } from "@/lib/aventure";
import { dateLisible } from "@/lib/lisible";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

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
    // Une page qui déclare `openGraph` REMPLACE celui du layout, elle n'y
    // ajoute pas : sans cette ligne, l'accueil — la page la plus partagée du
    // site — sortait sans la moindre image.
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "The Locomotion Lab",
    description:
      "Comprendre le corps comme un scientifique, l'utiliser comme un animal : science, terrain et outils de la robustesse physiologique.",
    images: [OG_IMAGE],
  },
};

// TEMP: single hero only (keep structure for later)
const HEROES = [
  {
    src: "/images/heroes/hero-01.webp",
    // À réécrire EN MÊME TEMPS que `src`. L'alt a longtemps annoncé un coureur
    // en forêt au soleil couchant alors que le hero avait changé : les lecteurs
    // d'écran décrivaient une photo qui n'était plus là.
    alt: "Un pied nu prend appui sur un tronc, la main tient la branche au-dessus.",
    objectPosition: "50% 50%",
  },
];

/* ============================
   REGISTRE DES ARTICLES (section Comprendre)
   ============================ */

// Statut d'une entrée du registre, dérivé du frontmatter :
// publié → PUBLIÉ (ligne cliquable) ; brouillon teaser:true → À PARAÎTRE ;
// autre brouillon → À VENIR (ligne estompée).
const REGISTRE_MAX_ROWS = 8;

/** Les derniers articles publiés, tels que le registre les affiche. */
function getRegistreRows() {
  return articlesDeScience()
    .slice(0, REGISTRE_MAX_ROWS)
    .map((article) => ({
      slug: article.slug,
      url: article.url,
      title: article.titre,
      theme: article.themes[0] ? article.themes[0].split("-").join(" ").toUpperCase() : "",
      quand: `${article.revise ? "révisé" : "publié"} le ${dateLisible(article.date)}`,
    }));
}

function RegistreRow({ row, isLast }) {
  return (
    <Link
      href={row.url}
      className={`flex snap-start items-baseline justify-between gap-5 px-1 py-[18px] transition-colors hover:bg-brand-primary/8 ${
        isLast ? "" : "border-b border-brand-primary-dark/25"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-brand-text md:text-[16.5px]">
          {row.title}
        </span>
        {row.theme ? (
          <span className="mt-[3px] block font-mono text-xxs font-semibold tracking-etiquette text-brand-muted">
            {row.theme}
          </span>
        ) : null}
      </span>
      <span className="flex-none whitespace-nowrap font-mono text-meta text-brand-muted tabular-nums">
        {row.quand}
      </span>
    </Link>
  );
}

function RegistrePanel({ rows }) {
  return (
    <div className="rounded border border-brand-primary-dark/45 border-t-[3px] border-t-brand-primary-dark bg-white px-6 pb-6 shadow-card md:px-8 md:pb-[26px]">
      <div className="flex items-center border-b-[1.5px] border-brand-primary-dark/40 py-[18px] md:py-5">
        <span className="font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-slate-dark">
          Derniers articles
        </span>
      </div>

      <div className="ll-vscroll max-h-[248px] snap-y overflow-y-auto">
        {rows.map((row, i) => (
          <RegistreRow key={row.slug} row={row} isLast={i === rows.length - 1} />
        ))}
      </div>

      <p className="mt-3 font-mono text-meta tracking-lien">
        <a
          href="#email"
          className="text-brand-accent-ink underline underline-offset-[3px] hover:text-brand-deep-dark"
        >
          ÊTRE PRÉVENU·E DES PROCHAINES PARUTIONS
        </a>
      </p>
    </div>
  );
}

/** Une carte du bloc Aventures : le récit d'une campagne, ou la campagne. */
function CarteDAccueil({ carte }) {
  return (
    <Link
      href={carte.url}
      className="block overflow-hidden rounded-xl bg-white text-brand-text no-underline shadow-renvoi"
    >
      {carte.cover && carte.cover !== "TODO" ? (
        <div className="aspect-video overflow-hidden">
          <Image
            src={carte.cover}
            alt={carte.titre}
            width={720}
            height={405}
            className="block h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="px-5 pb-[18px] pt-4">
        <div className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
          <span className="font-bold text-brand-deep">{carte.surtitre}</span>
          {" · "}
          {ETATS[carte.etat].toLowerCase()} le {dateLisible(carte.date)}
        </div>
        <div className="mt-2 font-heading text-lg font-bold leading-snug text-brand-deep">
          {carte.titre}
        </div>
        <div className="mt-2 font-mono text-xs text-brand-soft tabular-nums">
          {carte.chiffres.join(" · ")}
        </div>
        <div className="mt-3 font-mono text-meta tracking-pastille text-brand-deep-dark">
          {carte.action}
        </div>
      </div>
    </Link>
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
      ...["Science", "Aventures", "Blog", "Services", "Labo"].map((nom) => ({
        "@type": "SiteNavigationElement",
        name: nom,
        url: `https://thelocomotionlab.com/${nom.toLowerCase()}`,
      })),
    ],
  };

  const registreRows = getRegistreRows();
  const cartesDAventure = blocAventuresDeLAccueil();
  const dernieresEntrees = entreesDuBlog().slice(0, 4);

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
            {/* Une SEULE phrase, coupée en deux lignes : le <span> est donc
                légitime ici (contrairement aux taglines de PageHeader). Le
                {" "} explicite est indispensable — sans lui, le H1 extrait
                vaut « …scientifique,l'utiliser… » (audit des titres, 08/2026). */}
            Comprendre le corps comme un scientifique,{" "}
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
              className="inline-block rounded-full bg-brand-accent px-6 py-3 font-semibold text-white shadow transition hover:bg-brand-accent-dark"
            >
              La quête du labo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Bandeau du direct — n'apparaît QUE pendant un live ─────── */}
      <LiveBanner />

      {/* ── 01 · SCIENCE — lavis bleu + registre des articles ─────── */}
      <section
        id="science"
        className="scroll-mt-20 bg-brand-wash bg-lab-grid-blue px-6 py-11 [background-size:28px_28px] md:px-16 md:py-24 md:[background-size:32px_32px]"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-16">
          <div>
            <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.01em] text-brand-slate-dark md:text-[64px]">
              Science
            </h2>
            <p className="mt-3.5 font-lora text-xl font-light not-italic text-brand-deep-dark">
              Creuser la science derrière les concepts.
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
              href="/science"
              className="mt-7 hidden rounded-full bg-brand-accent px-[26px] py-3 text-[15.5px] font-semibold text-white shadow-cta transition hover:bg-brand-accent-dark md:inline-block"
            >
              Voir tout
            </Link>
          </div>

          <RegistrePanel rows={registreRows} />

          <div className="-mt-4 md:hidden">
            <Link
              href="/science"
              className="inline-block rounded-full bg-brand-accent px-[26px] py-3 text-[15.5px] font-semibold text-white shadow-cta transition hover:bg-brand-accent-dark"
            >
              Voir tout
            </Link>
          </div>
        </div>
      </section>

      {/* ── 02 · AVENTURES — photo + cartes de campagne ───────────── */}
      <section
        id="aventures"
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
          <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.02em] text-white md:text-[64px]">
            Aventures
          </h2>
          <p className="mt-3.5 font-lora text-xl font-light not-italic text-brand-accent-light">
            Être son propre laboratoire.
          </p>
          <p className="mt-[18px] max-w-[520px] text-[16.5px] leading-[1.7] text-white/88 text-pretty">
            Récits d&rsquo;aventures et projets au long cours : explorations en
            autonomie, saisons de trail, expérimentations. Ici,
            la robustesse se développe, s&rsquo;éprouve et s&rsquo;affine.
          </p>

          {cartesDAventure.length > 0 ? (
            <div className="mt-8 grid gap-5 md:mt-[38px] md:grid-cols-2 lg:grid-cols-3">
              {cartesDAventure.map((carte) => (
                <CarteDAccueil key={carte.url} carte={carte} />
              ))}
            </div>
          ) : null}

          <div className="mt-9 flex flex-wrap items-center gap-8">
            <Link
              href="/aventures"
              className="inline-block rounded-full border-[1.5px] border-white/70 px-[26px] py-3 text-[15.5px] font-semibold text-white transition hover:bg-white hover:text-brand-deep-dark"
            >
              Voir tout
            </Link>
          </div>
        </div>
      </section>

      {/* ── 03 · BLOG — les dernières entrées du carnet ────────────── */}
      <section id="blog" className="mx-auto max-w-6xl scroll-mt-20 px-6 pt-16 md:px-16 md:pt-24">
        <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-16">
          <div>
            <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.02em] md:text-[64px]">
              Blog
            </h2>
            <p className="mt-3.5 font-lora text-xl font-light not-italic text-brand-deep-dark">
              Le carnet de bord, au jour le jour.
            </p>
            <p className="mt-5 max-w-[40ch] text-[16.5px] leading-[1.7] text-gray-700 text-pretty">
              Sorties, bilans, billets et notes de terrain : ce qui se passe au
              labo cette semaine, protocoles en cours compris.
            </p>
            <Link
              href="/blog"
              className="mt-7 inline-block rounded-full border border-brand-text px-[26px] py-3 text-[15.5px] font-semibold text-brand-text transition hover:bg-brand-text hover:text-brand-bg"
            >
              Voir tout
            </Link>
          </div>

          <div className="border-t-[1.5px] border-brand-text">
            {dernieresEntrees.map((entree) => (
              <Link
                key={entree.url}
                href={entree.url}
                className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-5 border-b border-brand-hairline py-4 text-brand-text no-underline"
              >
                <span className="font-mono text-xs text-brand-muted tabular-nums">
                  {entree.dateLisible}
                </span>
                <span className="min-w-0">
                  <span className="block font-heading font-semibold leading-snug">
                    {entree.titre}
                  </span>
                  <span className="mt-1 block font-mono text-xxs font-semibold uppercase tracking-lien text-brand-muted">
                    {entree.typeLabel}
                    {entree.note ? <span className="ml-2 text-brand-slate">● Note</span> : null}
                    {entree.protocole ? (
                      <span className="ml-2 text-brand-deep">● Protocole</span>
                    ) : null}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 04 · LA PHILOSOPHIE — grille 4 piliers / accordéon mobile ── */}
      <PhilosophieSection />

      {/* ── Capture email — bande accent ────────────────────────────── */}
      <section
        id="email"
        className="scroll-mt-24 bg-brand-accent px-6 py-11 md:px-16"
      
>        <div className="mx-auto flex max-w-[1000px] flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
          <div>
            <p className="text-[21px] font-bold text-white">
              Recevoir les nouveautés du labo
            </p>
          </div>
          <div className="w-full flex-none md:max-w-[420px]">
            <EmailCapture
              variant="band"
              title={null}
              description={null}
              promise={null}
              source="home"
              placeholder="Ton adresse e-mail"
              buttonLabel="M'inscrire"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
