// app/manifeste/page.jsx
//
// Le Manifeste : la quête du Lab — la robustesse physiologique. Page longue
// en prose (mêmes classes typographiques que les corps d'articles), 5
// sections structurées. Corps [PROVISOIRE — texte n°2] : plan visible,
// textes provisoires, briefs en commentaires — Valentin écrira la version
// définitive (1 200 – 1 800 mots).
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";

export const metadata = {
  // [PROVISOIRE] Descriptions meta à affiner avec les textes définitifs (PR5).
  title: "Manifeste – La robustesse physiologique",
  description:
    "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal. Le manifeste de la robustesse physiologique.",
  alternates: {
    canonical: "https://thelocomotionlab.com/manifeste",
  },
  openGraph: {
    title: "Manifeste – The Locomotion Lab",
    description:
      "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal.",
    url: "https://thelocomotionlab.com/manifeste",
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
    title: "Manifeste – The Locomotion Lab",
    description:
      "La quête du Locomotion Lab : comprendre le corps comme un scientifique, l'utiliser comme un animal.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function ManifestePage() {
  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold font-heading mb-3 text-brand-primary">
          Manifeste
        </h1>
        <p className="text-lg text-gray-700">
          <em>
            Comprendre le corps comme un scientifique, l&rsquo;utiliser comme
            un animal.
          </em>
        </p>
      </header>

      <div className="bg-white rounded-xl shadow-card p-4 sm:p-6 md:p-10">
        {/* [Brief texte n°2 — 1 200-1 800 mots : les 5 sections ci-dessous.
            Les textes courants sont PROVISOIRES : ils posent le plan et le
            ton, la version définitive est à écrire par Valentin.] */}
        <p className="text-sm font-semibold text-brand-deep mb-8">
          [PROVISOIRE — texte n°2]
        </p>

        <div
          className="
            prose prose-lg max-w-none
            font-lora text-gray-800 leading-relaxed
            text-left md:text-justify
          "
        >
          {/* ① Le constat : la discordance évolutive. */}
          <h2>Le constat</h2>
          <p>
            Nos corps ont été façonnés par des millions d&rsquo;années de
            marche, de course, de portage et d&rsquo;inconfort — et nous les
            faisons vivre assis, au chaud, sur-nourris et sous-stimulés. Cette
            discordance entre ce pour quoi nous sommes construits et ce que
            nous vivons a un coût : des organismes fragiles, qui s&rsquo;usent
            sans avoir servi.
          </p>

          {/* ② La réponse : la robustesse ≠ la performance maximale. */}
          <h2>La réponse : la robustesse</h2>
          <p>
            La réponse du Lab n&rsquo;est pas la performance maximale — un
            sommet étroit, coûteux et fragile — mais la robustesse
            physiologique : un corps capable d&rsquo;encaisser, de
            s&rsquo;adapter et de durer. Être robuste, c&rsquo;est élargir la
            base plutôt que rehausser la pointe.
          </p>

          {/* ③ La méthode : comprendre en scientifique, utiliser en animal. */}
          <h2>La méthode</h2>
          <p>
            Deux gestes complémentaires. Comprendre le corps comme un
            scientifique : lire les études, mesurer, douter, garder ce qui
            résiste à l&rsquo;examen. L&rsquo;utiliser comme un animal :
            marcher, courir, grimper, porter, avoir froid, avoir faim —
            redonner au corps les stimulus pour lesquels il est fait.
          </p>

          {/* ④ Le laboratoire : N=1 assumé, incertitude honnête. */}
          <h2>Le laboratoire</h2>
          <p>
            Le Lab est un laboratoire vivant, avec un sujet principal : moi.
            Ce N=1 est assumé — il ne prouve rien, il explore, il illustre, il
            documente honnêtement ce qui marche et ce qui échoue.
            L&rsquo;incertitude est affichée, jamais maquillée.
          </p>

          {/* ⑤ Par où commencer : les portes d'entrée du site. */}
          <h2>Par où commencer</h2>
          <p>
            <Link href="/comprendre">Comprendre</Link> pour la science,{" "}
            <Link href="/explorer">Explorer</Link> pour le terrain,{" "}
            <Link href="/outils/twin">Locomotion Twin</Link> pour le premier
            instrument du Lab. Et pour suivre ce qui paraît ici, laisse ton
            email ci-dessous.
          </p>
        </div>

        <div className="mt-10 max-w-2xl mx-auto text-center">
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
      </div>
    </article>
  );
}
