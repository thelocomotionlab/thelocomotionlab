// components/Navbar.jsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain,
  ChevronDown,
  Compass,
  FlaskConical,
  Menu,
  SatelliteDish,
  Search,
  Wrench,
  X,
} from "lucide-react";
import BareFeet from "@/components/icons/BareFeet";
import { useEffect, useRef, useState } from "react";
import { liveConfig } from "@/lib/liveConfig";

// Menu « Outils » livré masqué en PR1, activé en PR2 avec la page
// /outils/twin.
const SHOW_OUTILS = true;

// « Live » n'entre dans la navbar que 24 h avant le départ de l'aventure
// (liveConfig.aventure.dateDebut) et en sort quand elle est terminée.
// Quand il est là, il passe en tête et clignote doucement.
const LIVE_NAV_ITEM = {
  type: "link",
  href: "/live",
  label: "Live",
  Icon: SatelliteDish,
  live: true,
};
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

function liveWindowOpen() {
  if (liveConfig.aventure.statut === "termine") return false;
  const start = new Date(liveConfig.aventure.dateDebut).getTime();
  if (Number.isNaN(start)) return false;
  return Date.now() >= start - LIVE_WINDOW_MS;
}

const NAV_ITEMS = [
  { type: "link", href: "/comprendre", label: "Comprendre", Icon: Brain },
  { type: "link", href: "/explorer", label: "Explorer", Icon: Compass },
  // Évolutif : quand l'accompagnement trail ouvrira (2027), cette entrée
  // passera en `type: "menu"` (Ateliers / Accompagnement trail).
  { type: "link", href: "/pratiquer", label: "Pratiquer", Icon: BareFeet },
  {
    type: "menu",
    label: "Outils",
    Icon: Wrench,
    hidden: !SHOW_OUTILS,
    items: [{ href: "/outils/twin", label: "Locomotion Twin" }],
  },
  {
    type: "menu",
    label: "Le labo",
    Icon: FlaskConical,
    items: [
      { href: "/quete", label: "La quête" },
      { href: "/about", label: "À propos" },
      { href: "/soutenir", label: "Soutenir" },
      { href: "/contact", label: "Contact" },
    ],
  },
].filter((item) => !item.hidden);

function isActivePath(pathname, href) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Menu déroulant desktop accessible : bouton aria-expanded/aria-haspopup,
 * fermeture à l'échappement (focus rendu au bouton) et au clic extérieur,
 * navigation aux flèches entre les entrées.
 */
function DesktopDropdown({ label, Icon, items, pathname }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  const menuId = `menu-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const active = items.some(({ href }) => isActivePath(pathname, href));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    // Échap ferme le menu même si le focus est sorti du composant.
    const onDocKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  const focusItem = (delta) => {
    const links = Array.from(
      containerRef.current?.querySelectorAll("a[role='menuitem']") ?? []
    );
    if (!links.length) return;
    const idx = links.indexOf(document.activeElement);
    const next =
      idx === -1
        ? delta > 0
          ? 0
          : links.length - 1
        : (idx + delta + links.length) % links.length;
    links[next].focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else focusItem(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(-1);
    }
  };

  return (
    <div className="relative" ref={containerRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={`hover:text-brand-accent-ink flex items-center gap-1 group cursor-pointer font-medium ${
          active ? "text-brand-accent-ink" : ""
        }`}
      >
        <Icon
          size={18}
          className={`group-hover:text-brand-accent-ink ${
            active ? "text-brand-accent-ink" : "text-gray-700"
          }`}
          aria-hidden="true"
        />
        <span>{label}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-1/2 -translate-x-1/2 top-full mt-3 min-w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50"
        >
          {items.map(({ href, label: itemLabel }) => (
            <li key={href} role="none">
              <Link
                href={href}
                role="menuitem"
                aria-current={isActivePath(pathname, href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 hover:bg-brand-bg hover:text-brand-accent-ink whitespace-nowrap ${
                  isActivePath(pathname, href) ? "text-brand-accent-ink" : ""
                }`}
              >
                {itemLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [closingMenu, setClosingMenu] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const burgerRef = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  // Fenêtre live évaluée côté client (et réévaluée chaque minute) pour
  // rester juste sur une page statique pré-rendue.
  const [liveVisible, setLiveVisible] = useState(false);
  useEffect(() => {
    const check = () => setLiveVisible(liveWindowOpen());
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);
  const navItems = liveVisible ? [LIVE_NAV_ITEM, ...NAV_ITEMS] : NAV_ITEMS;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/recherche?q=${encodeURIComponent(searchTerm.trim())}`);
      setSearchOpen(false);
      setSearchTerm("");
    }
  };

  const handleCloseSearch = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setSearchOpen(false);
      setSearchTerm("");
    }, 300);
  };

  const handleCloseMenu = () => {
    setClosingMenu(true);
    setTimeout(() => {
      setClosingMenu(false);
      setOpen(false);
      setOpenSection(null);
    }, 300);
  };

  // Fermeture du menu mobile à l'échappement, focus rendu au burger.
  const handleMobileKeyDown = (e) => {
    if (e.key === "Escape") {
      handleCloseMenu();
      burgerRef.current?.focus();
    }
  };

  const logoActive = hovered || focused;

  return (
    <header className="flex items-center justify-between p-4 shadow-md bg-white/90 backdrop-blur sticky top-0 z-50 text-gray-700">
      {/* Logo à gauche */}
      <div className="flex items-center">
        <Link
          href="/"
          className="inline-flex items-center"
          aria-label="Accueil"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <Image
            src={logoActive ? "/logo_deep_primary.webp" : "/logo_primary_deep.webp"}
            alt="Logo The Locomotion Lab — retour à l'accueil"
            width={296}
            height={96}
            priority
            sizes="148px"
            className="h-12 w-auto transition duration-300"
          />
        </Link>
      </div>

      {/* Liens au centre */}
      <nav
        className="hidden md:flex items-center space-x-8 font-medium absolute left-1/2 -translate-x-1/2"
        aria-label="Navigation principale"
      >
        {navItems.map((item) => {
          if (item.type === "menu") {
            return (
              <DesktopDropdown
                key={item.label}
                label={item.label}
                Icon={item.Icon}
                items={item.items}
                pathname={pathname}
              />
            );
          }

          const { href, label, Icon } = item;
          const active = isActivePath(pathname, href);

          // « Live » : point pulsé + clignotement doux, en tête de navbar.
          if (item.live) {
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-1.5 font-semibold text-brand-accent-dark animate-[ll-blink_2.6s_ease-in-out_infinite] hover:text-brand-deep"
              >
                <span className="relative h-2 w-2 flex-none" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-brand-accent-dark" />
                  <span className="absolute inset-0 rounded-full bg-brand-accent-dark animate-[ll-pulse_2.4s_ease-out_infinite]" />
                </span>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`hover:text-brand-accent-ink flex items-center gap-1 group ${
                active ? "text-brand-accent-ink" : ""
              }`}
            >
              <Icon
                size={18}
                className={`group-hover:text-brand-accent-ink ${
                  active ? "text-brand-accent-ink" : "text-gray-700"
                }`}
                aria-hidden="true"
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Barre de recherche à droite */}
      <div className="hidden md:flex items-center ml-auto">
        {!searchOpen ? (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 hover:text-brand-accent-ink cursor-pointer"
            aria-label="Ouvrir la recherche"
          >
            <Search size={22} className="text-gray-700" />
          </button>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={`flex items-center ${
              closing ? "animate-slideOut" : "animate-slideIn"
            }`}
          >
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              placeholder="Rechercher un article, un projet…"
              aria-label="Rechercher sur le site"
              className="px-3 py-1 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent"
            />
            <button
              type="submit"
              className="ml-2 cursor-pointer hover:text-brand-accent-ink"
              aria-label="Lancer la recherche"
            >
              <Search size={20} className="text-gray-700" />
            </button>
            <button
              type="button"
              onClick={handleCloseSearch}
              className="ml-2 cursor-pointer"
              aria-label="Fermer la recherche"
            >
              <X size={20} className="text-gray-700" />
            </button>
          </form>
        )}
      </div>

      {/* Bouton burger mobile */}
      <button
        ref={burgerRef}
        className="md:hidden inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-100 ml-auto"
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => (open ? handleCloseMenu() : setOpen(true))}
      >
        {open ? (
          <X className="text-gray-700" />
        ) : (
          <Menu className="text-gray-700" />
        )}
      </button>

      {/* Menu mobile avec animation : liens directs + accordéons */}
      {(open || closingMenu) && (
        <div
          id="mobile-menu"
          onKeyDown={handleMobileKeyDown}
          className={`absolute top-full inset-x-0 bg-white shadow-lg md:hidden text-gray-700 ${
            closingMenu ? "animate-slideUp" : "animate-slideDown"
          }`}
        >
          <nav
            className="flex flex-col p-4 space-y-1"
            aria-label="Navigation mobile"
          >
            <Link href="/recherche" onClick={handleCloseMenu} className="py-2">
              Recherche
            </Link>

            {navItems.map((item) => {
              if (item.type === "menu") {
                const sectionOpen = openSection === item.label;
                const sectionActive = item.items.some(({ href }) =>
                  isActivePath(pathname, href)
                );
                const sectionId = `mobile-section-${item.label
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`;
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      aria-expanded={sectionOpen}
                      aria-controls={sectionId}
                      onClick={() =>
                        setOpenSection(sectionOpen ? null : item.label)
                      }
                      className={`w-full flex items-center justify-between py-2 cursor-pointer ${
                        sectionActive ? "text-brand-accent-ink" : ""
                      }`}
                    >
                      <span>{item.label}</span>
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={`transition-transform ${
                          sectionOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {sectionOpen && (
                      <div id={sectionId} className="flex flex-col pl-4">
                        {item.items.map(({ href, label }) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={handleCloseMenu}
                            aria-current={
                              isActivePath(pathname, href) ? "page" : undefined
                            }
                            className={`py-2 ${
                              isActivePath(pathname, href)
                                ? "font-medium text-brand-accent-ink"
                                : ""
                            }`}
                          >
                            {label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const { href, label } = item;
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={handleCloseMenu}
                  aria-current={active ? "page" : undefined}
                  className={
                    item.live
                      ? "flex items-center gap-2 py-2 font-semibold text-brand-accent-dark animate-[ll-blink_2.6s_ease-in-out_infinite]"
                      : `py-2 ${active ? "font-medium text-brand-accent-ink" : ""}`
                  }
                >
                  {item.live ? (
                    <span className="relative h-2 w-2 flex-none" aria-hidden="true">
                      <span className="absolute inset-0 rounded-full bg-brand-accent-dark" />
                      <span className="absolute inset-0 rounded-full bg-brand-accent-dark animate-[ll-pulse_2.4s_ease-out_infinite]" />
                    </span>
                  ) : null}
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
