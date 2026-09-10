"use client";

// components/FicheRaccourcis.tsx
//
// LA FICHE DES RACCOURCIS, sur « ? ».
//
// Un studio se travaille au clavier ; encore faut-il savoir ce qu'il écoute.
// La fiche est la liste complète, pas un florilège : ce qui n'y figure pas
// n'existe pas.

import { X } from "lucide-react";

const GROUPES: { titre: string; lignes: [string, string][] }[] = [
  {
    titre: "Outils",
    lignes: [
      ["V", "Sélection"],
      ["T", "Poser un texte"],
      ["R", "Poser un rectangle"],
      ["L", "Poser une ligne"],
      ["Échap", "Ranger l'outil, puis lâcher la sélection"],
    ],
  },
  {
    titre: "Sélection",
    lignes: [
      ["Clic", "Choisir"],
      ["Maj + clic", "Ajouter à la sélection"],
      ["Glissé sur le fond", "Rectangle de sélection"],
      ["Double-clic", "Écrire dans un texte, recadrer une photo"],
      ["Ctrl + A", "Tout choisir"],
      ["Ctrl + G", "Grouper · Ctrl + Maj + G dégrouper"],
    ],
  },
  {
    titre: "Placer",
    lignes: [
      ["Flèches", "Déplacer d'un pixel"],
      ["Maj + flèches", "Déplacer de dix"],
      ["Alt pendant un glissé", "Sans magnétisme"],
      ["Maj pendant un coin", "Libérer les proportions"],
      ["Maj pendant une rotation", "Par paliers de 15°"],
      ["Ctrl + ] · Ctrl + [", "Devant · derrière"],
    ],
  },
  {
    titre: "Modifier",
    lignes: [
      ["Ctrl + Z", "Annuler · Ctrl + Maj + Z refaire"],
      ["Ctrl + C · V", "Copier · coller"],
      ["Ctrl + Maj + C · V", "Copier · coller le style"],
      ["Ctrl + D", "Dupliquer"],
      ["Suppr", "Supprimer"],
      ["Molette (recadrage)", "Zoomer dans le cadre"],
      ["Entrée", "Valider un recadrage"],
    ],
  },
  {
    titre: "Survol",
    lignes: [
      ["▶", "Lire · le curseur saute où l'on veut"],
      ["Double-clic sur un chiffre", "Changer sa variable dans l'inspecteur"],
      ["Vidéo", "Exporter, image par image — garde l'onglet devant"],
    ],
  },
  {
    titre: "Voir",
    lignes: [
      ["Ctrl + 0", "Ajuster à la fenêtre et recentrer"],
      ["Ctrl + + · Ctrl + −", "Zoomer · dézoomer"],
      ["Ctrl + molette", "Zoomer sous le curseur"],
      ["Molette", "Déplacer la vue"],
      ["Ctrl + glissé", "Déplacer la vue"],
      ["Espace + glissé", "Déplacer la vue, sans Ctrl"],
      ["Pincement", "Zoomer et déplacer, au doigt"],
      ["Page ↑ · Page ↓", "Planche précédente · suivante"],
      ["Ctrl + E", "Exporter"],
      ["?", "Cette fiche"],
    ],
  },
];

export default function FicheRaccourcis({ onFermer }: { onFermer: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raccourcis clavier"
      onClick={onFermer}
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-text/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xl border border-brand-field bg-brand-paper p-5 shadow-card"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium">Raccourcis</h2>
          <button
            type="button"
            onClick={onFermer}
            className="rounded-md p-1 text-brand-soft transition-colors hover:bg-brand-primary/12 hover:text-brand-text motion-reduce:transition-none"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
            <span className="sr-only">Fermer</span>
          </button>
        </div>

        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {GROUPES.map((g) => (
            <section key={g.titre}>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
                {g.titre}
              </h3>
              <dl className="space-y-1">
                {g.lignes.map(([touche, quoi]) => (
                  <div key={touche} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 rounded border border-brand-field px-1.5 py-0.5 text-[11px] text-brand-soft">
                      {touche}
                    </dt>
                    <dd className="text-right text-[12px] text-brand-text">{quoi}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
