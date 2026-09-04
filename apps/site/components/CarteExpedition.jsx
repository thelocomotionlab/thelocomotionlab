// components/CarteExpedition.jsx
//
// LA GRAMMAIRE DES CARTES : ce qui a une photo se montre en carte. C'est la
// seule chose qu'une carte sait bien faire, et c'est pour ça que la grille des
// expéditions fonctionne. Photo en 16/10, sorte et statut, titre, les trois
// chiffres (km, D+, durée), l'« en bref », puis les dates et ce que la page
// contient — récit, paquetage, direct.

import Link from "next/link";
import Image from "next/image";
import CardMeta from "@/components/CardMeta";

function Stat({ valeur, unite }) {
  if (valeur == null || valeur === "") return null;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <b className="font-bold">{valeur}</b>
      {unite ? (
        <small className="text-[11px] uppercase tracking-[0.06em] text-gray-500">
          {unite}
        </small>
      ) : null}
    </span>
  );
}

export default function CarteExpedition({ item }) {
  return (
    <Link
      href={item.href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-shadow hover:shadow-lg"
    >
      {item.cover ? (
        <div className="relative w-full aspect-[16/10]">
          <Image
            src={item.cover}
            alt={`Illustration : ${item.title}`}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
        <CardMeta kind={item.kindLabel} detail={item.detail} />

        <h3 className="text-[17px] font-semibold leading-tight text-brand-deep group-hover:underline">
          {item.title}
        </h3>

        {item.distanceKm || item.deniveleM || item.duree ? (
          <div className="mt-0.5 flex flex-wrap gap-x-3.5 text-[12.5px] tabular-nums text-brand-text">
            <Stat valeur={item.distanceKm} unite="km" />
            <Stat valeur={item.deniveleM} unite="m D+" />
            <Stat valeur={item.duree} />
          </div>
        ) : null}

        {item.resume ? (
          <p className="mt-0.5 font-lora text-[14.5px] italic leading-[1.45] text-gray-600">
            {item.resume}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap justify-between gap-3 pt-2.5 text-xs text-gray-500">
          <span>{item.dates}</span>
          {item.contenus?.length ? <span>{item.contenus.join(" · ")}</span> : null}
        </div>
      </div>
    </Link>
  );
}
