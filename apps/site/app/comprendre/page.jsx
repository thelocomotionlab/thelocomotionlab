// app/comprendre/page.jsx
//
// Pilier « Comprendre » : la science de la robustesse physiologique.
//
// Un concept n'a pas de photo : il se montre en REGISTRE — une ligne par
// entrée, sous des titres de branche. Une branche n'apparaît qu'à partir du
// moment où SEUIL_BRANCHE concepts publiés s'y rangent ; en dessous, elle
// n'existe nulle part, et ses concepts vivent sous « Dernières graines ». Les
// branches naissent donc de la liste, une à une, au rythme réel du contenu.
//
// En tête, quand elle est publiée, la page-pilier : la seule entrée qui ait
// droit à une carte, parce qu'elle relie toutes les autres.
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import Registre from "@/components/Registre";
import {
  listByKind,
  routeFor,
  BRANCHES,
  PAGE_PILIER,
  SEUIL_BRANCHE,
  ETATS,
} from "@/lib/contentRoutes.mjs";
import { itemRegistre, indexParSlug } from "@/lib/registre.mjs";
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

function parMaturitePuisDate(a, b) {
  const ra = RANG[a.maturite] ?? 0;
  const rb = RANG[b.maturite] ?? 0;
  if (rb !== ra) return rb - ra;
  return (
    (new Date(b.data.date).getTime() || 0) -
    (new Date(a.data.date).getTime() || 0)
  );
}

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

function getComprendre() {
  const concepts = listByKind("concept")
    .filter((e) => e.published)
    .sort(parMaturitePuisDate);
  const parSlug = indexParSlug(concepts);

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
    pilier: pilier
      ? {
          href: routeFor(pilier),
          title: pilier.data.title,
          resume: pilier.data.description,
        }
      : null,
    branches: nees.map((key) => ({
      key,
      label: BRANCHES[key],
      items: reste
        .filter((c) => c.branche === key)
        .map((c) => itemRegistre(c, parSlug)),
    })),
    // Ce qui n'a pas encore de branche née reste dans la liste.
    graines: reste
      .filter((c) => !nees.includes(c.branche))
      .map((c) => itemRegistre(c, parSlug)),
  };
}

/** La page-pilier : la seule carte de l'index, sur la grille de labo. */
function CartePilier({ pilier }) {
  return (
    <Link
      href={pilier.href}
      className="ll-grille-labo group mb-10 grid grid-cols-1 items-center gap-x-8 gap-y-3 rounded-xl border border-brand-hairline bg-white px-6 py-5 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div>
        <p className="mb-1.5 font-heading text-[11px] font-bold uppercase tracking-[0.14em] text-brand-slate-dark">
          Commencer ici
        </p>
        <h2 className="mb-1.5 text-[22px] font-semibold leading-tight text-brand-deep">
          {pilier.title}
        </h2>
        {pilier.resume ? (
          <p className="max-w-[58ch] font-lora text-[15.5px] italic text-gray-600">
            {pilier.resume}
          </p>
        ) : null}
      </div>
      <span className="whitespace-nowrap text-sm font-bold text-brand-accent-ink group-hover:underline">
        Lire →
      </span>
    </Link>
  );
}

export default function ComprendrePage() {
  const { pilier, branches, graines } = getComprendre();
  const vide = !pilier && branches.length === 0 && graines.length === 0;

  return (
    <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6">
      <div className="lg:px-6">
        <PageHeader
          title="Comprendre"
          tagline="Creuser la science derrière les concepts."
        />

        {pilier ? <CartePilier pilier={pilier} /> : null}

        {branches.map((branche) => (
          <section key={branche.key} className="mt-9">
            <SectionHeading
              className="mb-1.5"
              aside={pluriel(branche.items.length, "concept")}
            >
              {branche.label}
            </SectionHeading>
            <Registre items={branche.items} pilier="comprendre" />
          </section>
        ))}

        {graines.length > 0 ? (
          <section className="mt-9">
            <SectionHeading className="mb-1.5" aside="sans branche encore">
              Dernières graines
            </SectionHeading>
            <Registre items={graines} pilier="comprendre" />
          </section>
        ) : null}

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
