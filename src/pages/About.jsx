import { Helmet } from "react-helmet";


export default function About() {
  return (
  <>
    <Helmet>
      <title>À propos – The Locomotion Lab</title>
      <meta
        name="description"
        content="Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine."
      />
      <link rel="canonical" href="https://thelocomotionlab.com/a-propos" />

      {/* Open Graph */}
      <meta property="og:title" content="À propos – The Locomotion Lab" />
      <meta
        property="og:description"
        content="Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine."
      />
      <meta
        property="og:image"
        content="https://thelocomotionlab.com/images/assets/og-image.jpg"
      />
      <meta property="og:url" content="https://thelocomotionlab.com/a-propos" />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="fr_FR" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="À propos – The Locomotion Lab" />
      <meta
        name="twitter:description"
        content="Découvre la vision du Locomotion Lab : un espace d’exploration de la locomotion humaine."
      />
      <meta
        name="twitter:image"
        content="https://thelocomotionlab.com/images/assets/og-image.jpg"
      />
    </Helmet>

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
            Le <strong>Locomotion Lab</strong> est un espace d'exploration de
            la locomotion humaine primordiale sous toutes ses formes : trail primal, déplacement dans les arbres,
            mouvement animal, natation, etc. La liste est longue !
          </p>
          <p className="mb-4">
            Mais aussi tout ce qui favorise la fluidité, l'endurance et la résilience
            dans le mouvement. Ceci allant de la préparation physique générale, à la nutrition, la respiration, en passant par l'exploration
            du monde de l'hormèse.
          </p>
          <p className="mb-4">
            L’objectif : relier <em> les science théoriques et expérimentales</em>, à une approche <em>consciente et explorative</em> du mouvement Humain.
          </p>
        </section>

        {/* Parcours */}
        <section className="mb-10">
          <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
            Qui suis-je ?
          </h2>
          <p className="mb-4">
            Ingénieur et docteur en mécanique des fluides, je pratique la course à pieds minimaliste depuis 2020. 
            À l'issue de ma thèse début 2023 (          
            <a
              href="https://artsetmetiers.hal.science/tel-04041476/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary hover:underline"
            >
              la consulter ici
            </a>), j'ai entrepris
            un processus introspectif de 2 ans dans la nature drômoise. C'est alors que j'ai découvert le monde de 
            l'optimisation du potentiel humain.
          </p>
          <p className="mb-4">
            Durant ces deux ans, j'ai été mon propre laboratoire d'expérimentation. Remise à plat de ma biomécanique de course,
            processus d'athlétisation spécifique à l'ultra-trail, découverte de l'exposition au froid, du parkour primal, de la nutrition. 
          </p>
          <p className="mb-4">
            Grâce à ces milliers d'heures de pratiques, d'écoutes de podcasts, d'analyses, de remise en question, de succès, d'échecs, j'ai
            pu réaliser mon premier trail, de 82 km en mars 2024. Dans la même année, s'en sont suivis deux autres courses de 92 km et 82 km. 
            À chaque fois en sandales ou chaussettes-chaussures.
          </p>
          <p className="mb-4">
            En 2025, j'ai couru le Chianti et le Lavaredo, au format 100M, toujours en sandales. Intensément marqué par ces deux expériences de très longue distance, 
            et fort d'une salve de séances de préparation mentale,
            j'ai compris qu'il était temps pour moi de partager mes connaissances, processus physiques, mentaux, et expériences passées. 
          </p>
          <p className="mb-4">
            Ce n'est qu'après plusieurs mois de réflexion que l'idée du Locomotion Lab a germé. Un espace ouvert, sans bornes et qui me ressemble.
            Un laboratoire de création, d'exploration et de partage centré autour de toutes les pratiques et découvertes qui m'animent au quotidien.
          </p>
        </section>

        {/* Identité du Labo */}
        <section>
          <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
            Organisation du labo
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Carnets du Labo</strong> : la partie articles scientifiques mêlés aux expérimentations personnelles. Approche cartésienne et exploratoire.</li>
            <li><strong>Projets</strong> : détails au fil de l'eau des expériences et projets du labo passés, en cours et à venir.</li>
            <li><strong>Soutien</strong> : moyens d’aider le Labo à perdurer et grandir.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
