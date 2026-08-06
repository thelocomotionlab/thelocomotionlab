// app/outils/page.jsx
//
// Index sobre des outils du labo : une carte Locomotion Twin, une ligne
// sur la suite. Rien de daté, rien de promis.
import Link from "next/link";
import { Gauge } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Outils – Les instruments du labo",
  description:
    "Les outils construits au Locomotion Lab, à commencer par le Locomotion Twin : une prédiction de temps de course calibrée sur tes propres données.",
  alternates: {
    canonical: "https://thelocomotionlab.com/outils",
  },
  openGraph: {
    title: "Outils – The Locomotion Lab",
    description:
      "Les outils construits au Locomotion Lab, à commencer par le Locomotion Twin.",
    url: "https://thelocomotionlab.com/outils",
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
    title: "Outils – The Locomotion Lab",
    description:
      "Les outils construits au Locomotion Lab, à commencer par le Locomotion Twin.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function OutilsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader
        kicker="/ LES OUTILS"
        title="Outils"
        tagline="Les instruments du labo."
      />

      <article className="bg-white rounded-2xl shadow-card p-6 flex flex-col transform transition duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
        <div className="flex items-center gap-3 mb-3">
          <Gauge className="text-brand-primary shrink-0" aria-hidden="true" />
          <Link href="/outils/twin">
            <h2 className="text-2xl font-bold font-heading text-brand-deep hover:underline">
              Locomotion Twin
            </h2>
          </Link>
        </div>
        <p className="text-gray-700 mb-6 flex-1">
          Un calculateur de plan de course de trail basé sur la data analyse de 
          tes propres données d&rsquo;entraînement.
        </p>
        <div>
          <Link
            href="/outils/twin"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta hover:bg-brand-accent-dark"
          >
            Découvrir
          </Link>
        </div>
      </article>

    </div>
  );
}
