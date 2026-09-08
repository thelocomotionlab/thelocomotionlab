// app/services/page.jsx
//
// SERVICES : l'index des offres, et rien d'autre.
//
// Chaque offre a sa page ; ici, une carte par offre, toutes de la même
// anatomie — le lieu, l'état, le nom, la promesse, deux phrases, une action,
// un lien. Le détail du Twin vit dans /services/twin, celui des ateliers dans
// /services/ateliers.
//
// L'état des ateliers se lit dans le catalogue : la page n'annonce jamais une
// date qui n'existe pas.

import { CarteDOffre, GroupeDOffres } from "@locomotionlab/ui";

import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";
import { listAteliers } from "@/lib/ateliers.mjs";

export const metadata = {
  title: "Services",
  description:
    "Deux façons de travailler avec le labo : le Locomotion Twin, en ligne, et les ateliers de motricité primale, sur le terrain.",
};

export default function ServicesPage() {
  const dates = listAteliers().length;

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 md:px-8">
      <EnTeteDIndex
        titre="Services"
        accroche="Le labo travaille pour toi de deux façons : en ligne, à partir de tes données ; sur le terrain, en mouvement."
      />

      <GroupeDOffres>
        <CarteDOffre
          lieu="En ligne"
          etat="En calibration"
          teinte="science"
          nom="Locomotion Twin"
          promesse="Ton jumeau physiologique, et le plan de course qui en découle."
          action={{ href: "/outils/twin/cohorte", libelle: "Rejoindre la cohorte" }}
          lien={{ href: "/services/twin", libelle: "Comment ça marche" }}
        >
          Le moteur se calibre sur ton archive d&rsquo;entraînement, puis confronte ton jumeau au
          profil réel de ta trace pour en tirer un pacing segment par segment.
        </CarteDOffre>

        <CarteDOffre
          lieu="Sur le terrain"
          etat={dates > 0 ? `${dates} date${dates > 1 ? "s" : ""} ouverte${dates > 1 ? "s" : ""}` : "Aucune date ouverte"}
          teinte="aventure"
          nom="Ateliers de motricité primale"
          promesse="Des rendez-vous dehors pour réincarner l’animal qui sommeille en toi."
          action={
            dates > 0
              ? { href: "/services/ateliers", libelle: "Voir les dates" }
              : { href: "/services/ateliers#prevenir", libelle: "Me prévenir", contour: true }
          }
          lien={{ href: "/services/ateliers", libelle: "Voir l'atelier" }}
        >
          Quadrupédie, suspension, équilibre, sauts de précision. Sans matériel, sans niveau
          requis, en extérieur.
        </CarteDOffre>
      </GroupeDOffres>

      <p className="mt-7 pb-6 font-sans text-[15px] text-brand-muted">
        D&rsquo;autres outils en ligne arriveront ici.
      </p>
    </div>
  );
}
