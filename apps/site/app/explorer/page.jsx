// app/explorer/page.jsx
//
// Pilier « Explorer » : le terrain, en deux grammaires.
//
// Ce qui a une photo se montre en CARTE : les expéditions, l'année du carnet.
// Ce qui n'en a pas se montre en REGISTRE : les protocoles, les dernières notes
// du carnet, les fiches. Une section vide ne s'affiche pas, et son bouton de
// filtre non plus. Tout est pré-formaté ici, en chaînes, pour la coque client
// qui porte le filtre (ExplorerSections).
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import ExplorerSections from "@/components/ExplorerSections";
import {
  listEntries,
  listByPilier,
  routeFor,
} from "@/lib/contentRoutes.mjs";
import { itemRegistre, indexParSlug } from "@/lib/registre.mjs";
import { dateActivite } from "@/lib/getRecentActivity";
import {
  extractCarnetNotes,
  parseNoteDate,
  resumeDeNote,
  liensDeNote,
} from "@/lib/extractCarnetNotes";
import { titresDe } from "@/lib/extractToc";
import { getArchive } from "@/lib/archives.mjs";
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

const parDateDesc = (a, b) =>
  (new Date(b.data.date).getTime() || 0) - (new Date(a.data.date).getTime() || 0);

function nombre(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) ? n.toLocaleString("fr-FR") : null;
}

/** Ce qu'une page d'expédition contient, tel que sa carte l'annonce. */
function contenusDe(entry, publies) {
  const contenus = [];
  if (entry.content.split(/\s+/).length > 200) contenus.push("Récit");
  const aDesFiches =
    entry.fiches.length > 0 ||
    publies.some((e) => e.kind === "fiche" && e.parent === entry.slug);
  if (aDesFiches) contenus.push("Paquetage");
  if (getArchive(entry.archive ?? entry.slug)) contenus.push("Live");
  else if (/<postlivetracking/i.test(entry.content)) contenus.push("Replay");
  return contenus;
}

function carteExpedition(entry, publies) {
  return {
    slug: entry.slug,
    href: routeFor(entry),
    title: entry.data.title ?? entry.slug,
    cover: entry.data.cover ?? "",
    kindLabel: entry.label,
    detail: "Terminée",
    distanceKm: nombre(entry.data.distanceKm),
    deniveleM: nombre(entry.data.deniveleM),
    duree: entry.data.duree ?? null,
    dates: entry.data.dates ?? null,
    resume: entry.data.description ?? "",
    contenus: contenusDe(entry, publies),
  };
}

/** Le libellé court d'un atome pointé depuis une note : « Paquetage », pas
 *  « Paquetage — tour des Écrins 2026 ». */
function libelleCourt(entry) {
  const titre = entry.data.title ?? entry.slug;
  return entry.kind === "fiche" ? titre.split(" — ")[0] : titre;
}

function carnetEtNotes(carnets, parSlug) {
  if (!carnets.length) return null;
  const [courant, ...autres] = carnets;
  const annee = new Date(courant.data.date).getFullYear();
  const notes = extractCarnetNotes(courant.slug);
  const ancres = new Map(titresDe(courant.content).map((h) => [h.text, h.id]));
  const href = routeFor(courant);

  return {
    carte: {
      slug: courant.slug,
      href,
      title: courant.data.title ?? courant.slug,
      cover: courant.data.cover ?? "",
      kindLabel: courant.label,
      detail: annee >= new Date().getFullYear() ? "En cours" : "Fermé",
      resume: courant.data.description ?? "",
      nbNotes: notes.length,
      annee,
      autres: autres.map((c) => ({
        href: routeFor(c),
        title: `Carnet ${new Date(c.data.date).getFullYear()}`,
      })),
    },
    notes: [...notes]
      .filter((n) => n.date)
      .sort(
        (a, b) =>
          (parseNoteDate(b.date)?.getTime() ?? 0) -
          (parseNoteDate(a.date)?.getTime() ?? 0)
      )
      .slice(0, 3)
      .map((n) => ({
        date: n.date,
        title: n.title,
        href: ancres.has(n.title) ? `${href}#${ancres.get(n.title)}` : href,
        resume: resumeDeNote(n.corps),
        liens: liensDeNote(n.corps)
          .map((l) => {
            const cible = parSlug.get(l.href.split("/").pop());
            return cible ? { href: l.href, label: libelleCourt(cible) } : null;
          })
          .filter(Boolean),
      })),
  };
}

function getExplorer() {
  const publies = listByPilier("explorer").filter((e) => e.published);
  const parSlug = indexParSlug(listEntries().filter((e) => e.published));
  const parSorte = (kind) => publies.filter((e) => e.kind === kind);

  const carnets = parSorte("carnet").sort(
    (a, b) => (dateActivite(b)?.getTime() ?? 0) - (dateActivite(a)?.getTime() ?? 0)
  );

  return {
    expeditions: parSorte("expedition")
      .sort(parDateDesc)
      .map((e) => carteExpedition(e, publies)),
    protocoles: parSorte("protocole")
      .sort(parDateDesc)
      .map((e) => itemRegistre(e, parSlug)),
    carnet: carnetEtNotes(carnets, parSlug),
    fiches: parSorte("fiche")
      .sort(parDateDesc)
      .map((e) => itemRegistre(e, parSlug)),
  };
}

export default function ExplorerPage() {
  const donnees = getExplorer();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="lg:px-6">
        <PageHeader title="Explorer" tagline="Être son propre laboratoire." />

        {/* L'indicateur live compact vit dans la rangée de filtres
            d'ExplorerSections (même source d'état que la page /live). */}
        <ExplorerSections {...donnees} />

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
