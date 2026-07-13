// app/outils/twin/page.jsx
//
// Teaser du Locomotion Twin : texte seul, wordmark actuel du labo, aucun
// logo Twin (hors-scope explicite). Structure : promesse → comment ça
// marche en trois pas → statut de calibration honnête (valeurs factices
// marquées À REMPLACER) → CTA cohorte → capture email.
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  // [PROVISOIRE] Descriptions meta à affiner avec les textes définitifs (PR5).
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
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Locomotion Twin – The Locomotion Lab",
    description:
      "Un plan de pacing calibré sur tes propres données d'entraînement et validé sur tes courses passées.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function TwinTeaserPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader
        kicker="/ LES OUTILS"
        title="Locomotion Twin"
        tagline="Un estimateur de temps de course de jumeau numérique"
      />

      <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 md:p-10">

        <div className="font-sans text-gray-800 leading-relaxed">
          <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
            Comment ça marche
          </h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Tu déposes ton archive d&rsquo;entraînement (Garmin, Polar,
              Strava…) et la trace GPX de ta course cible.
            </li>
            <li>
              Le moteur construit ton jumeau physiologique et le confronte au relief réel du
              parcours via un grand nombre de simulations numériques.
            </li>
            <li>
              Tu reçois un rapport d&rsquo;analyse complet incluant un plan de pacing segment par segment, 
              et des fenêtres horaires construites sur tes propres courses passées.
            </li>
          </ol>
        </div>

        {/* Statut de calibration honnête — valeurs factices À REMPLACER. */}
        <div className="mt-8 bg-brand-bg border border-gray-200 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-brand-deep mb-2">
            Statut
          </h2>
          <p className="text-gray-700">
            L&rsquo;outil est en cours de développement. Pour participer à son élaboration et recevoir ton plan de course
            gratuit, inscris-toi dès maintenant à la cohorte de beta-testeur·euse·s !
          </p>
        </div>

        {/* CTA cohorte : message pré-rempli via ?sujet=twin sur /contact. */}
        <div className="mt-8 text-center">
          <Link
            href="/contact?sujet=twin"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
          >
            Rejoindre la cohorte de test
          </Link>
        </div>

        <div className="mt-10 max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-brand-accent mb-3">
            Pour être prévenu·e au lancement officiel
          </h2>
          <EmailCapture
            title={null}
            description={null}
            source="twin"
            placeholder="Votre adresse e-mail"
            buttonLabel="M'inscrire"
          />
        </div>
      </div>
    </article>
  );
}
