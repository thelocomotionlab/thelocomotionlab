"use client";

// components/Navbar.jsx
//
// LA NAVBAR.
//
// Bandeau collant translucide, pleine largeur : la marque calée sur le bord
// gauche, les cinq index centrés sur la page (pas sur l'espace restant — d'où
// le positionnement absolu), la recherche sur le bord droit. L'entrée active
// porte un filet sous le libellé — c'est le seul marqueur, il n'y a pas
// d'icône.
//
// L'entrée « Live » est la seule exception à ces cinq liens : elle n'apparaît
// que dans la fenêtre d'une aventure en cours, et s'efface d'elle-même.

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, SatelliteDish, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { liveConfig } from "@/lib/liveConfig";

// « Live » entre dans la navbar 24 h avant le départ et en sort sept jours
// après : au-delà, c'est que la config n'a pas été remise à jour.
const LIVE_AVANT_MS = 24 * 60 * 60 * 1000;
const LIVE_APRES_MS = 7 * 24 * 60 * 60 * 1000;

function liveWindowOpen() {
  const { statut } = liveConfig.aventure;
  if (statut === "repos") return false;
  const start = new Date(liveConfig.aventure.dateDebut).getTime();
  if (Number.isNaN(start)) return false;
  const now = Date.now();
  return now >= start - LIVE_AVANT_MS && now <= start + LIVE_APRES_MS;
}

/** Les cinq index du modèle (docs/systeme-de-contenu.md §2). */
const NAV_ITEMS = [
  { href: "/science", label: "Science" },
  { href: "/aventures", label: "Aventures" },
  { href: "/blog", label: "Blog" },
  { href: "/services", label: "Services" },
  { href: "/labo", label: "Labo" },
];

function isActivePath(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);

  const searchRef = useRef(null);
  const burgerRef = useRef(null);

  // La fenêtre du direct dépend de l'heure : évaluée côté client, et
  // réévaluée chaque minute, pour rester juste sur une page pré-rendue.
  useEffect(() => {
    const verifier = () => setLiveOpen(liveWindowOpen());
    verifier();
    const minuterie = setInterval(verifier, 60_000);
    return () => clearInterval(minuterie);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const items = liveOpen ? [{ href: "/live", label: "Live", live: true }, ...NAV_ITEMS] : NAV_ITEMS;

  function submitSearch(event) {
    event.preventDefault();
    const terme = searchTerm.trim();
    if (!terme) return;
    router.push(`/recherche?q=${encodeURIComponent(terme)}`);
    fermerLaRecherche();
  }

  // Le champ se replie vers la droite avant de sortir du DOM : la classe
  // d'animation dure 300 ms, le démontage attend la fin.
  function fermerLaRecherche() {
    setSearchClosing(true);
    setTimeout(() => {
      setSearchClosing(false);
      setSearchOpen(false);
      setSearchTerm("");
    }, 300);
  }

  return (
    // Le bandeau est collant : sur un téléphone, chaque pixel qu'il prend est
    // pris au contenu pour toute la durée du défilement. La marque y tient
    // donc à une taille réduite, et retrouve la sienne dès qu'il y a la place.
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-brand-hairline bg-white/92 px-4 py-1.5 backdrop-blur-[8px] md:p-4">
      <Link
        href="/"
        aria-label="Accueil"
        className="inline-flex items-center gap-2.5 text-brand-text no-underline transition-colors hover:text-brand-deep-dark md:gap-3.5"
      >
        <Image
          src="/images/assets/logo-mark.png"
          alt=""
          width={96}
          height={96}
          sizes="48px"
          priority
          className="h-9 w-9 flex-none md:h-12 md:w-12"
        />
        <span className="whitespace-nowrap pt-px font-heading text-[13px] font-semibold uppercase tracking-[0.18em] md:text-base md:tracking-[0.24em]">
          Locomotion Lab
        </span>
      </Link>

      {/* Centré sur la PAGE : `justify-between` centrerait la nav sur ce qui
          reste entre la marque et la recherche, qui n'ont pas la même largeur. */}
      <nav
        aria-label="Navigation principale"
        className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex"
      >
        {items.map(({ href, label, live }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 border-b-2 py-1.5 font-heading text-[17px] font-medium no-underline transition-colors hover:text-brand-accent-ink ${
                active
                  ? "border-brand-deep text-brand-deep"
                  : "border-transparent text-brand-text"
              }`}
            >
              {live ? (
                <SatelliteDish className="h-4 w-4 text-brand-deep-dark" aria-hidden="true" />
              ) : null}
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <div className="hidden items-center md:flex">
          {searchOpen ? (
            <form
              onSubmit={submitSearch}
              className={`flex items-center ${searchClosing ? "animate-slideOut" : "animate-slideIn"}`}
            >
              <input
                ref={searchRef}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && fermerLaRecherche()}
                placeholder="Rechercher un article, une aventure…"
                aria-label="Rechercher sur le site"
                className="w-80 rounded-full border border-brand-field px-3.5 py-1.5 text-brand-text outline-none focus:border-transparent focus:ring-2 focus:ring-brand-accent"
              />
              <button
                type="submit"
                aria-label="Lancer la recherche"
                className="ml-2 cursor-pointer text-brand-text transition-colors hover:text-brand-accent-ink"
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={fermerLaRecherche}
                aria-label="Fermer la recherche"
                className="ml-2 cursor-pointer text-brand-text transition-colors hover:text-brand-accent-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Ouvrir la recherche"
              title="Rechercher"
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-brand-text transition-colors hover:bg-brand-grid hover:text-brand-deep-dark"
            >
              <Search className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          ref={burgerRef}
          type="button"
          onClick={() => setMenuOpen((ouvert) => !ouvert)}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-brand-text transition-colors hover:bg-brand-grid md:hidden"
        >
          {menuOpen ? (
            <X className="h-[22px] w-[22px]" aria-hidden="true" />
          ) : (
            <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
          )}
        </button>
      </div>

      {menuOpen ? (
        <nav
          aria-label="Navigation principale"
          className="absolute inset-x-0 top-full border-t border-brand-hairline bg-white/95 md:hidden"
        >
          <ul className="m-0 list-none px-4 py-2">
            <li>
              <Link
                href="/recherche"
                onClick={() => setMenuOpen(false)}
                className="block border-b border-brand-grid py-3 font-heading font-medium text-brand-text no-underline"
              >
                Recherche
              </Link>
            </li>
            {items.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActivePath(pathname, href) ? "page" : undefined}
                  className={`block border-b border-brand-grid py-3 font-heading font-medium no-underline last:border-b-0 ${
                    isActivePath(pathname, href) ? "text-brand-deep" : "text-brand-text"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
