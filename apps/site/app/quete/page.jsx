// app/quete/page.jsx
//
// Le texte de la quête vit dans components/labo/LaQuete.jsx : la section « La
// quête » du Labo rend le même composant, et il n'existe qu'un fichier source.
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import LaQuete, { ExergueDeLaQuete } from "@/components/labo/LaQuete";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "La quête – La robustesse physiologique",
  description:
    "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal — la robustesse physiologique.",
  alternates: {
    canonical: "https://thelocomotionlab.com/quete",
  },
  openGraph: {
    title: "La quête – The Locomotion Lab",
    description:
      "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal.",
    url: "https://thelocomotionlab.com/quete",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "La quête – The Locomotion Lab",
    description:
      "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal.",
    images: [OG_IMAGE],
  },
};

export default function QuetePage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 font-sans">
      <PageHeader title="La quête" />

      <div className="mb-10">
        <ExergueDeLaQuete />
      </div>

      <LaQuete />

      <div className="mx-auto mt-12 max-w-2xl text-center">
        <h2 className="mb-3 text-lg font-semibold text-brand-accent-ink">
          Recevoir les prochaines parutions ou collaborer avec le labo
        </h2>
        <EmailCapture
          title={null}
          description={null}
          source="quete"
          placeholder="Ton adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </article>
  );
}
