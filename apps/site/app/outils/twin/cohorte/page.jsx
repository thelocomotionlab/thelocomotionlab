// app/outils/twin/cohorte/page.jsx
//
// Rejoindre la cohorte de calibration du Locomotion Twin (maquette
// « Recrutement cohorte », 07/2026) : les athlètes test déposent leur
// archive d'entraînement, qui sert à calibrer et valider le moteur sur
// des données réelles, puis est supprimée. Tout l'interactif (choix de
// la montre, dépôt, formulaire, envoi vers le service twin-depot du VPS)
// vit dans components/twin/CohorteForm.jsx.
import PageHeader from "@/components/PageHeader";
import CohorteForm from "@/components/twin/CohorteForm";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "Rejoindre la cohorte – Locomotion Twin",
  description:
    "Confie ton archive d'entraînement au Locomotion Lab pour calibrer le Locomotion Twin sur des données réelles, et reçois ton plan de course gratuit en échange.",
  alternates: {
    canonical: "https://thelocomotionlab.com/outils/twin/cohorte",
  },
  openGraph: {
    title: "Rejoindre la cohorte du Locomotion Twin – The Locomotion Lab",
    description:
      "Tes courses passées font avancer l'outil : dépose ton archive d'entraînement, elle calibre le moteur puis est supprimée — ton plan de course gratuit en échange.",
    url: "https://thelocomotionlab.com/outils/twin/cohorte",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rejoindre la cohorte du Locomotion Twin – The Locomotion Lab",
    description:
      "Tes courses passées font avancer l'outil : dépose ton archive d'entraînement, elle calibre le moteur puis est supprimée — ton plan de course gratuit en échange.",
    images: [OG_IMAGE],
  },
};

export default function CohortePage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <PageHeader
        title="Rejoindre la cohorte"
        tagline="Tes courses passées font avancer l'outil"
      />

      {/* Colonne de lecture large (max-w-3xl) → justifié à partir de md,
          comme /quete, /a-propos et /outils/twin (audit des titres, 08/2026). */}
      <p className="mb-9 text-[16.5px] leading-[1.65] text-gray-700 text-left hyphens-auto md:text-justify">
        Le Twin apprend sur des données réelles. En rejoignant la cohorte, tu
        me confies ton archive d&rsquo;entraînement : elle sert à calibrer et
        valider le moteur, puis elle est <strong>supprimée</strong>. En
        échange, tu recevras ton plan de course gratuit dès que ton jumeau
        sera prêt.
      </p>

      <CohorteForm />
    </article>
  );
}
