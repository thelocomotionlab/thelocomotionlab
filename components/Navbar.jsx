// components/Navbar.jsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  FlaskConical,
  HeartHandshake,
  Menu,
  X,
  Search,
} from "lucide-react";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/articles", label: "Carnets", Icon: BookOpen },
  { href: "/projets", label: "Projets", Icon: FlaskConical },
  { href: "/soutenir", label: "Soutenir", Icon: HeartHandshake },
];

function isActivePath(pathname, href) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [closingMenu, setClosingMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

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
    }, 300);
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
        {NAV_LINKS.map(({ href, label, Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`hover:text-brand-accent flex items-center gap-1 ${
                active ? "text-brand-accent" : ""
              }`}
            >
              <Icon
                size={18}
                className={active ? "text-brand-accent" : "text-gray-700"}
                aria-hidden="true"
              />
              <span
                className={
                  active
                    ? "underline underline-offset-4 decoration-2"
                    : ""
                }
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Barre de recherche à droite */}
      <div className="hidden md:flex items-center ml-auto">
        {!searchOpen ? (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 hover:text-brand-accent cursor-pointer"
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

      {/* Menu mobile avec animation */}
      {(open || closingMenu) && (
        <div
          id="mobile-menu"
          className={`absolute top-full inset-x-0 bg-white shadow-lg md:hidden text-gray-700 ${
            closingMenu ? "animate-slideUp" : "animate-slideDown"
          }`}
        >
          <div
            className="flex flex-col p-4 space-y-3"
            role="menu"
            aria-label="Navigation mobile"
          >
            <Link href="/recherche" onClick={handleCloseMenu} className="py-2">
              Recherche
            </Link>
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={handleCloseMenu}
                  aria-current={active ? "page" : undefined}
                  className={`py-2 ${active ? "text-brand-accent font-semibold" : ""}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
