// app/explorer/page.jsx
//
// Pilier « Explorer » : le terrain, en quatre sections — expéditions,
// protocoles, carnet, fiches. Une section vide ne s'affiche pas, et son bouton
// de filtre non plus : l'index montre ce que le labo a, jamais ce qui lui
// manque. Les items arrivent pré-formatés en chaînes du serveur.
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import ExplorerSections from "@/components/ExplorerSections";
import { listByPilier, KINDS, ORDRE_EXPLORER } from "@/lib/contentRoutes.mjs";
import { shapeEntry } from "@/lib/getRecentActivity";
import { extractCarnetNotes, parseNoteDate } from "@/lib/extractCarnetNotes";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "Explorer – Le terrain du labo",
  description:
    "Le terrain du Locomotion Lab : expéditions en autonomie, protocoles N = 1, carnets de bord et fiches de matériel.",
  alternates: {
    canonical: "https://thelocomotionlab.com/explorer",
  },
  openGraph: {
    title: "Explorer – The Locomotion Lab",
    description:
      "Le terrain du Locomotion Lab : expéditions en autonomie, protocoles N = 1, carnets de bord et fiches de matériel.",
    url: "https://thelocomotionlab.com/explorer",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explorer – The Locomotion Lab",
    description:
      "Expéditions, protocoles, carnets et fiches du Locomotion Lab.",
    images: [OG_IMAGE],
  },
};

/** Le titre de chaque section, au pluriel. */
const TITRES = {
  expedition: "Expéditions",
  protocole: "Protocoles",
  carnet: "Carnet",
  fiche: "Fiches",
};

/**
 * Les deux dernières notes d'un carnet, les plus récentes d'abord : c'est ce
 * que sa carte affiche à la place d'une date de publication.
 */
function dernieresNotes(slug) {
  return [...extractCarnetNotes(slug)]
    .sort(
      (a, b) =>
        (parseNoteDate(b.date)?.getTime() ?? 0) -
        (parseNoteDate(a.date)?.getTime() ?? 0)
    )
    .slice(0, 2);
}

function shapeForClient(item) {
  return {
    slug: item.slug,
    href: item.href,
    title: item.title,
    description: item.description,
    cover: item.cover,
    kindLabel: item.kindLabel,
    // L'état de l'atome quand il en a un (« Éprouvé »), sa date sinon.
    detail: item.etat,
    dateLabel:
      item.kind !== "carnet" && item.date
        ? `Publié le ${item.date.toLocaleDateString("fr-FR")}`
        : null,
    notes: item.kind === "carnet" ? dernieresNotes(item.slug) : [],
  };
}

function getSections() {
  const publies = listByPilier("explorer").filter((e) => e.published);

  return ORDRE_EXPLORER.map((kind) => ({
    key: kind,
    label: TITRES[kind] ?? KINDS[kind].label,
    // Repliée par défaut : on arrive sur une fiche depuis son parent, depuis
    // la recherche ou depuis la légende d'un post — pas en balayant l'index.
    replie: kind === "fiche",
    items: publies
      .filter((e) => e.kind === kind)
      .map(shapeEntry)
      .sort(
        (a, b) => (b.activite?.getTime() ?? 0) - (a.activite?.getTime() ?? 0)
      )
      .map(shapeForClient),
  })).filter((section) => section.items.length > 0);
}

export default function ExplorerPage() {
  const sections = getSections();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* lg:px-6 : cale l'en-tête et les titres de sections sur le bord
          gauche des grilles de cartes (colonnes de 22rem). */}
      <div className="lg:px-6">
        <PageHeader title="Explorer" tagline="Être son propre laboratoire." />

        {/* L'indicateur live compact vit dans la rangée de filtres
            d'ExplorerSections (même source d'état que la page /live). */}
        <ExplorerSections sections={sections} />

        <div className="mt-14 max-w-3xl mx-auto text-center">
          <h2 className="mb-3 text-lg font-semibold text-brand-accent-ink">
            Être prévenu·e des prochaines explorations
          </h2>
          <EmailCapture
            title={null}
            description={null}
            source="explorer"
            placeholder="Ton adresse e-mail"
            buttonLabel="M'inscrire"
          />
        </div>
      </div>
    </div>
  );
}
