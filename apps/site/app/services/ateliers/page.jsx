// app/services/ateliers/page.jsx
//
// LES ATELIERS DE MOTRICITÉ PRIMALE — la page de l'ancienne rubrique
// « Pratiquer », remise en service sous /services.
//
// Sections : prochains ateliers (cartes + inscription, décompte vivant via
// AteliersGrid ↔ services/atelier-api), pédagogie, séance type (frise de
// principes sans timing — fil vertical en mobile), qui anime + FAQ, teaser
// accompagnement trail 2027 (inscription inline, source `pratiquer-trail`).
// Le catalogue des ateliers vit dans lib/ateliers.mjs.

import Link from "next/link";

import AteliersGrid from "@/components/AteliersGrid";
import EmailCapture from "@/components/EmailCapture";
import PhotoSlot from "@/components/PhotoSlot";
import SeanceFrise from "@/components/SeanceFrise";
import SectionHeading from "@/components/SectionHeading";
import TrailNotify from "@/components/TrailNotify";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { listAteliers } from "@/lib/ateliers.mjs";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

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
  // Illustration « La motricité primale » — paysage, ~1200×800.
  pedagogie: { src: "/images/pratiquer/quadru_demo.webp", alt: "Mouvement primal en extérieur" },
  // Portrait rond « Qui anime ? » — cadré carré, ~500×500.
  portrait: {
    src: "/images/pratiquer/portrait_val.webp",
    alt: "Portrait de Valentin, fondateur du Locomotion Lab",
  },
};

export const metadata = {
  title: "Ateliers de motricité primale",
  description:
    "Des ateliers de motricité primale en extérieur — marcher, ramper, grimper, jouer. Gratuits pendant la phase de lancement du labo. Places limitées, inscription en ligne.",
  alternates: {
    canonical: "https://thelocomotionlab.com/services/ateliers",
  },
  openGraph: {
    title: "Ateliers de motricité primale – The Locomotion Lab",
    description:
      "Des ateliers de motricité primale en extérieur — marcher, ramper, grimper, jouer. Gratuits pendant la phase de lancement du labo.",
    url: "https://thelocomotionlab.com/services/ateliers",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ateliers de motricité primale – The Locomotion Lab",
    description:
      "Des ateliers de motricité primale en extérieur — marcher, ramper, grimper, jouer. Gratuits pendant la phase de lancement du labo.",
    images: [OG_IMAGE],
  },
};

export default function AteliersPage() {
  const ateliers = listAteliers();

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 pb-6 md:px-8">
      <FilDAriane
        maillons={[
          { href: "/services", label: "Services" },
          { label: "Ateliers de motricité primale" },
        ]}
      />

      <header className="mt-7">
        <div className="flex flex-wrap items-center gap-3 font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
          <span className="font-bold text-brand-deep">Sur le terrain</span>
          <span className="rounded-full border border-brand-gauge-full px-3 py-0.5 tracking-pastille text-brand-soft">
            {ateliers.length > 0
              ? `${ateliers.length} date${ateliers.length > 1 ? "s" : ""} ouverte${ateliers.length > 1 ? "s" : ""}`
              : "Aucune date ouverte"}
          </span>
        </div>

        <h1 className="mt-4 font-heading text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-deep md:text-[42px]">
          Ateliers de motricité primale
        </h1>
        <p className="m-0 mt-3.5 max-w-[46ch] font-sans text-xl font-light leading-snug text-brand-deep-dark [text-wrap:pretty]">
          Éprouver par soi-même.
        </p>
        <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
      </header>

      <p className="mt-8 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-ink [text-wrap:pretty]">
        Propositions d&rsquo;ateliers de motricité primale en extérieur, pour réincarner
        l&rsquo;animal qui sommeille en toi. Gratuits pendant la phase de lancement du labo.
      </p>

      {/* ── Prochains ateliers ─────────────────────────────────────── */}
      <section className="mt-8 md:mt-10" aria-labelledby="ateliers">
        <SectionHeading className="mb-[18px] md:mb-6">
          <span id="ateliers">Prochains ateliers</span>
        </SectionHeading>
        {ateliers.length ? (
          <AteliersGrid ateliers={ateliers} />
        ) : (
          // État vide : il renvoyait vers /contact — et même pas par un lien,
          // c'était du texte brut. Une fuite d'entonnoir sur la seule page où
          // l'intention est explicite (audit des titres, 08/2026).
          <div
            id="prevenir"
            className="scroll-mt-24 rounded-xl border-[1.5px] border-dashed border-brand-wash-line p-[22px] md:px-8 md:py-7"
          >
            <p className="mb-4 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-soft">
              De nouvelles dates arrivent très bientôt. Laisse ton adresse pour être prévenu·e de
              l&rsquo;ouverture des inscriptions.
            </p>
            <div className="max-w-[420px]">
              <EmailCapture
                title={null}
                description={null}
                source="pratiquer-ateliers"
                placeholder="Ton adresse e-mail"
                buttonLabel="Me prévenir"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Pédagogie ──────────────────────────────────────────────── */}
      <section className="mt-11 md:mt-[72px] md:grid md:grid-cols-[1.15fr_1fr] md:items-center md:gap-12">
        <div>
          <SectionHeading className="mb-4 md:mb-[18px]">La motricité primale</SectionHeading>
          <PhotoSlot
            src={PHOTOS.pedagogie.src}
            alt={PHOTOS.pedagogie.alt}
            sizes="100vw"
            className="mb-4 h-[190px] rounded-xl md:hidden"
          />
          <p className="mb-3 font-sans text-lecture font-lecture leading-lecture text-brand-ink md:mb-3.5">
            Nos corps ont été façonnés par des millions d&rsquo;années de marche, de course, de
            portage et de jeu au sol. Le mouvement primal, c&rsquo;est utiliser le jeu pour renouer
            avec nos racines primates pour développer un corps robuste et fonctionnel.
          </p>
          <p className="font-sans text-lecture font-lecture leading-lecture text-brand-ink">
            Il s&rsquo;agit d&rsquo;une pratique profondément transformatrice, tant sur le plan
            mental que physique. Pratiquée au poids du corps, elle s&rsquo;oppose à la culture de la
            performance et est accessible à tous·te·s.
          </p>
        </div>
        <PhotoSlot
          src={PHOTOS.pedagogie.src}
          alt={PHOTOS.pedagogie.alt}
          sizes="(min-width: 768px) 480px, 100vw"
          className="hidden h-[300px] rounded-xl md:block"
        />
      </section>

      {/* ── Une séance type — frise de principes, sans timing ──────── */}
      <section className="mt-11 md:mt-[72px]">
        <SectionHeading>Une séance type</SectionHeading>
        <div className="mt-5 rounded-xl border border-brand-hairline bg-brand-paper bg-lab-grid p-6 shadow-bloc [background-size:28px_28px] md:mt-6 md:px-10 md:pb-8 md:pt-9 md:[background-size:32px_32px]">
          <SeanceFrise steps={SEANCE_STEPS} />
        </div>
      </section>

      {/* ── Qui anime + FAQ (titres sans filet : demi-colonnes) ────── */}
      <section className="mt-11 md:mt-[72px] md:grid md:grid-cols-2 md:items-start md:gap-14">
        <div>
          <h2 className="m-0 mb-3.5 font-heading text-2xl font-bold text-brand-deep md:text-[26px]">Qui anime ?</h2>
          {/* Photo au-dessus en mobile, à côté à partir de sm : à 76 px de
              photo, la colonne de texte tombait à ~235 px et la citation
              devenait un pavé. Un seul rendu, pas de variante dupliquée. */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-5 md:gap-6">
            <PhotoSlot
              src={PHOTOS.portrait.src}
              alt={PHOTOS.portrait.alt}
              sizes="120px"
              className="h-[88px] w-[88px] flex-none rounded-full sm:h-[76px] sm:w-[76px] md:h-[120px] md:w-[120px]"
            />
            <div className="min-w-0">
              {/* Bio courte, en trois temps aérés : qui, sa voix, le lien vers
                  la bio longue, qui vit dans Le labo. */}
              <p className="m-0 font-heading font-semibold leading-snug text-brand-slate-dark">
                Valentin, fondateur du Locomotion Lab
              </p>

              <blockquote className="m-0 mt-2.5 border-l-2 border-brand-hairline pl-3.5 font-sans text-tableau italic leading-relaxed text-brand-soft md:mt-3.5 md:pl-4">
                &laquo;&nbsp;Coureur minimaliste, grimpeur d&rsquo;arbres et expérimentateur, les
                ateliers sont pour moi un moyen de transmettre mes connaissances et de faire tribu
                en situation réelle.&nbsp;&raquo;
              </blockquote>

              <Link
                href="/labo#labo-apropos"
                className="mt-3 inline-block font-sans text-tableau font-semibold text-brand-deep-dark underline decoration-brand-accent-dark/60 underline-offset-2 hover:decoration-brand-accent-dark md:mt-4"
              >
                Voir mon parcours
              </Link>

              <div className="mt-5 border-l-2 border-brand-accent pl-3 md:mt-6 md:pl-4">
                <p className="m-0 mb-1 font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate-dark">
                  EN FORMATION
                </p>
                <p className="m-0 font-sans text-tableau italic leading-relaxed text-brand-slate">
                  Licence STAPS mention Entraînement Sportif (2028)
                  <br />
                  Certification coach Tarzan Movement (2027)
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-0">
          <h2 className="m-0 mb-2.5 font-heading text-2xl font-bold text-brand-deep md:mb-3.5 md:text-[26px]">
            Foire aux questions
          </h2>
          <div className="flex flex-col">
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer font-heading font-bold text-brand-deep">
                Y a-t-il un niveau sportif prérequis ?
              </summary>
              <p className="m-0 mt-2 font-sans text-tableau leading-relaxed text-brand-soft">
                Aucun. Sauf mention contraire, les ateliers sont ouverts à tous·te·s.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer font-heading font-bold text-brand-deep">
                Quelle tenue prévoir ?
              </summary>
              <p className="m-0 mt-2 font-sans text-tableau leading-relaxed text-brand-soft">
                Des vêtements souples qui ne craignent pas d&rsquo;être salis. La pratique se fait
                pieds nus.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer font-heading font-bold text-brand-deep">
                J&rsquo;ai le vertige, ces ateliers sont-ils pour moi ?
              </summary>
              <p className="m-0 mt-2 font-sans text-tableau leading-relaxed text-brand-soft">
                Oui car il s&rsquo;agit d&rsquo;ateliers d&rsquo;initiation. On ne monte jamais plus
                haut que 50 cm - 1 m, et même dans ce cas, rien n&rsquo;est imposé et des exercices
                alternatifs peuvent toujours être proposés.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer font-heading font-bold text-brand-deep">
                Je peux venir accompagné·e ?
              </summary>
              <p className="m-0 mt-2 font-sans text-tableau leading-relaxed text-brand-soft">
                Oui, dans la limite des places disponibles. Dans ce cas, il faut réaliser une
                inscription par personne participante.
              </p>
            </details>
            <details className="border-b border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer font-heading font-bold text-brand-deep">
                Les mineurs peuvent-ils participer ?
              </summary>
              <p className="m-0 mt-2 font-sans text-tableau leading-relaxed text-brand-soft">
                Oui, à condition d&rsquo;être accompagnés durant toute la durée de la séance par un
                parent ou un·e tuteur·ice légal·e.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ── Teaser accompagnement trail (2027) ─────────────────────── */}
      <section className="mt-9 md:mt-[72px]">
        <div className="rounded-xl border-[1.5px] border-dashed border-brand-wash-line p-[22px] md:flex md:items-center md:justify-between md:gap-8 md:px-8 md:py-7">
          <div>
            <p className="m-0 mb-2 font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate-dark">
              EN PRÉPARATION · 2027
            </p>
            <h2 className="m-0 mb-1.5 font-heading text-xl font-bold leading-snug text-brand-slate-dark">
              Accompagnement trail &amp; course minimaliste
            </h2>
            <p className="m-0 font-sans text-tableau text-brand-muted">
              Suivi individuel à distance, retraites et immersions.
            </p>
          </div>
          <TrailNotify />
        </div>
      </section>

      <RetourAIndex href="/services" label="Retour aux services" />
    </div>
  );
}
