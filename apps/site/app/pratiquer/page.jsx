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
import TrailNotify from "@/components/TrailNotify";
import { listAteliers } from "@/lib/ateliers.mjs";

// ── PHOTOS DE LA PAGE ────────────────────────────────────────────────────
// Déposer les fichiers dans apps/site/public/images/pratiquer/ puis
// renseigner les chemins ici (ex. "/images/pratiquer/portrait.webp").
// Tant qu'un chemin est vide, PhotoSlot affiche un placeholder charte.
// Les photos des CARTES ateliers se règlent dans lib/ateliers.mjs (cover).
const PHOTOS = {
  // Illustration « Le mouvement primal, c'est quoi ? » — paysage, ~1200×800.
  pedagogie: { src: "", alt: "Mouvement primal en extérieur — squat et suspension" },
  // Portrait rond « Qui anime ? » — cadré carré, ~500×500.
  portrait: { src: "", alt: "Portrait de Valentin, fondateur du Locomotion Lab" },
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

// En-tête de section commun de la page : Lora italique terracotta + filet
// aligné baseline à droite du titre (les titres gardent la serif d'accent,
// les textes courants sont en Ubuntu comme partout sur le site).
function SectionHeading({ children, className = "" }) {
  return (
    <div className={`flex items-baseline gap-3.5 md:gap-5 ${className}`}>
      <h2 className="flex-none font-lora text-[23px] font-medium italic text-brand-deep md:text-[28px]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-brand-hairline" aria-hidden="true" />
    </div>
  );
}

// Étape de la frise « séance type » : point sur le fil (ligne horizontale en
// desktop, fil vertical à gauche en mobile).
function FriseStep({ heart = false, kicker = null, title, children, chips = null, last = false }) {
  const dotColor = heart
    ? "bg-brand-deep shadow-[0_0_0_1.5px_var(--color-brand-deep)]"
    : "bg-brand-accent shadow-[0_0_0_1.5px_var(--color-brand-accent)]";
  return (
    <li className={`relative pl-8 md:pl-0 ${last ? "" : "md:pr-[18px]"}`}>
      <span
        className={`absolute left-0 top-0.5 z-[2] block h-4 w-4 rounded-full border-[3px] border-white md:relative md:left-auto md:top-auto ${dotColor}`}
        aria-hidden="true"
      />
      {kicker ? (
        <p className="mb-[3px] mt-0 font-mono text-[10.5px] font-bold tracking-[0.16em] text-brand-deep md:mb-1 md:mt-4 md:text-[11px]">
          {kicker}
        </p>
      ) : null}
      <p
        className={`mb-1 text-base font-bold leading-[1.3] text-brand-slate-dark md:mb-1.5 md:text-[16.5px] ${
          kicker ? "" : "md:mt-4"
        }`}
      >
        {title}
      </p>
      <p className="text-[13.5px] leading-[1.55] text-gray-500">{children}</p>
      {chips ? (
        <div className="mt-2 flex flex-wrap gap-1.5 md:mt-2.5 md:gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-brand-wash-line px-[9px] py-[3px] font-mono text-[10px] font-bold tracking-[0.08em] text-brand-slate md:px-2.5 md:text-[11px]"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export default function PratiquerPage() {
  const ateliers = listAteliers();

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        kicker="/ LA PRATIQUE"
        title="Pratiquer"
        tagline="Éprouver par soi-même, ensemble."
        className="mb-0"
      />
      <p className="mt-7 max-w-[640px] text-base leading-[1.7] text-gray-600 md:text-lg">
        Des ateliers de mouvement primal, en extérieur, pour retrouver les
        schémas moteurs pour lesquels nos corps sont construits — marcher,
        ramper, grimper, jouer. Gratuits pendant la phase de lancement du
        labo.
      </p>

      {/* ── Prochains ateliers ─────────────────────────────────────── */}
      <section className="mt-10 md:mt-14" aria-labelledby="ateliers">
        <SectionHeading className="mb-[18px] md:mb-6">
          <span id="ateliers">Prochains ateliers</span>
        </SectionHeading>
        {ateliers.length ? (
          <AteliersGrid ateliers={ateliers} />
        ) : (
          <p className="italic text-gray-500">
            Les prochaines dates sont en préparation — reviens bientôt, ou
            écris-nous via la page contact pour être prévenu·e.
          </p>
        )}
      </section>

      {/* ── Pédagogie ──────────────────────────────────────────────── */}
      <section className="mt-11 md:mt-[72px] md:grid md:grid-cols-[1.15fr_1fr] md:items-center md:gap-12">
        <div>
          <SectionHeading className="mb-4 md:mb-[18px]">
            Le mouvement primal, c&rsquo;est quoi ?
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
            primal, c&rsquo;est revenir à ces schémas fondamentaux :
            quadrupédie, squat profond, suspension, équilibre — non pas
            comme une discipline, mais comme une récréation.
          </p>
          <p className="text-base leading-[1.75] text-gray-600 md:text-[17px]">
            Pas de machine, pas de chrono, pas de niveau requis. Un terrain,
            un groupe, et la curiosité de redécouvrir ce que ton corps sait
            déjà faire.
          </p>
        </div>
        <PhotoSlot
          src={PHOTOS.pedagogie.src}
          alt={PHOTOS.pedagogie.alt}
          sizes="(min-width: 768px) 480px, 100vw"
          className="hidden h-[300px] rounded-2xl md:block"
        />
      </section>

      {/* ── Une séance type — frise de principes, sans timing ──────── */}
      <section className="mt-11 md:mt-[72px]">
        <SectionHeading>Une séance type</SectionHeading>
        <div className="mt-5 rounded-2xl bg-white bg-lab-grid p-6 shadow-card [background-size:28px_28px] md:mt-6 md:px-10 md:pb-8 md:pt-9 md:[background-size:32px_32px]">
          <p className="mb-[22px] text-[14.5px] italic text-gray-500 md:mb-7 md:text-base">
            Pas de chronomètre, pas de programme figé — chaque séance suit le
            même fil, au rythme du groupe et du terrain.
          </p>
          <div className="relative">
            {/* Le fil : ligne horizontale en desktop, verticale en mobile,
                qui s'estompe vers la fin. */}
            <div
              className="absolute inset-x-0 top-[7px] hidden h-0.5 bg-[linear-gradient(90deg,var(--color-brand-accent)_0%,var(--color-brand-accent)_82%,color-mix(in_srgb,var(--color-brand-accent)_25%,transparent)_100%)] md:block"
              aria-hidden="true"
            />
            <div
              className="absolute bottom-3.5 left-[7px] top-2 w-0.5 bg-[linear-gradient(180deg,var(--color-brand-accent)_0%,var(--color-brand-accent)_80%,color-mix(in_srgb,var(--color-brand-accent)_25%,transparent)_100%)] md:hidden"
              aria-hidden="true"
            />
            <ol className="flex list-none flex-col gap-[22px] md:grid md:grid-cols-[1fr_1fr_1.4fr_1fr] md:gap-0">
              <FriseStep title="Arrivée & intentions">
                On pose le cadre : jouer, pas performer.
              </FriseStep>
              <FriseStep title="Éveil exploratoire">
                Pieds, hanches, épaules — en explorant le terrain.
              </FriseStep>
              <FriseStep
                heart
                kicker="LE CŒUR DE LA SÉANCE"
                title="Ateliers de mouvement"
                chips={["QUADRUPÉDIE", "ÉQUILIBRE", "SUSPENSION"]}
              >
                Quadrupédie, équilibre, suspension : des progressions pour
                chaque corps, du grand débutant au traileur.
              </FriseStep>
              <FriseStep last title="Jeu collectif & retours">
                Un jeu pour ancrer, un échange pour repartir.
              </FriseStep>
            </ol>
          </div>
          <p className="mt-5 text-right text-[13px] italic text-gray-400 md:mt-[26px] md:text-sm">
            Et retour au monde des chaises — un peu moins docile.
          </p>
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
                Valentin — fondateur du Locomotion Lab. Coureur, grimpeur
                d&rsquo;arbres et expérimentateur : tout ce qui est proposé
                en atelier a d&rsquo;abord été éprouvé sur le terrain, des
                traversées en autonomie aux protocoles du labo.
              </p>
              <div className="border-l-2 border-brand-accent pl-3 md:pl-4">
                <p className="mb-1 font-mono text-[10px] font-bold tracking-[0.2em] text-brand-primary md:text-[11px]">
                  EN FORMATION
                </p>
                <p className="text-[13.5px] italic leading-[1.6] text-brand-slate md:text-[15px]">
                  Licence STAPS — diplôme en préparation
                  <br />
                  Certification coach Tarzan Movement — en cours
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-0">
          <h2 className="mb-2.5 font-lora text-[23px] font-medium italic text-brand-deep md:mb-3.5 md:text-2xl">
            Questions fréquentes
          </h2>
          <div className="flex flex-col">
            <details className="border-t border-brand-hairline py-3 md:py-[13px]" open>
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Quel niveau faut-il ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Aucun. Les mouvements se déclinent en progressions : chacun
                explore à son niveau, du grand débutant au traileur aguerri.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Quelle tenue prévoir ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Des vêtements souples qui ne craignent pas la terre. Pieds
                nus ou chaussures minimalistes bienvenus.
              </p>
            </details>
            <details className="border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Et s&rsquo;il pleut ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                On pratique sous une pluie légère (c&rsquo;est même
                intéressant). En cas de météo dangereuse, l&rsquo;atelier est
                reporté et tu es prévenu·e par email.
              </p>
            </details>
            <details className="border-b border-t border-brand-hairline py-3 md:py-[13px]">
              <summary className="cursor-pointer text-[15px] font-bold text-brand-deep md:text-base">
                Je peux venir seul·e ?
              </summary>
              <p className="mt-2 text-[14.5px] leading-[1.65] text-gray-600 md:text-[15px]">
                Bien sûr — la plupart des participants viennent seuls. Le jeu
                collectif fait le reste.
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
              Suivi individuel à distance, retraites et immersions. Ouverture
              après le diplôme STAPS.
            </p>
          </div>
          <TrailNotify />
        </div>
      </section>
    </section>
  );
}
