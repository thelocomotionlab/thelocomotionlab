"use client";

// components/Navbar.jsx
//
// LA NAVBAR DE LA MAQUETTE v6.
//
// Bandeau collant translucide, 72 px, en trois colonnes : la marque à gauche
// (le sceau puis le nom en petites capitales espacées), les cinq index au
// centre, la recherche à droite. L'entrée active porte un filet sous le
// libellé — c'est le seul marqueur, il n'y a pas d'icône.
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
    setSearchOpen(false);
    setSearchTerm("");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-brand-hairline bg-white/92 backdrop-blur-[8px]">
      <div className="mx-auto grid h-18 max-w-[1180px] grid-cols-[1fr_auto] items-center gap-8 px-6 md:grid-cols-[1fr_auto_1fr] md:px-8">
        <Link
          href="/"
          aria-label="Accueil"
          className="inline-flex items-center gap-3.5 justify-self-start text-brand-text no-underline transition-colors hover:text-brand-deep-dark"
        >
          <Image
            src="/images/assets/logo-mark.png"
            alt=""
            width={80}
            height={80}
            priority
            className="h-10 w-10 flex-none"
          />
          <span className="whitespace-nowrap pt-px font-heading text-sm font-semibold uppercase tracking-[0.24em]">
            Locomotion Lab
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden gap-7 md:flex">
          {items.map(({ href, label, live }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 border-b-2 py-1.5 font-heading font-medium no-underline transition-colors hover:text-brand-accent-ink ${
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

        <div className="flex items-center justify-end gap-1 justify-self-end">
          <button
            type="button"
            onClick={() => setSearchOpen((ouvert) => !ouvert)}
            aria-label="Rechercher"
            aria-expanded={searchOpen}
            title="Rechercher"
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-brand-text transition-colors hover:bg-brand-grid hover:text-brand-deep-dark"
          >
            <Search className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </button>

          <button
            ref={burgerRef}
            type="button"
            onClick={() => setMenuOpen((ouvert) => !ouvert)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-brand-text transition-colors hover:bg-brand-grid md:hidden"
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="border-t border-brand-hairline bg-white/95">
          <form onSubmit={submitSearch} className="mx-auto flex max-w-[1180px] gap-2 px-6 py-3 md:px-8">
            <input
              ref={searchRef}
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setSearchOpen(false)}
              placeholder="Rechercher sur le site"
              aria-label="Rechercher sur le site"
              className="min-w-0 flex-1 rounded-full border border-brand-field bg-white px-4 py-2 font-heading text-brand-ink outline-none focus:border-brand-deep"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-full bg-brand-accent px-5 py-2 font-heading font-semibold text-white transition-colors hover:bg-brand-accent-dark"
            >
              Chercher
            </button>
          </form>
        </div>
      ) : null}

      {menuOpen ? (
        <nav
          aria-label="Navigation principale"
          className="border-t border-brand-hairline bg-white/95 md:hidden"
        >
          <ul className="m-0 list-none px-6 py-2">
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
