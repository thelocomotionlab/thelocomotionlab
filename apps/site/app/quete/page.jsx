// app/quete/page.jsx
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";

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
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "La quête – The Locomotion Lab",
    description:
      "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function QuetePage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12 text-gray-800 font-sans">
      <PageHeader kicker="/ LE LABO" title="La quête" />

      {/* La formule du labo en exergue, comme une citation. */}
      <blockquote className="mb-10 border-l-[3px] border-brand-accent pl-5 font-lora text-xl italic leading-relaxed text-brand-deep md:text-[22px]">
        Comprendre le corps comme un scientifique, l&rsquo;utiliser comme un
        animal.
      </blockquote>

      <div className="font-sans text-gray-800 leading-relaxed space-y-8 text-justify hyphens-auto">
          {/* ① Le constat : la discordance évolutive. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              Le constat
            </h2>
            <p>
              Nos corps ont été façonnés par des millions d&rsquo;années de
              marche, de course, de portage et d&rsquo;inconfort, et nous les
              faisons vivre assis, au chaud, sur-nourris et sous-stimulés. Cette
              discordance évolutive entre ce pour quoi nous sommes construits et ce que
              nous vivons a un coût : des organismes fragiles, qui se retrouvent
              usés avant même d&rsquo;avoir servi.
            </p>
          </section>

          {/* ② La réponse : la robustesse ≠ la performance maximale. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              La robustesse
            </h2>
            <p>
              L&rsquo;évolution des êtres vivants, végétaux ou animaux, s&rsquo;est toujours déroulée
              dans des contextes incertains, ceux-ci devant régulièrement s&rsquo;adapter à de nouvelles
              situations comme le manque de ressources, la présence de nouveaux prédateurs,
              ou des températures inhabituelles. Cette instabilité continue a créé des organismes
              complets, à la fois adaptés, adaptables, mais aussi profondément résilients. Cette
              caractéristique a un nom, introduit par le biophysicien Olivier Hamant : la robustesse. 
              Ce concept, appliqué à la physiologie humaine, est le cœur pulsant du labo. Il s&rsquo;oppose 
              par essence à la notion de performance qui régit notre monde moderne, et visant l&rsquo;optimisation
              perpétuelle au prix de n&rsquo;être plus capable de faire face à l&rsquo;incertitude.
            </p>
          </section>

          {/* ③ La méthode : comprendre en scientifique, utiliser en animal. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              La philosophie
            </h2>
            <p>
              Pour explorer cette robustesse physiologique, il faut comprendre, mais aussi explorer.
              L&rsquo;un ne va pas sans l&rsquo;autre.
              Deux gestes complémentaires. Comprendre le corps comme un
              scientifique : lire les études, mesurer, douter, garder ce qui
              résiste à l&rsquo;examen. L&rsquo;utiliser comme un animal :
              marcher, courir, grimper, porter, avoir froid, avoir faim —
              redonner au corps les stimulus pour lesquels il est fait.
            </p>
          </section>

          {/* ④ Le laboratoire : N=1 assumé, incertitude honnête. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              Le laboratoire
            </h2>
            <p>
              Le Lab est un laboratoire vivant, avec un sujet principal : moi.
              Ce N=1 est assumé — il ne prouve rien, il explore, il illustre, il
              documente honnêtement ce qui marche et ce qui échoue.
              L&rsquo;incertitude est affichée, jamais maquillée.
            </p>
          </section>

          {/* ⑤ Par où commencer : les portes d'entrée du site. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              Par où commencer
            </h2>
            <p>
              <Link
                href="/comprendre"
                className="font-semibold text-brand-deep hover:underline"
              >
                Comprendre
              </Link>{" "}
              pour la science,{" "}
              <Link
                href="/explorer"
                className="font-semibold text-brand-deep hover:underline"
              >
                Explorer
              </Link>{" "}
              pour le terrain,{" "}
              <Link
                href="/outils/twin"
                className="font-semibold text-brand-deep hover:underline"
              >
                Locomotion Twin
              </Link>{" "}
              pour le premier outil du labo. Et pour suivre ce qui paraît
              ici, laisse ton email ci-dessous.
            </p>
          </section>
      </div>

      <div className="mt-12 max-w-2xl mx-auto text-center">
        <h2 className="text-lg font-semibold text-brand-accent mb-3">
          Recevoir les prochaines parutions
        </h2>
        <EmailCapture
          title={null}
          description={null}
          source="manifeste"
          placeholder="Votre adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </article>
  );
}
