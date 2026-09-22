// app/services/twin/tableau-de-bord/athletes/page.jsx
//
// LA FICHE D'UN ATHLÈTE. Page CLIENT comme la File, pour les mêmes raisons : rien
// n'est prérendu, tout se lit sur l'API avec le jeton.
//
// Hors index, hors plan de site, hors navigation : cf. app/robots.js, app/sitemap.js
// et public/_headers.
import AthleteDepuisLURL from "@/components/twin/tableau-de-bord/AthleteDepuisLURL";

export const metadata = {
  title: "Athlète – Tableau de bord Twin",
  robots: { index: false, follow: false },
};

export default function AthletePage() {
  return <AthleteDepuisLURL />;
}
