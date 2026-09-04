// app/comprendre/page.jsx
//
// Pilier « Comprendre » : la science de la robustesse physiologique.
//
// L'index est une LISTE de concepts, triée par maturité puis par date, et non
// une carte décidée d'avance. Une branche n'apparaît qu'à partir du moment où
// SEUIL_BRANCHE concepts publiés s'y rangent : en dessous, elle n'existe nulle
// part — ni titre, ni encadré, ni mot en gris. Les branches naissent donc de
// la liste, une à une, et la carte se dessine au rythme réel du contenu.
import Link from "next/link";
import CardMeta from "@/components/CardMeta";
import CarteVisuel from "@/components/CarteVisuel";
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import {
  listByKind,
  etatDe,
  BRANCHES,
  PAGE_PILIER,
  SEUIL_BRANCHE,
  ETATS,
} from "@/lib/contentRoutes.mjs";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "Comprendre – La science de la robustesse physiologique",
  description:
    "Les concepts du Locomotion Lab : le mécanisme, sa fenêtre de dose et ce qu'il fragilise — sourcés, et chacun avec sa maturité.",
  alternates: {
    canonical: "https://thelocomotionlab.com/comprendre",
  },
  openGraph: {
    title: "Comprendre – The Locomotion Lab",
    description:
      "Les concepts du Locomotion Lab : le mécanisme, sa fenêtre de dose et ce qu'il fragilise — sourcés, et chacun avec sa maturité.",
    url: "https://thelocomotionlab.com/comprendre",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Comprendre – The Locomotion Lab",
    description:
      "Les concepts du Locomotion Lab, chacun avec sa maturité : graine, pousse, établi.",
    images: [OG_IMAGE],
  },
};

// Un concept mûr passe devant : c'est le seul classement qui dise au lecteur
// où porter sa confiance en premier.
const RANG = Object.fromEntries(
  ETATS.concept.valeurs.map((v, i) => [v, ETATS.concept.valeurs.length - i])
);

function shape(e) {
  return {
    slug: e.slug,
    kind: e.kind,
    kindLabel: e.label,
    title: e.data.title || e.slug,
    date: e.data.date ? new Date(e.data.date) : null,
    cover: e.data.cover || "",
    description: e.data.description || "",
    etat: etatDe(e),
    branche: e.branche,
    rang: RANG[e.maturite] ?? 0,
  };
}

function parMaturitePuisDate(a, b) {
  if (b.rang !== a.rang) return b.rang - a.rang;
  return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
}

function getComprendre() {
  const concepts = listByKind("concept")
    .filter((e) => e.published)
    .map(shape)
    .sort(parMaturitePuisDate);

  const pilier = concepts.find((c) => c.slug === PAGE_PILIER) ?? null;
  const reste = concepts.filter((c) => c.slug !== PAGE_PILIER);

  // Une branche compte ses concepts avant d'exister.
  const effectifs = reste.reduce((acc, c) => {
    if (c.branche) acc[c.branche] = (acc[c.branche] ?? 0) + 1;
    return acc;
  }, {});
  const nees = Object.keys(BRANCHES).filter(
    (b) => (effectifs[b] ?? 0) >= SEUIL_BRANCHE
  );

  return {
    pilier,
    // Ce qui n'a pas encore de branche née reste dans la liste.
    liste: reste.filter((c) => !nees.includes(c.branche)),
    branches: nees.map((key) => ({
      key,
      label: BRANCHES[key],
      items: reste.filter((c) => c.branche === key),
    })),
  };
}

function ConceptCard({ concept }) {
  return (
    <div className="relative w-full max-w-[22rem] h-full">
      <Link
        href={`/comprendre/${concept.slug}`}
        className="group bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col"
      >
        <CarteVisuel item={concept} sizes="(min-width: 768px) 384px, 100vw" />

        <div className="p-5 flex flex-col flex-1">
          {/* Méta homogène avec les cartes du pilier Explorer. Le détail est
              la maturité : la promesse de l'atome est écrite sur sa carte. */}
          <CardMeta kind="Concept" detail={concept.etat} className="mb-1" />

          <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
            {concept.title}
          </h3>

          <div className="flex flex-1 items-center py-1">
            {concept.description ? (
              <p className="font-lora text-[15px] italic text-gray-700 line-clamp-3">
                {concept.description}
              </p>
            ) : null}
          </div>

          <div className="pt-4 text-xs text-gray-500">
            {concept.date && (
              <p>Publié le {concept.date.toLocaleDateString("fr-FR")}</p>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

function Grille({ items }) {
  return (
    <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:justify-start lg:[grid-template-columns:repeat(3,22rem)]">
      {items.map((concept) => (
        <ConceptCard key={concept.slug} concept={concept} />
      ))}
    </div>
  );
}

/** La page-pilier : une carte pleine largeur, en tête de l'index. */
function CartePilier({ concept }) {
  return (
    <Link
      href={`/comprendre/${concept.slug}`}
      className="group mb-10 block rounded-2xl border-[1.5px] border-brand-primary-dark/30 bg-white p-6 shadow-card transition-shadow hover:shadow-lg md:p-8"
    >
      <CardMeta kind="Le noyau" detail={concept.etat} className="mb-2" />
      <h2 className="mb-3 font-lora text-2xl font-medium italic text-brand-deep md:text-[28px]">
        {concept.title}
      </h2>
      {concept.description ? (
        <p className="max-w-[60ch] text-[16.5px] leading-[1.65] text-gray-700">
          {concept.description}
        </p>
      ) : null}
      <span className="mt-4 inline-block text-sm font-semibold text-brand-deep group-hover:underline">
        Entrer par le noyau
      </span>
    </Link>
  );
}

export default function ComprendrePage() {
  const { pilier, liste, branches } = getComprendre();
  const vide = !pilier && liste.length === 0 && branches.length === 0;

  return (
    <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6">
      {/* lg:px-6 : cale l'en-tête sur le bord gauche de la grille de
          cartes (colonnes de 22rem). */}
      <div className="lg:px-6">
        <PageHeader
          title="Comprendre"
          tagline="Creuser la science derrière les concepts."
        />

        {pilier ? <CartePilier concept={pilier} /> : null}

        {liste.length > 0 ? (
          <>
            {/* h2 invisible : évite le saut h1 → h3 pour les lecteurs
                d'écran quand la liste n'a pas encore de branches. */}
            <h2 className="sr-only">Les concepts</h2>
            <Grille items={liste} />
          </>
        ) : null}

        {branches.map((branche) => (
          <section key={branche.key} className={liste.length > 0 ? "mt-12" : ""}>
            <SectionHeading className="mb-6">{branche.label}</SectionHeading>
            <Grille items={branche.items} />
          </section>
        ))}

        {vide ? (
          // État vide : même encadré pointillé + capture email que l'état vide
          // de /pratiquer.
          <div className="rounded-2xl border-[1.5px] border-dashed border-brand-wash-line p-[22px] md:px-8 md:py-7">
            <p className="mb-4 max-w-[520px] text-base italic leading-[1.7] text-gray-600">
              Les premiers concepts sont à paraître. Laisse ton adresse pour
              être prévenu·e de leur publication.
            </p>
            <div className="max-w-[420px]">
              <EmailCapture
                title={null}
                description={null}
                source="comprendre-vide"
                placeholder="Ton adresse e-mail"
                buttonLabel="Me prévenir"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-14 max-w-3xl mx-auto text-center">
        <h2 className="text-lg font-semibold text-brand-accent-ink mb-3">
          Être prévenu·e des prochaines parutions
        </h2>
        <EmailCapture
          title={null}
          description={null}
          source="comprendre"
          placeholder="Ton adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </section>
  );
}
