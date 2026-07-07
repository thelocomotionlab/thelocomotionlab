// components/Footer.jsx
import Link from "next/link";
import EmailCapture from "./EmailCapture";

export default function Footer() {
  return (
    <footer className="bg-brand-deep text-white mt-12">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        {/* Capture email de pied de page, visible sur tout le site. */}
        <div className="bg-white rounded-2xl shadow-card px-4 py-5 sm:px-6 mb-8 max-w-2xl mx-auto">
          <EmailCapture
            title="Suivre le Lab"
            description={null}
            source="footer"
            placeholder="Votre adresse e-mail"
            buttonLabel="M'inscrire"
          />
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="font-semibold tracking-wide">The Locomotion Lab</p>
            <p className="opacity-80 text-sm">
              © {new Date().getFullYear()} — Tous droits réservés.
            </p>
          </div>
          <nav
            aria-label="Liens de pied de page"
            className="flex items-center gap-4 text-sm"
          >
            <Link
              className="underline-offset-4 hover:underline"
              href="/about"
            >
              À propos
            </Link>
            <Link
              className="underline-offset-4 hover:underline"
              href="/contact"
            >
              Contact
            </Link>
            <Link
              className="underline-offset-4 hover:underline"
              href="/mentions-legales"
            >
              Mentions légales
            </Link>
            <a
              href="https://www.instagram.com/thelocomotionlab"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Suivre The Locomotion Lab sur Instagram (nouvel onglet)"
              className="hover:text-brand-accent"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm4.75-3.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z" />
              </svg>
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
