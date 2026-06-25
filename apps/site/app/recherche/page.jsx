// app/recherche/page.jsx
//
// Page de recherche : noindex / follow (page interne à thin content),
// et l'index est chargé côté client depuis /search-index.json
// (pré-généré au build par le route handler).

import SearchClient from "./SearchClient";

const SITE_URL = "https://thelocomotionlab.com";

export const metadata = {
  title: "Recherche",
  description:
    "Recherche dans les carnets et projets du Locomotion Lab.",
  alternates: {
    canonical: `${SITE_URL}/recherche`,
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function SearchPage() {
  return <SearchClient />;
}
