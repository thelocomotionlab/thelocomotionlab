// components/ExplorerCarousel.jsx
//
// Carrousel des récits & projets (accueil, /live) : sur desktop, défilement
// horizontal natif (scroll-snap, molette) + flèches ; sur mobile, liste
// verticale compacte (vignette 78×62 + texte, 3 entrées max) conforme au
// design d'origine de l'accueil. Les items arrivent pré-formatés du serveur
// (lib/carouselItems.js). `tone` adapte flèches et ombres au fond : "dark"
// (photo sombre, défaut) ou "light" (fond crème).

"use client";

import Link from "next/link";
import Image from "next/image";
import CardMeta from "@/components/CardMeta";
import Carrousel from "@/components/Carrousel";

function Card({ item, tone }) {
  const shadow =
    tone === "dark"
      ? "shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
      : "shadow-card";

  return (
    <Link
      href={item.href}
      // Hauteur fixe sur mobile : la fenêtre du carrousel affiche
      // exactement 3 cartes (3 × 88px + 2 × 12px de gap = 288px).
      className={`group flex h-[88px] w-full shrink-0 snap-start items-center gap-3 overflow-hidden rounded-[10px] bg-white transition-transform duration-200 md:block md:h-auto md:w-[250px] md:rounded-[14px] md:hover:-translate-y-1.5 ${shadow}`}
    >
      {/* Vignette : s'étire sur toute la hauteur de la ligne (titres sur
          2 lignes compris) ; au format des couvertures sur desktop, où elle
          est en plein cadre. */}
      <span className="relative block min-h-[62px] w-[78px] flex-none self-stretch md:aspect-cover md:h-auto md:w-full md:self-auto">
        {item.cover ? (
          <Image
            src={item.cover}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 768px) 250px, 78px"
            loading="lazy"
          />
        ) : (
          <span className="absolute inset-0 bg-brand-bg" aria-hidden="true" />
        )}
      </span>
      <span className="block min-w-0 flex-1 py-2 pr-3 md:px-4 md:pb-4 md:pt-3.5">
        <CardMeta kind={item.kindLabel} detail={item.detail} className="md:mb-1" />
        <span className="line-clamp-2 block text-[15px] font-semibold leading-[1.3] text-brand-deep md:line-clamp-none">
          {item.title}
        </span>
      </span>
    </Link>
  );
}

// `actions` : contenu de la rangée sous le carrousel (CTA « Voir tout »,
// indicateur live…), rendu à gauche des flèches de navigation.
export default function ExplorerCarousel({ items, actions = null, tone = "dark" }) {
  return (
    <Carrousel
      label="Récits et projets récents"
      actions={actions}
      tone={tone}
      // Mobile : carrousel VERTICAL — fenêtre de 3 cartes exactement
      // (hauteur fixe des cartes), accroche snap-y, fine barre bleue sur
      // le côté comme indicateur. Desktop : défilement horizontal ; marges
      // négatives compensant le padding qui évite de rogner les ombres et
      // le hover surélevé.
      scrollerClassName="ll-vscroll ll-vscroll-md-none flex max-h-[288px] snap-y flex-col gap-3 overflow-y-auto pr-2 md:-mx-1 md:-mb-6 md:-mt-3 md:max-h-none md:snap-x md:flex-row md:gap-5 md:overflow-x-auto md:overflow-y-visible md:px-1 md:pb-6 md:pt-3"
    >
      {items.map((item) => (
        <Card key={item.key} item={item} tone={tone} />
      ))}
    </Carrousel>
  );
}
