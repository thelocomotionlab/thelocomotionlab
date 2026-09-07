// components/labo/APropos.jsx
//
// À PROPOS : qui tient le labo.
//
// Source unique du texte : la page /a-propos et la section « À propos » du Labo
// rendent toutes deux ce composant.

import Image from "next/image";
import { Photo } from "@locomotionlab/ui/contenu";

export const PORTRAIT = {
  src: "/images/pratiquer/portrait_val.webp",
  alt: "Valentin Fer",
  legende: "Valentin Fer, fondateur du labo. Ingénieur et docteur en mécanique des fluides.",
};

/** Le portrait, à côté du texte sur le Labo, absent de la page /a-propos. */
export function PortraitDeValentin() {
  return (
    <div className="sticky top-24">
      <Photo format="portrait" legende={PORTRAIT.legende}>
        <Image src={PORTRAIT.src} alt={PORTRAIT.alt} width={800} height={1000} />
      </Photo>
    </div>
  );
}

export default function APropos() {
  return (
    <div className="max-w-[38em] font-sans text-lecture leading-[1.7] text-brand-ink hyphens-auto [text-wrap:pretty] [&>p+p]:mt-[1.1em]">
      <p className="m-0">
        Ingénieur et docteur en mécanique des fluides, je pratique la course à pieds minimaliste
        depuis 2020. À l&apos;issue de ma thèse début 2023 (
        <a
          href="https://artsetmetiers.hal.science/tel-04041476/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
        >
          la consulter ici
        </a>
        ), j&apos;ai entrepris un processus introspectif de 2 ans dans la nature drômoise.
        C&apos;est alors que j&apos;ai découvert le monde de l&apos;optimisation du potentiel
        humain.
      </p>
      <p className="m-0">
        Durant ces deux ans, j&apos;ai été mon propre laboratoire d&apos;expérimentation. Remise à
        plat de ma biomécanique de course, processus d&apos;athlétisation spécifique à
        l&apos;ultra-trail, découverte de l&apos;exposition au froid, du parkour primal, de la
        nutrition.
      </p>
      <p className="m-0">
        Grâce à ces milliers d&apos;heures de pratiques, d&apos;écoutes de podcasts,
        d&apos;analyses, de remise en question, de succès, d&apos;échecs, j&apos;ai pu réaliser
        mon premier trail, de 82 km en mars 2024. Dans la même année, s&apos;en sont suivis deux
        autres courses de 92 km et 82 km. À chaque fois en sandales ou chaussettes-chaussures.
      </p>
      <p className="m-0">
        En 2025, j&apos;ai couru le Chianti et le Lavaredo, au format 100M, toujours en sandales.
        Intensément marqué par ces deux expériences de très longue distance, et fort d&apos;une
        salve de séances de préparation mentale, j&apos;ai compris qu&apos;il était temps pour moi
        de partager mes connaissances, processus physiques, mentaux, et expériences passées.
      </p>
      <p className="m-0">
        Ce n&apos;est qu&apos;après plusieurs mois de réflexion que l&apos;idée du Locomotion Lab a
        germé. Un espace ouvert, sans bornes et qui me ressemble. Un laboratoire de création,
        d&apos;exploration et de partage centré autour de toutes les pratiques et découvertes qui
        m&apos;animent au quotidien.
      </p>
      <p className="m-0 mt-[1.6em]! text-right font-sans text-2xl font-light not-italic text-brand-deep-dark">
        Valentin
      </p>
    </div>
  );
}
