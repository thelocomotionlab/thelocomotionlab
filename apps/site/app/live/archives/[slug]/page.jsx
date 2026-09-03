// app/live/archives/[slug]/page.jsx
//
// LA PAGE PERMANENTE D'UNE AVENTURE PASSÉE — le direct tel qu'on l'a suivi,
// figé, avec le badge « ARCHIVE ».
//
// Pourquoi elle existe alors que l'état « Terminé » de /live a été retiré : ce
// n'était pas la même chose. L'ancien « Terminé » était un ÉTAT de /live, donc
// unique et effacé par l'aventure suivante ; ceci est une page par aventure, à
// une URL stable, vers laquelle n'importe quel article peut pointer. Le replay
// d'une page projet (<postlivetracking>, §11) reste, lui, une carte posée DANS
// un récit — ici c'est l'écran complet : carte, profil, progression, carnet de
// bord et médias.
//
// Tout est lu dans public/replays/<slug>/, rien du VPS : une archive doit
// survivre à l'arrêt des services comme au `./track reset` suivant.

export const dynamicParams = false;

import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import LiveEnCours from "@/components/live/LiveEnCours";
import { getArchive, listArchives } from "@/lib/archives.mjs";
import { LOGO_SIZE, LOGO_URL } from "@/lib/seo";

const SITE_URL = "https://thelocomotionlab.com";

export async function generateStaticParams() {
  return listArchives().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const archive = getArchive(slug);
  if (!archive) {
    return { title: "Archive introuvable – The Locomotion Lab", robots: { index: false, follow: true } };
  }

  const url = `${SITE_URL}/live/archives/${slug}`;
  const chiffres = [
    Number.isFinite(archive.distanceKm) ? `${archive.distanceKm} km` : null,
    Number.isFinite(archive.deniveleM) ? `${archive.deniveleM} m D+` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const description =
    `${archive.nom}${archive.dates ? ` — ${archive.dates}` : ""}. ` +
    `Le direct archivé : trace, profil, progression et carnet de bord${chiffres ? ` (${chiffres})` : ""}.`;

  return {
    title: `${archive.nom} – Archive du direct`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${archive.nom} – Archive du direct`,
      description,
      url,
      type: "article",
      locale: "fr_FR",
      // Pas la carte de partage du VPS : elle représente le direct EN COURS,
      // qui n'est plus celui-ci.
      images: [{ url: LOGO_URL, width: LOGO_SIZE, height: LOGO_SIZE }],
    },
    twitter: {
      card: "summary",
      title: `${archive.nom} – Archive du direct`,
      description,
      images: [LOGO_URL],
    },
  };
}

export default async function ArchivePage({ params }) {
  const { slug } = await params;
  const archive = getArchive(slug);
  if (!archive) notFound();

  const { timer, ...aventure } = archive;

  return (
    <div className="px-4 sm:px-6 py-8">
      {/* Même gabarit que LiveEnCours (max-w-6xl) : le fil d'Ariane s'aligne
          ainsi sur le bord gauche du titre, au lieu de flotter au milieu. */}
      <Breadcrumb
        className="mx-auto mb-2 max-w-6xl"
        items={[
          { href: "/", label: "Accueil" },
          { href: "/live", label: "Live" },
          { label: archive.nom },
        ]}
      />
      <LiveEnCours timer={timer} archive={{ slug, aventure }} />
    </div>
  );
}
