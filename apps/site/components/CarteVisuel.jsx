// components/CarteVisuel.jsx
//
// LE VISUEL D'UNE CARTE EST UNE PROPRIÉTÉ DE LA SORTE, PAS DE L'ENTRÉE.
//
// Une photo quand l'entrée en a une — c'est demandé aux expéditions et aux
// carnets, et seulement à elles. Sinon, une carte typographique fabriquée au
// rendu : teinte du pilier, titre en Lora italique, badge d'état. Une fiche qui
// porte un paquetage montre ses chiffres à la place.
//
// Multiplier les entrées ne doit pas multiplier les images : décidée une fois
// par sorte, la règle ne demande plus aucune décision au moment d'écrire, et
// chaque rangée d'index reste homogène par construction.

import Image from "next/image";

/** La teinte de fond et celle du filet, par sorte. */
const TEINTES = {
  concept: "bg-brand-primary/12 ll-visuel--grille",
  protocole: "bg-brand-accent/12",
  fiche: "bg-brand-primary-dark/8",
  expedition: "bg-brand-bg",
  carnet: "bg-brand-bg",
};

export default function CarteVisuel({
  item,
  hauteur = "h-44",
  sizes = "(min-width: 768px) 352px, 100vw",
  decoratif = false,
}) {
  if (item.cover) {
    return (
      <div className={`relative w-full ${hauteur}`}>
        <Image
          src={item.cover}
          alt={decoratif ? "" : `Illustration : ${item.title}`}
          aria-hidden={decoratif ? "true" : undefined}
          fill
          className="object-cover"
          sizes={sizes}
          loading="lazy"
        />
      </div>
    );
  }

  const teinte = TEINTES[item.kind] ?? "bg-brand-bg";

  return (
    <div
      aria-hidden="true"
      className={`ll-visuel relative flex w-full flex-col justify-between overflow-hidden p-4 ${hauteur} ${teinte}`}
    >
      {/* Les chiffres d'une fiche tiennent lieu d'image : ce sont des données
          du labo, pas une illustration. */}
      {item.donnees ? (
        <>
          <span className="font-heading text-[11px] uppercase tracking-[0.1em] text-gray-500">
            {item.kindLabel}
          </span>
          <span className="font-lora text-[28px] font-medium leading-none text-brand-deep">
            {item.donnees.masse}
          </span>
          <span className="text-[13px] text-gray-600">
            {item.donnees.articles}
          </span>
        </>
      ) : (
        <>
          <span className="font-heading text-[11px] uppercase tracking-[0.1em] text-gray-500">
            {item.kindLabel}
          </span>
          <span className="font-lora text-[19px] italic leading-tight text-brand-deep line-clamp-3">
            {item.title}
          </span>
          {item.etat ? (
            <span className="self-start rounded-[3px] border border-brand-primary-dark/45 px-2 py-0.5 font-heading text-[10px] uppercase tracking-[0.1em] text-brand-slate-dark">
              {item.etat}
            </span>
          ) : (
            <span />
          )}
        </>
      )}
    </div>
  );
}
