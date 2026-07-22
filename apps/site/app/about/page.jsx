// app/about/page.jsx
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

export const metadata = {
  title: "À propos – The Locomotion Lab",
  description:
    "Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine.",
  alternates: {
    canonical: "https://thelocomotionlab.com/about",
  },
  openGraph: {
    title: "À propos – The Locomotion Lab",
    description:
      "Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine.",
    url: "https://thelocomotionlab.com/about",
    type: "website",
    locale: "fr_FR",
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "À propos – The Locomotion Lab",
    description:
      "Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 font-sans text-left md:text-justify hyphens-auto">
      <PageHeader kicker="/ LE LABO" title="À propos" />

      {/* Parcours */}
      <section className="mb-10">
        <SectionHeading className="mb-3">Qui suis-je ?</SectionHeading>
        <p className="mb-4">
          Ingénieur et docteur en mécanique des fluides, je pratique la course à
          pieds minimaliste depuis 2020. À l&apos;issue de ma thèse début 2023 (
          <a
            href="https://artsetmetiers.hal.science/tel-04041476/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
          >
            la consulter ici
          </a>
          ), j&apos;ai entrepris un processus introspectif de 2 ans dans la
          nature drômoise. C&apos;est alors que j&apos;ai découvert le monde de
          l&apos;optimisation du potentiel humain.
        </p>
        <p className="mb-4">
          Durant ces deux ans, j&apos;ai été mon propre laboratoire
          d&apos;expérimentation. Remise à plat de ma biomécanique de course,
          processus d&apos;athlétisation spécifique à l&apos;ultra-trail,
          découverte de l&apos;exposition au froid, du parkour primal, de la
          nutrition.
        </p>
        <p className="mb-4">
          Grâce à ces milliers d&apos;heures de pratiques, d&apos;écoutes de
          podcasts, d&apos;analyses, de remise en question, de succès,
          d&apos;échecs, j&apos;ai pu réaliser mon premier trail, de 82 km en
          mars 2024. Dans la même année, s&apos;en sont suivis deux autres
          courses de 92 km et 82 km. À chaque fois en sandales ou
          chaussettes-chaussures.
        </p>
        <p className="mb-4">
          En 2025, j&apos;ai couru le Chianti et le Lavaredo, au format 100M,
          toujours en sandales. Intensément marqué par ces deux expériences de
          très longue distance, et fort d&apos;une salve de séances de
          préparation mentale, j&apos;ai compris qu&apos;il était temps pour moi
          de partager mes connaissances, processus physiques, mentaux, et
          expériences passées.
        </p>
        <p className="mb-4">
          Ce n&apos;est qu&apos;après plusieurs mois de réflexion que l&apos;idée
          du Locomotion Lab a germé. Un espace ouvert, sans bornes et qui me
          ressemble. Un laboratoire de création, d&apos;exploration et de
          partage centré autour de toutes les pratiques et découvertes qui
          m&apos;animent au quotidien.
        </p>
      </section>

      {/* Signature */}
      <p className="mt-10 text-right font-lora text-2xl italic text-brand-deep">
        Valentin
      </p>
    </div>
  );
}
