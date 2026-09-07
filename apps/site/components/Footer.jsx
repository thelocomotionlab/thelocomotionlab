// components/Footer.jsx
//
// LE PIED DE PAGE DE LA MAQUETTE v6 : bandeau terracotta pleine largeur, la
// marque et le copyright à gauche, les renvois du Labo à droite.
//
// Les trois premiers liens pointent vers les sections du Labo, qui réunit la
// quête, À propos et Contact en une page.

import Link from "next/link";

const LIENS = [
  { href: "/labo#labo-quete", label: "La quête" },
  { href: "/labo#labo-apropos", label: "À propos" },
  { href: "/labo#labo-contact", label: "Contact" },
  { href: "/soutenir", label: "Soutenir" },
  { href: "/mentions-legales", label: "Mentions légales" },
];

export default function Footer() {
  return (
    <footer className="mt-18 bg-brand-deep text-white">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-between gap-6 px-6 py-9 md:px-8">
        <div>
          <p className="m-0 font-heading font-semibold tracking-[0.02em]">Locomotion Lab</p>
          <p className="m-0 mt-1 text-[0.8125rem] opacity-80">
            © {new Date().getFullYear()} — Tous droits réservés.
          </p>
        </div>

        <nav
          aria-label="Liens de pied de page"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        >
          {LIENS.map(({ href, label }) => (
            <Link key={href} href={href} className="text-white no-underline hover:underline">
              {label}
            </Link>
          ))}
          <a
            href="https://www.instagram.com/valent1.fer"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="inline-flex text-white transition-colors hover:text-brand-accent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm4.75-3.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z" />
            </svg>
          </a>
        </nav>
      </div>
    </footer>
  );
}
