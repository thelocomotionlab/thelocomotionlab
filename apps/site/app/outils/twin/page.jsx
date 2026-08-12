// app/outils/twin/page.jsx
//
// Teaser du Locomotion Twin (maquette « Recrutement cohorte », 07/2026) :
// promesse → comment ça marche en trois pas numérotés → statut honnête
// (l'outil se calibre sur les archives de la cohorte) → CTA vers la page
// de dépôt /outils/twin/cohorte → capture email.
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "Locomotion Twin – Calculateur de plan de course",
  description:
    "Le Locomotion Twin crée ton jumeau numérique à partir de tes données d’entraînement et construit un plan de pacing individualisé pour chacun de tes objectifs.",
  alternates: {
    canonical: "https://thelocomotionlab.com/outils/twin",
  },
  openGraph: {
    title: "Locomotion Twin – The Locomotion Lab",
    description:
      "Un plan de pacing calibré sur tes propres données d'entraînement et validé sur tes courses passées.",
    url: "https://thelocomotionlab.com/outils/twin",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Locomotion Twin – The Locomotion Lab",
    description:
      "Un plan de pacing calibré sur tes propres données d'entraînement et validé sur tes courses passées.",
    images: [OG_IMAGE],
  },
};

const ETAPES = [
  {
    numero: "01",
    titre: "Tu déposes tes données.",
    texte:
      "Ton archive d’entraînement (Garmin, Polar, Strava, Coros, Suunto) et la trace GPX de ta course cible.",
  },
  {
    numero: "02",
    titre: "Le moteur construit ton jumeau.",
    texte:
      "Ton profil physiologique est confronté au coût réel de la pente le long du parcours, via un grand nombre de simulations numériques.",
  },
  {
    numero: "03",
    titre: "Tu reçois ton rapport.",
    texte:
      "Un plan de pacing segment par segment, avec des fenêtres horaires construites sur tes propres courses passées.",
  },
];

export default function TwinTeaserPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader
        title="Locomotion Twin"
        tagline="Modélisateur de plan de course de trail par jumeau numérique"
      />

      {/* Colonne de lecture large (max-w-3xl) → paragraphes justifiés à partir
          de md, comme /quete, /a-propos et les articles. La justification est
          posée sur les PARAGRAPHES, pas sur la carte : les titres, le badge et
          les blocs centrés en dessous n'ont rien à y gagner (audit des titres,
          08/2026). */}
      <div className="bg-white rounded-2xl shadow-card p-4 sm:p-6 md:p-10">
        <p className="mb-8 text-[17px] leading-[1.65] text-brand-text text-left hyphens-auto md:text-justify">
          À partir de ton archive d&rsquo;entraînement et de la trace GPX de ta
          course cible, le Twin construit ton{" "}
          <strong >jumeau physiologique</strong>, et modélise des paramètres
          comme ta vitesse critique, ton endurance, ta durabilité, etc. Ceux-ci sont
          ensuite confrontés au tracé réel du parcours pour en déduire un plan de pacing{" "}
          ultra personnalisé.
        </p>

        <SectionHeading className="mb-6">Comment ça marche</SectionHeading>

        <div className="grid gap-5">
          {ETAPES.map((etape) => (
            <div
              key={etape.numero}
              className="grid grid-cols-[44px_1fr] items-start gap-4"
            >
              <span className="pt-px font-mono text-[22px] font-bold text-brand-accent">
                {etape.numero}
              </span>
              <p className="text-[15.5px] leading-relaxed text-gray-700 text-left hyphens-auto md:text-justify">
                <strong className="text-brand-text">{etape.titre}</strong>{" "}
                {etape.texte}
              </p>
            </div>
          ))}
        </div>

        {/* Statut honnête : l'outil se calibre sur les archives de la cohorte.
            « STATUT » est un BADGE, pas un titre : il était en <h2> et cassait
            la hiérarchie sémantique de la page (audit des titres, 08/2026). */}
        <div className="mt-8 bg-brand-bg border border-gray-200 rounded-xl p-5">
          <p className="mb-2 font-heading text-[11px] font-bold tracking-[0.18em] text-brand-slate-dark">
            STATUT
          </p>
          <p className="text-gray-700 text-left hyphens-auto md:text-justify">
            L&rsquo;outil est en cours de développement. Pour participer à son
            élaboration et recevoir ton plan de course gratuit, rejoins dès
            maintenant la cohorte de calibration : ton archive
            d&rsquo;entraînement sert à valider le moteur sur des données
            réelles.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/outils/twin/cohorte"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow-cta hover:bg-brand-accent-dark transition"
          >
            Rejoindre la cohorte de test
          </Link>
        </div>
        <div className="mt-11 border-t-[1.5px] border-brand-grid pt-8 max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-brand-accent-ink mb-3">
            Pour être prévenu·e au lancement officiel
          </h2>
          <EmailCapture
            title={null}
            description={null}
            source="twin"
            placeholder="Ton adresse e-mail"
            buttonLabel="M'inscrire"
          />
        </div>
      </div>
    </article>
  );
}
