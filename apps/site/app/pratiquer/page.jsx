// app/pratiquer/page.jsx
//
// Pilier « Pratiquer » : les ateliers de mouvement primal (handoff design
// « La continuité » — option 2a desktop / 3a mobile, textes passés en Ubuntu).
// Sections : prochains ateliers (cartes + inscription, décompte vivant via
// AteliersGrid ↔ services/atelier-api), pédagogie, séance type (frise de
// principes sans timing — fil vertical en mobile), qui anime + FAQ, teaser
// accompagnement trail 2027 (inscription inline, source `pratiquer-trail`).
// Le catalogue des ateliers vit dans lib/ateliers.mjs.
import AteliersGrid from "@/components/AteliersGrid";
import PageHeader from "@/components/PageHeader";
import PhotoSlot from "@/components/PhotoSlot";
import SeanceFrise from "@/components/SeanceFrise";
import SectionHeading from "@/components/SectionHeading";
import TrailNotify from "@/components/TrailNotify";
import { listAteliers } from "@/lib/ateliers.mjs";

// ── DÉROULÉ D'UNE SÉANCE ─────────────────────────────────────────────────
// Étapes de la frise (composant SeanceFrise) : la frise tient sur UNE ligne
// en desktop quel que soit le nombre d'étapes — ajouter/retirer une entrée
// ici suffit. `heart: true` = cœur de la séance (point terracotta, colonne
// un peu plus large) ; `kicker` et `chips` restent disponibles si besoin.
// En desktop les textes sont repliés derrière un « + » ; en mobile ils
// restent visibles.
const SEANCE_STEPS = [
  { title: "Ouverture", text: "Accueil des participant·e·s." },
  { title: "Éveil", text: "Aligner corps et esprit pour la séance." },
  {
    title: "Exploration",
    text: "Quadrupédie, brachiation, mouvements dans les arbres ; inspiré des grands primates et selon la thématique du jour.",
  },
  {
    title: "Intégration collective",
    text: "Jeux à plusieurs pour consolider l’apprentissage.",
  },
  { title: "Clôture", text: "Partager ou non son expérience." },
];

// ── PHOTOS DE LA PAGE ────────────────────────────────────────────────────
// Déposer les fichiers dans apps/site/public/images/pratiquer/ puis
// renseigner les chemins ici (ex. "/images/pratiquer/portrait.webp").
// Tant qu'un chemin est vide, PhotoSlot affiche un placeholder charte.
// Les photos des CARTES ateliers se règlent dans lib/ateliers.mjs (cover).
const PHOTOS = {
  // Illustration « Le mouvement primal, c'est quoi ? » — paysage, ~1200×800.
  pedagogie: { src: "/images/pratiquer/quadru_demo.webp", alt: "Mouvement primal en extérieur" },
  // Portrait rond « Qui anime ? » — cadré carré, ~500×500.
  portrait: { src: "/images/pratiquer/portrait_val.webp", alt: "Portrait de Valentin, fondateur du Locomotion Lab" },
};

export const metadata = {
  title: "Pratiquer – Ateliers de mouvement primal",
  description:
    "Des ateliers de mouvement primal en extérieur — marcher, ramper, grimper, jouer. Gratuits pendant la phase de lancement du labo. Places limitées, inscription en ligne.",
  alternates: {
    canonical: "https://thelocomotionlab.com/pratiquer",
  },
  openGraph: {
    title: "Pratiquer – The Locomotion Lab",
    description:
      "Des ateliers de mouvement primal en extérieur — marcher, ramper, grimper, jouer. Gratuits pendant la phase de lancement du labo.",
    url: "https://thelocomotionlab.com/pratiquer",
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
    title: "Pratiquer – The Locomotion Lab",
    description:
      "Des ateliers de mouvement primal en extérieur — marcher, ramper, grimper, jouer. Gratuits pendant la phase de lancement du labo.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

export default function PratiquerPage() {
  const ateliers = listAteliers();

  return (
    // lg:px-12 : même largeur utile que Comprendre / Explorer (px-6 externe
    // + retrait interne lg:px-6 chez eux = 48 px au total).
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-12">
      <PageHeader
        kicker="/ JOUER"
        title="Pratiquer"
        tagline="Éprouver par soi-même."
        className="mb-0"
      />
      <p className="mt-4 max-w-[640px] text-base leading-[1.7] text-gray-600 md:text-lg">
        Propositions d&rsquo;ateliers de motricité primale en extérieur, pour réincarner
        l&rsquo;animal qui sommeille en toi. Gratuits pendant la phase de lancement du
        labo.
      </p>

      {/* ── Prochains ateliers ─────────────────────────────────────── */}
      <section className="mt-8 md:mt-10" aria-labelledby="ateliers">
        <SectionHeading className="mb-[18px] md:mb-6">
          <span id="ateliers">Prochains ateliers</span>
        </SectionHeading>
        {ateliers.length ? (
          <AteliersGrid ateliers={ateliers} />
        ) : (
          <p className="italic text-gray-500">
            De nouvelles dates arrivent très bientôt. 
            Écris-nous via la page contact pour être prévenu·e.
          </p>
        )}
      </section>

      {/* ── Pédagogie ──────────────────────────────────────────────── */}
      <section className="mt-11 md:mt-[72px] md:grid md:grid-cols-[1.15fr_1fr] md:items-center md:gap-12">
        <div>
          <SectionHeading className="mb-4 md:mb-[18px]">
            La motricité primale
          </SectionHeading>
          <PhotoSlot
            src={PHOTOS.pedagogie.src}
            alt={PHOTOS.pedagogie.alt}
            sizes="100vw"
            className="mb-4 h-[190px] rounded-2xl md:hidden"
          />
          <p className="mb-3 text-base leading-[1.75] text-gray-600 md:mb-3.5 md:text-[17px]">
            Nos corps ont été façonnés par des millions d&rsquo;années de
            marche, de course, de portage et de jeu au sol. Le mouvement
            primal, c'est utiliser le jeu pour renouer avec nos racines primates
            pour développer un corps robuste et fonctionnel.
          </p>
          <p className="text-base leading-[1.75] text-gray-600 md:text-[17px]">
            Il s'agit d'une pratique profondément transformatrice, tant sur le plan  mental
            que physique. Pratiquée au poids du corps, elle s'oppose à la culture de la performance
            et est accessible à tous·te·s. 
          </p>
        </div>
        <PhotoSlot
          src={PHOTOS.pedagogie.src}
          alt={PHOTOS.pedagogie.alt}
          sizes="(min-width: 768px) 480px, 100vw"
          className="hidden h-[300px] md:block"
        />
      </section>

      {/* ── Une séance type — frise de principes, sans timing ──────── */}
      <section className="mt-11 md:mt-[72px]">
        <SectionHeading>Une séance type</SectionHeading>
        <div className="mt-5 rounded-2xl bg-white bg-lab-grid p-6 shadow-card [background-size:28px_28px] md:mt-6 md:px-10 md:pb-8 md:pt-9 md:[background-size:32px_32px]">
          <SeanceFrise steps={SEANCE_STEPS} />
        </div>
      </section>

      {/* ── Qui anime + FAQ (titres sans filet : demi-colonnes) ────── */}
      <section className="mt-11 md:mt-[72px] md:grid md:grid-cols-2 md:items-start md:gap-14">
        <div>
          <h2 className="mb-3.5 font-lora text-[23px] font-medium italic text-brand-deep md:text-2xl">
            Qui anime ?
          </h2>
          <div className="flex items-start gap-4 md:gap-6">
            <PhotoSlot
              src={PHOTOS.portrait.src}
              alt={PHOTOS.portrait.alt}
              sizes="120px"
              className="h-[76px] w-[76px] flex-none rounded-full md:h-[120px] md:w-[120px]"
            />
            <div>
              <p className="mb-2.5 text-[15px] leading-[1.65] text-gray-600 md:mb-4 md:text-base md:leading-[1.7]">
                Valentin, fondateur du Locomotion Lab. Coureur minimaliste, grimpeur
                d&rsquo;arbres et expérimentateur. Les ateliers sont pour lui un moyen 
                de transmettre ses connaissances et de faire tribu en situation réelle.
              </p>
              <div className="border-l-2 border-brand-accent pl-3 md:pl-4">
                <p className="mb-1 font-mono text-[10px] font-bold tracking-[0.2em] text-brand-slate-dark md:text-[11px]">
                  EN FORMATION
                </p>
                <p className="text-[13.5px] italic leading-[1.6] text-brand-slate md:text-[15px]">
                  Licence STAPS mention Entraînement Sportif (2028)
                  <br />
                  Certification coach Tarzan Movement (2027)
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-0">
          <h2 className="mb-2.5 font-lora text-[23px] font-medium italic text-brand-deep md:mb-3.5 md:text-2xl">
            Foire aux questions
          </h2>
          <div className="flex flex-col">
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Y a-t-il un niveau sportif prérequis ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Aucun. Sauf mention contraire, les ateliers sont ouverts à tous·te·s.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Quelle tenue prévoir ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Des vêtements souples qui ne craignent pas d&rsquo;être salis. La pratique se fait
                pieds nus.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                J&rsquo;ai le vertige, ces ateliers sont-ils pour moi ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Oui car il s&rsquo;agit d&rsquo;ateliers d&rsquo;initiation. On ne monte jamais plus haut que 50 cm - 1 m,
                et même dans ce cas, rien n&rsquo;est imposé et des exercices alternatifs peuvent toujours être
                proposés.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Je peux venir accompagné·e ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Oui, dans la limite des places disponibles. Dans ce cas, il faut réaliser une inscription
                par personne participante.
              </p>
            </details>
            <details className="border-b border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Les mineurs peuvent-ils participer ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Oui, à condition d&rsquo;être accompagnés durant toute la durée de la séance par un parent ou un·e
                tuteur·ice légal·e.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ── Teaser accompagnement trail (2027) ─────────────────────── */}
      <section className="mt-9 md:mt-[72px]">
        <div className="rounded-2xl border-[1.5px] border-dashed border-brand-wash-line p-[22px] md:flex md:items-center md:justify-between md:gap-8 md:px-8 md:py-7">
          <div>
            <p className="mb-2 font-mono text-[11px] font-bold tracking-[0.18em] text-brand-primary md:text-xs">
              EN PRÉPARATION · 2027
            </p>
            <h2 className="mb-1.5 text-[17.5px] font-bold leading-[1.35] text-brand-slate-dark md:text-xl">
              Accompagnement trail & course minimaliste
            </h2>
            <p className="text-[14.5px] text-gray-500 md:text-[15px]">
              Suivi individuel à distance, retraites et immersions.
            </p>
          </div>
          <TrailNotify />
        </div>
      </section>
    </section>
  );
}
