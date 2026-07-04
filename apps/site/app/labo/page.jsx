// app/labo/page.jsx
import Link from "next/link";
import {
  BookOpen,
  FlaskConical,
  HeartHandshake,
  UserRound,
} from "lucide-react";

export const metadata = {
  title: "Le Labo – The Locomotion Lab",
  description:
    "Découvre les espaces du Locomotion Lab : comprendre, explorer et soutenir. Un laboratoire vivant d'exploration de la locomotion et du potentiel humain.",
  alternates: {
    canonical: "https://thelocomotionlab.com/labo",
  },
  openGraph: {
    title: "Le Labo – The Locomotion Lab",
    description:
      "Découvre les espaces du Locomotion Lab : comprendre, explorer et soutenir.",
    url: "https://thelocomotionlab.com/labo",
    type: "website",
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Le Labo – The Locomotion Lab",
    description:
      "Découvre les espaces du Locomotion Lab : comprendre, explorer et soutenir.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

const cards = [
  {
    title: "Comprendre",
    description:
      "La science de la robustesse physiologique : articles de fond sourcés et vulgarisés.",
    href: "/comprendre",
    icon: BookOpen,
  },
  {
    title: "Explorer",
    description:
      "Le terrain : récits d'aventures et projets au long cours.",
    href: "/explorer",
    icon: FlaskConical,
  },
  {
    title: "Qui suis-je ?",
    description: "Vision, parcours et identité du labo.",
    href: "/about",
    icon: UserRound,
  },
  {
    title: "Soutenir le Labo",
    description:
      "Financer les expérimentations, le matériel et la création de contenu.",
    href: "/soutenir",
    icon: HeartHandshake,
  },
];

export default function LaboPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-4xl font-bold font-heading mb-3 text-brand-primary">
          Le Labo
        </h1>
        <p className="text-lg text-gray-700">
          <em>Choisis où explorer.</em>
        </p>
      </header>

      <section className="grid md:grid-cols-2 gap-6 md:gap-8">
        {cards.map(({ title, description, href, icon: Icon }) => (
          <article
            key={title}
            className="bg-white rounded-2xl shadow-card p-6 flex flex-col transform transition duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1"
          >
            <div className="flex items-center gap-3 mb-3">
              <Icon className="text-brand-primary shrink-0" />
              <Link href={href}>
                <h2 className="text-2xl font-bold font-heading text-brand-deep hover:underline">
                  {title}
                </h2>
              </Link>
            </div>
            <p className="text-gray-700 mb-6 flex-1">{description}</p>
            <div>
              <Link
                href={href}
                className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
              >
                Ouvrir
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
