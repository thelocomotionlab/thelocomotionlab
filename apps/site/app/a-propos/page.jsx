// app/a-propos/page.jsx
//
// Ex-/about : la seule URL en anglais parmi les piliers du site (audit des
// titres, 08/2026). Le 308 depuis /about vit dans next.config.mjs.
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import APropos from "@/components/labo/APropos";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "À propos – The Locomotion Lab",
  description:
    "Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine.",
  alternates: {
    canonical: "https://thelocomotionlab.com/a-propos",
  },
  openGraph: {
    title: "À propos – The Locomotion Lab",
    description:
      "Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine.",
    url: "https://thelocomotionlab.com/a-propos",
    type: "website",
    locale: "fr_FR",
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "À propos – The Locomotion Lab",
    description:
      "Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine.",
    images: [OG_IMAGE],
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 font-sans">
      <PageHeader title="À propos" />

      <h2 className="sr-only">Qui suis-je ?</h2>
      <APropos />

      {/* Capture email : une page à forte intention — qui la lit en entier est
          le meilleur prospect du labo. */}
      <div className="mx-auto mt-12 max-w-2xl text-center">
        <h2 className="mb-3 text-lg font-semibold text-brand-accent-ink">
          Suivre les explorations du labo
        </h2>
        <EmailCapture
          title={null}
          description={null}
          source="a-propos"
          placeholder="Ton adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </div>
  );
}
