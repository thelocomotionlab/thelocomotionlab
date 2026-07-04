// app/outils/twin/page.jsx
//
// Teaser du Locomotion Twin : texte seul, wordmark actuel du Lab, aucun
// logo Twin (hors-scope explicite). Structure : promesse → comment ça
// marche en trois pas → statut de calibration honnête (valeurs factices
// marquées À REMPLACER) → CTA cohorte → capture email.
import Link from "next/link";
import NewsletterSignup from "@/components/NewsletterSignup";

export const metadata = {
  // [PROVISOIRE] Descriptions meta à affiner avec les textes définitifs (PR5).
  title: "Locomotion Twin – Prédire ta course à partir de tes données",
  description:
    "Le Locomotion Twin estime ton jumeau physiologique depuis ton archive d'entraînement et prédit ton temps de course, avec un plan de pacing par segment.",
  alternates: {
    canonical: "https://thelocomotionlab.com/outils/twin",
  },
  openGraph: {
    title: "Locomotion Twin – The Locomotion Lab",
    description:
      "Une prédiction de temps de course calibrée sur tes propres données, validée sur tes propres courses.",
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
      "Une prédiction de temps de course calibrée sur tes propres données, validée sur tes propres courses.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function TwinTeaserPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <header className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold font-heading mb-3 text-brand-primary">
          Locomotion Twin
        </h1>
        {/* Promesse en une phrase. */}
        <p className="text-lg text-gray-700">
          <em>
            Une prédiction honnête de ton temps de course, calibrée sur tes
            propres données — pas sur des moyennes.
          </em>
        </p>
      </header>

      <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 md:p-10">
        {/* [Brief texte n°6 — 300-400 mots : structure du §4.3 du brief,
            ton honnête et factuel. Textes courants PROVISOIRES.] */}
        <p className="text-sm font-semibold text-brand-deep mb-6">
          [PROVISOIRE — texte n°6]
        </p>

        <div className="prose prose-lg max-w-none font-lora text-gray-800 leading-relaxed">
          <h2>Comment ça marche</h2>
          <ol>
            <li>
              Tu déposes ton archive d&rsquo;entraînement (Garmin, Polar,
              Strava…) et la trace GPX de ta course cible.
            </li>
            <li>
              Le moteur estime ton jumeau physiologique — vitesse critique,
              endurance, durabilité — et le confronte au relief réel du
              parcours.
            </li>
            <li>
              Tu reçois une prédiction de temps d&rsquo;arrivée validée sur
              tes propres courses passées, avec un plan de pacing par segment
              et des fenêtres horaires.
            </li>
          </ol>
        </div>

        {/* Statut de calibration honnête — valeurs factices À REMPLACER. */}
        <div className="mt-8 bg-brand-bg border border-gray-200 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-brand-deep mb-2">
            Statut de calibration
          </h2>
          <p className="text-gray-700">
            3 athlètes <span className="font-semibold">(À REMPLACER)</span> ·
            27 courses <span className="font-semibold">(À REMPLACER)</span> ·
            validation croisée sans fuite temporelle
          </p>
          <p className="mt-2 text-sm text-gray-600 italic">
            Le Twin est en cours de calibration : les chiffres ci-dessus
            grandissent avec la cohorte, et les marges d&rsquo;erreur sont
            toujours affichées avec les prédictions.
          </p>
        </div>

        {/* CTA cohorte : message pré-rempli via ?sujet=twin sur /contact. */}
        <div className="mt-8 text-center">
          <Link
            href="/contact?sujet=twin"
            className="inline-block bg-brand-accent text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-brand-primary-dark transition"
          >
            Rejoindre la cohorte de calibration
          </Link>
        </div>

        {/* Capture email — composant actuel, source="twin" en PR4. */}
        <div className="mt-10 max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-brand-accent mb-3">
            Être prévenu·e au lancement
          </h2>
          <NewsletterSignup
            title={null}
            description={null}
            placeholder="Votre adresse e-mail"
            buttonLabel="M'inscrire"
          />
        </div>
      </div>
    </article>
  );
}
