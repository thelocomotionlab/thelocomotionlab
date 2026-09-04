// components/BlocsRelations.jsx
//
// Les blocs de relation d'une page de détail, GÉNÉRÉS depuis le graphe
// (lib/relations.mjs). Un bloc vide ne s'affiche pas — même règle que les
// index : la page montre ce qui existe, jamais ce qui manque.
//
// Ces blocs remplacent les « contenus liés » par récence, et surtout les
// ancres profondes écrites à la main, qui cassaient en silence à la découpe.

import ArticleNav from "@/components/ArticleNav";

/** Le titre de chaque bloc dépend de la sorte de la page qui le porte. */
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
    <ArticleNav key={cle} items={relations[cle]} heading={TITRES[cle]} />
  ));
}
