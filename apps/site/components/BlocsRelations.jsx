// components/BlocsRelations.jsx
//
// Les blocs de relation d'une page de détail, GÉNÉRÉS depuis le graphe
// (lib/relations.mjs) et rendus en registre — la même grammaire qu'aux index.
// Un bloc vide ne s'affiche pas : la page montre ce qui existe, jamais ce qui
// manque.
//
// Ces blocs remplacent les « contenus liés » par récence, et surtout les
// ancres profondes écrites à la main, qui cassaient en silence à la découpe.

import Registre from "@/components/Registre";

const TITRES = {
  surLeTerrain: "Sur le terrain",
  ceQueJaiCompris: "Ce que j'ai compris",
  fiches: "Ce que j'ai emporté",
  motifsVoisins: "Motifs voisins",
};

const ORDRE = ["surLeTerrain", "ceQueJaiCompris", "fiches", "motifsVoisins"];

export default function BlocsRelations({ relations }) {
  if (!relations) return null;

  return ORDRE.filter((cle) => relations[cle]?.length > 0).map((cle) => (
    <nav key={cle} aria-label={TITRES[cle]} className="mt-14">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-brand-deep">{TITRES[cle]}</h2>
        <span
          aria-hidden="true"
          className="mt-2 block h-[1.5px] w-[4.5rem] rounded-full bg-brand-accent/65"
        />
      </div>
      <Registre
        items={relations[cle]}
        pilier={relations[cle][0].kind === "concept" ? "comprendre" : "explorer"}
      />
    </nav>
  ));
}
