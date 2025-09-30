export default function About() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 text-gray-800 font-sans">
      <h1 className="text-3xl font-sans font-bold mb-8 text-brand-primary">
        À propos
      </h1>

      {/* Vision */}
      <section className="mb-10">
        <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
          Vision
        </h2>
        <p className="mb-4">
          Le <strong>Locomotion Lab</strong> est un laboratoire vivant pour explorer
          la locomotion sous toutes ses formes : course minimaliste, grimpe d’arbre,
          mouvement quadrupède, parkour primal…
        </p>
        <p>
          L’objectif : relier <em>pratique physique</em>, <em>science</em> et{" "}
          <em>expérience vécue</em>, afin de mieux comprendre comment le mouvement,
          la respiration et l’hormèse transforment notre corps et notre esprit.
        </p>
      </section>

      {/* Parcours */}
      <section className="mb-10">
        <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
          Mon parcours
        </h2>
        <p className="mb-4">
          Ingénieur et docteur en mécanique des fluides depuis 2023 (          
          <a
            href="https://artsetmetiers.hal.science/tel-04041476/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary hover:underline"
          >
            consulter ma thèse
          </a>), je suis aussi passionné par l’ultra-trail en
          sandales, le parkour et les pratiques d’hormèse (froid, chaud, respiration).
        </p>
        <p>
          Mon cheminement m’a amené à créer le Locomotion Lab : un espace pour
          expérimenter, documenter et partager mes explorations physiques et mentales.
        </p>
      </section>

      {/* Identité du Labo */}
      <section>
        <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
          Identité du Labo
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Carnets du Labo</strong> : récits et articles scientifiques.</li>
          <li><strong>Projets</strong> : expériences en cours (UTMB en sandales, Tarzan Movement, respiration-hormèse…)</li>
          <li><strong>Soutenir</strong> : moyens d’aider le Labo à grandir.</li>
        </ul>
      </section>
    </main>
  );
}
