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
              faisons vivre assis, au chaud l'hiver, sous la clim' l'été, sur-nourris et sous-stimulés. Cette
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
              par essence à la notion de performance à tout prix qui vise l'optimisation perpétuelle, ce 
              principe qui régit le monde Humain moderne et le rend incapable de faire face à l&rsquo;incertitude.
            </p>
          </section>

          {/* ③ La méthode : comprendre en scientifique, utiliser en animal. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              La philosophie
            </h2>
            <p>
              La robustesse se développe par essais-erreurs. Comprendre, explorer. Explorer, comprendre.
              Une boucle de rétroaction permanente entre décortiquer les concepts, lire les études, expérimenter en 
              situation réelle, douter, découvrir des pratiques de manière fortuite, les expliquer a posteriori...
              C'est la philosophie qui guide le développement de ce laboratoire théorico-expérimental, dans 
              toutes ses dimensions.
            </p>
          </section>

          {/* ④ Le laboratoire : N=1 assumé, incertitude honnête. */}
          <section>
            <h2 className="text-xl font-sans font-semibold mb-3 text-brand-deep">
              Un laboratoire accessible à tous·te·s
            </h2>
            <p>
              La vocation du Locomotion Lab est d'explorer et d'ouvrir des voies méconnues mais profondément 
              engrammées dans l'ADN Humain, et de les rendre accessible à tous·te·s pour retrouver une certaine
              concordance évolutive. La connaissance n'a jamais été aussi abondante, et il convient plus que jamais
              de se responsabiliser sur sa santé et son bien-être, pour faire face aux incertitudes de demain.
              Redevenir robustes côte-à-côte, main la main. Car seul on va plus vite, mais ensemble on va plus loin.
              Et c'est peu dire que cet adage est profondément robuste.
            </p>
          </section>

          {/* ⑤ Par où commencer : les portes d'entrée du site. */}
{/*          <section>
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
                Accompagnement (à venir)
              </Link>{" "}
              ateliers, stages, retraites,{" "}
            </p>
          </section>*/}
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
