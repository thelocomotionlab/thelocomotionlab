// app/outils/page.jsx
//
// Index sobre des instruments du Lab : une carte Locomotion Twin, une ligne
// sur la suite. Rien de daté, rien de promis.
import Link from "next/link";
import { Gauge } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Outils – Les instruments du labo",
  description:
    "Les instruments construits au Locomotion Lab, à commencer par le Locomotion Twin : une prédiction de temps de course calibrée sur tes propres données.",
  alternates: {
    canonical: "https://thelocomotionlab.com/outils",
  },
  openGraph: {
    title: "Outils – The Locomotion Lab",
    description:
      "Les instruments construits au Locomotion Lab, à commencer par le Locomotion Twin.",
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
      "Les instruments construits au Locomotion Lab, à commencer par le Locomotion Twin.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function OutilsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader
        kicker="/ LES INSTRUMENTS"
        title="Outils"
        tagline="les instruments du Lab"
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
          Une prédiction honnête de ton temps de course, calibrée sur tes
          propres données d&rsquo;entraînement — pas sur des moyennes.
        </p>
        <div>
          <Link
            href="/outils/twin"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
          >
            Découvrir
          </Link>
        </div>
      </article>

      <p className="mt-10 text-center text-gray-600 italic">
        D&rsquo;autres instruments sont en construction au Lab.
      </p>
    </div>
  );
}
