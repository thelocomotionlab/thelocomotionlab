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
import Image from "next/image";

import DonneesStructurees from "@/components/DonneesStructurees";
import EmailCapture from "@/components/EmailCapture";
import LiveBanner from "@/components/LiveBanner";
import PhilosophieSection from "@/components/PhilosophieSection";
import { Accroche } from "@locomotionlab/ui/contenu";
import { blocAventuresDeLAccueil } from "@/lib/contenu";
import { entrees as entreesDuBlog } from "@/lib/blog";
import { entrees as articlesDeScience } from "@/lib/science";
import { ETATS, chiffreDeCarte } from "@/lib/aventure";
import { dateLisible } from "@/lib/lisible";
import { OG_IMAGE, OG_IMAGES, SITE_URL } from "@/lib/seo";
import { ORGANISATION } from "@/lib/jsonld";

export const metadata = {
  title: "The Locomotion Lab",
  description:
    "Comprendre le corps comme un scientifique, l'utiliser comme un animal : le Locomotion Lab explore la robustesse physiologique — science, terrain et instruments.",
  openGraph: {
    title: "The Locomotion Lab",
    description:
      "Comprendre le corps comme un scientifique, l'utiliser comme un animal : science, terrain et outils de la robustesse physiologique.",
    url: SITE_URL,
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

function RegistreRow({ row }) {
  return (
    <Link
      href={row.url}
      className="flex items-baseline justify-between gap-5 border-b border-brand-hairline py-[15px] text-brand-text no-underline transition-colors hover:text-brand-accent-ink"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[16.5px] font-semibold leading-[1.3]">
          {row.title}
        </span>
        {row.theme ? (
          <span className="mt-1 block font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
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
    <div className="rounded-xl border border-brand-mist-line bg-brand-paper px-[30px] pb-[22px] pt-[26px] shadow-mist">
      <div className="border-b-[1.5px] border-brand-slate-dark pb-3 font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-slate-dark">
        Derniers articles
      </div>

      {rows.map((row) => (
        <RegistreRow key={row.slug} row={row} />
      ))}

      <a
        href="#email"
        className="mt-4 inline-block border-b border-brand-accent font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-accent-ink no-underline"
      >
        Être prévenu·e des prochaines parutions
      </a>
    </div>
  );
}

/** Une carte du bloc Aventures : le récit d'une campagne, ou la campagne. */
function CarteDAccueil({ carte }) {
  return (
    <Link
      href={carte.url}
      className="block w-full overflow-hidden rounded-[10px] bg-brand-paper text-brand-text no-underline shadow-vignette transition-transform duration-200 md:w-[250px] md:hover:-translate-y-1.5"
    >
      {/* La vignette est rendue même sans photo : sans elle, une carte sans
          cover se décale par rapport à ses voisines. Au format des couvertures
          — une hauteur fixe rognait la photo de moitié dès que la carte
          s'élargissait, c'est-à-dire sur tout téléphone. */}
      <div className="aspect-cover overflow-hidden bg-brand-wash">
        {carte.cover && carte.cover !== "TODO" ? (
          <Image
            src={carte.cover}
            alt={carte.titre}
            width={550}
            height={300}
            sizes="(min-width: 768px) 250px, 100vw"
            className="block h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="px-4 pb-4 pt-3">
        <div className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
          <span className="font-bold text-brand-deep">{carte.surtitre}</span>
          {" · "}
          {ETATS[carte.etat].toLowerCase()} le {dateLisible(carte.date)}
        </div>
        <div className="mt-1.5 font-heading text-[15px] font-bold leading-[1.3] text-brand-deep">
          {carte.titre}
        </div>
        <div className="mt-1.5 font-mono text-xxs text-brand-soft tabular-nums">
          {carte.chiffres.join(" · ")}
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const hero = HEROES[0];

  // Un seul graphe pour l'accueil : le site, son éditeur, et la navigation.
  // Les pages de contenu citent la même organisation par son @id.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#site`,
        name: "The Locomotion Lab",
        url: SITE_URL,
        inLanguage: "fr-FR",
        publisher: { "@id": ORGANISATION["@id"] },
      },
      ORGANISATION,
      ...["Science", "Aventures", "Blog", "Services", "Labo"].map((nom) => ({
        "@type": "SiteNavigationElement",
        name: nom,
        url: `${SITE_URL}/${nom.toLowerCase()}`,
      })),
    ],
  };

  const registreRows = getRegistreRows();
  const cartesDAventure = blocAventuresDeLAccueil();
  const dernieresEntrees = entreesDuBlog().slice(0, 4);

  return (
    // -mb-12 : annule le mt-12 du Footer partagé pour que la bande email
    // touche directement le footer, sans impacter les autres pages.
    <div className="-mb-12">
      {/* Balise rendue par le serveur, pas injectée après coup : les données
          structurées doivent être dans le HTML tel qu'il est livré. */}
      <DonneesStructurees id="accueil" donnees={jsonLd} />

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
            <span className="mt-1.5 block font-sans text-[21px] font-light not-italic leading-snug tracking-[0.012em] text-brand-accent-light sm:text-[26px] md:text-[30px]">
              l&rsquo;utiliser comme un animal.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-[680px] text-base leading-relaxed text-white/90 text-pretty sm:text-lg">
            Explorer la robustesse physiologique comme instrument de confiance
            en soi, force et bien-être.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <Link
              href="/labo#labo-quete"
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
            <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.02em] text-brand-slate-dark md:text-[64px]">
              Science
            </h2>
            <Accroche>Creuser la science derrière les concepts.</Accroche>
            <p className="mt-5 max-w-[460px] text-[16.5px] leading-[1.7] text-brand-ink text-pretty">
              Des articles de fond, sourcés et accessibles, qui décortiquent ce
              qui rend un corps capable d&rsquo;encaisser, de s&rsquo;adapter et
              de durer, puis le traduisent en pratiques concrètes, éprouvées sur
              le terrain.
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
        className="relative scroll-mt-20 overflow-hidden px-6 py-11 text-white md:px-16 md:pb-[88px] md:pt-24"
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
          className="absolute inset-0 bg-voile-aventures"
          aria-hidden="true"
        />

        <div className="relative z-[2] mx-auto max-w-6xl">
          <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.02em] text-white md:text-[64px]">
            Aventures
          </h2>
          <Accroche teinte="clair">Être son propre laboratoire.</Accroche>
          <p className="mt-[18px] max-w-[520px] text-[16.5px] leading-[1.7] text-white/88 text-pretty">
            Récits d&rsquo;aventures et projets au long cours : explorations en
            autonomie, saisons de trail, expérimentations. Ici, la robustesse se
            développe, s&rsquo;éprouve et s&rsquo;affine.
          </p>

          {cartesDAventure.length > 0 ? (
            <div className="mt-8 flex flex-wrap gap-5 md:mt-[38px]">
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
      <section id="blog" className="scroll-mt-20 px-6 pt-11 md:px-16 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-16">
            <div>
              <h2 className="font-heading text-[40px] font-bold leading-none tracking-[-0.02em] md:text-[64px]">
                Blog
              </h2>
              <Accroche>Le carnet de bord, au jour le jour.</Accroche>
              <p className="mt-5 max-w-[40ch] text-[16.5px] leading-[1.7] text-brand-ink text-pretty">
                Sorties, bilans, billets et notes de terrain : ce qui se passe
                au labo cette semaine, protocoles en cours compris.
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
                  // Une colonne sur téléphone : la date en tête, le titre sur
                  // toute la largeur. En deux colonnes, il ne restait que
                  // deux cents pixels pour le texte.
                  className="grid grid-cols-1 gap-x-5 border-b border-brand-hairline py-4 text-brand-text no-underline transition-colors hover:text-brand-accent-ink sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-baseline"
                >
                  <span className="mb-1 font-mono text-[12.5px] text-brand-muted tabular-nums sm:mb-0">
                    {entree.dateLisible}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading text-lecture font-semibold leading-[1.3]">
                      {entree.titre}
                    </span>
                    {entree.chapeau ? (
                      <span className="mt-1 block text-[15px] leading-normal text-brand-soft [text-wrap:pretty]">
                        {entree.chapeau}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 whitespace-nowrap font-mono text-xxs font-semibold uppercase tracking-lien text-brand-muted sm:col-start-3 sm:mt-0">
                    {entree.typeLabel}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 04 · LA PHILOSOPHIE — grille 4 piliers / accordéon mobile ── */}
      <PhilosophieSection />

      {/* ── Capture email — bande accent ────────────────────────────── */}
      <section
        id="email"
        className="scroll-mt-24 bg-brand-accent px-6 py-11 md:px-16"
      >
        <div className="mx-auto flex max-w-[1000px] flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
          <div>
            <p className="font-heading text-[21px] font-bold leading-[1.3] text-white">
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
