// app/quete/page.jsx
// NB : le bloc « Par où commencer » plus bas est commenté (réserve éditoriale) ;
// le ré-activer demande de ré-importer Link depuis next/link.
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
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
    <article className="max-w-3xl mx-auto px-6 py-12 font-sans">
      <PageHeader title="La quête" />

      {/* La formule du labo en exergue, comme une citation. */}
      <blockquote className="mb-10 border-l-[3px] border-brand-accent pl-5 font-lora text-xl italic leading-relaxed text-brand-deep md:text-[22px]">
        Pourquoi la robustesse plutôt que la performance.
      </blockquote>

      <div className="font-sans leading-relaxed space-y-8 text-left md:text-justify hyphens-auto">
        {/* ① Le constat : la discordance évolutive. */}
        <section>
          <SectionHeading className="mb-3">Le constat</SectionHeading>
          <p>
            Nos corps ont été façonnés par des millions d&rsquo;années de
            marche, de course, de portage et d&rsquo;inconfort, et nous les
            faisons vivre assis, au chaud l&rsquo;hiver, sous la clim
            l&rsquo;été, suralimentés et sous-stimulés. Cette discordance
            évolutive entre ce pour quoi nous sommes construits et ce que nous
            vivons a un coût : des organismes fragiles, usés avant même
            d&rsquo;avoir servi.
          </p>
        </section>

        {/* ② La réponse : la robustesse ≠ la performance maximale. */}
        <section>
          <SectionHeading className="mb-3">La robustesse</SectionHeading>
          <p>
            L&rsquo;évolution des êtres vivants, végétaux comme animaux,
            s&rsquo;est toujours déroulée dans l&rsquo;incertitude : manque de
            ressources, nouveaux prédateurs, températures inhabituelles, bactéries ou virus
            mortels... Cette instabilité permanente a forgé des organismes à la fois adaptés,
            adaptables et profondément résilients. Cette caractéristique a un
            nom : la robustesse, un concept que le biologiste Olivier Hamant a
            remis au cœur du débat (<em>Antidote au culte de la
            performance</em>, 2023), et qui, appliqué à la physiologie humaine,
            est le cœur battant du labo. Elle s&rsquo;oppose par essence à la
            performance à tout prix, cette optimisation perpétuelle qui régit
            le monde humain moderne et le rend incapable de faire face à
            l&rsquo;incertitude. La robustesse n&rsquo;est pourtant pas l&rsquo;ennemie de la
            performance. Le guépard vit en économie permanente mais reste
            capable de pointes à plus de 100 km/h pour chasser quand sa survie
            l&rsquo;exige. L&rsquo;Humain peut élever sa température corporelle à plus de 40°C
            annihiler une infection ou virus. Mais perdurer trop longtemps dans ces modes de performance
            conduit à la mort, par hyperthermie pour le guépard, et par dénaturation des enzymes pour l&rsquo;Humain.
            Voici l&rsquo;essence de la robustesse : construire un système solide, où chaque qualité est
            entretenue, et où la performance peut s&rsquo;exprimer ponctuellement, sans jamais hypothéquer
            la globalité du système.
          </p>
        </section>

        {/* ③ La méthode : comprendre en scientifique, utiliser en animal.
            Ce titre s'appelait « La philosophie », comme la section des quatre
            verbes sur l'accueil : même étiquette, deux contenus différents
            Celui-ci décrit une méthode. */}
        <section>
          <SectionHeading className="mb-3">La méthode</SectionHeading>
          <p>
            La robustesse se développe par essai-erreur. Comprendre, explorer.
            Explorer, comprendre. Une boucle de rétroaction permanente :
            décortiquer les concepts, lire les études, expérimenter en
            situation réelle, douter, découvrir des pratiques de manière
            fortuite, les expliquer a posteriori… C&rsquo;est la philosophie
            qui guide le développement de ce laboratoire théorico-expérimental,
            dans toutes ses dimensions.
          </p>
        </section>

        {/* ④ Le laboratoire  */}
        <section>
          <SectionHeading className="mb-3">
            Un laboratoire accessible à tou·te·s
          </SectionHeading>
          <p>
            La vocation du Locomotion Lab est d&rsquo;explorer et
            d&rsquo;ouvrir des voies méconnues mais profondément engrammées
            dans l&rsquo;ADN humain, et de les rendre accessibles à tou·te·s
            pour retrouver une certaine concordance évolutive. La connaissance
            n&rsquo;a jamais été aussi abondante, et il convient plus que
            jamais de se réapproprier sa santé et son bien-être pour faire face
            aux incertitudes de demain. Redevenir robustes côte à côte, main dans la main. 
            Car seul on va plus vite, mais ensemble on va plus loin. Et c&rsquo;est peu dire
            que cet adage est profondément robuste.
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
        <h2 className="text-lg font-semibold text-brand-accent-ink mb-3">
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
