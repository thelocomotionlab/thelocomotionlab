import { Link } from "react-router-dom";
import { BookOpen, FlaskConical, HeartHandshake, UserRound } from "lucide-react";

export default function Labo() {
  const cards = [
    {
      title: "Carnets du Labo",
      description: "Articles scientifiques et récits de course, organisés par thèmes.",
      to: "/articles",
      icon: BookOpen
    },
    {
      title: "Projets du Labo",
      description: "Explorations en cours : UTMB en sandales, Tarzan Movement, respiration × hormèse…",
      to: "/projets",
      icon: FlaskConical
    },
    {
      title: "Qui suis-je ?",
      description: "Vision, parcours, et l’identité du labo : carnet de terrain × rigueur scientifique.",
      to: "/about",
      icon: UserRound
    },
    {
      title: "Soutenir le Labo",
      description: "Stickers, boutique et futurs abonnements pour soutenir les expériences du Labo.",
      to: "/soutenir",
      icon: HeartHandshake
    }
  ];

  return (
    <main className="container mx-auto px-4 py-12">
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-4xl font-bold font-heading mb-3 text-brand-primary">Le Labo</h1>
        <p className="text-lg text-gray-700">Choisis où explorer.</p>
      </header>

      <section className="grid md:grid-cols-2 gap-6 md:gap-8">
        {cards.map(({ title, description, to, icon: Icon }) => (
          <article key={title} className="bg-white rounded-2xl shadow-card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <Icon className="text-brand-primary shrink-0" />
              <h2 className="text-2xl font-bold font-heading text-brand-deep">{title}</h2>
            </div>
            <p className="text-gray-700 mb-6 flex-1">{description}</p>
            <div>
              <Link
                to={to}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-full text-brand-accent font-semibold hover:underline"
              >
                Ouvrir →
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
