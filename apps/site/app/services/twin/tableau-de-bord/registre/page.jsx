// app/services/twin/tableau-de-bord/registre/page.jsx
//
// LE REGISTRE DE COUVERTURE, calculé depuis les plans qui ont un résultat. Page CLIENT
// comme le reste du tableau de bord.
//
// Hors index, hors plan de site, hors navigation : cf. app/robots.js, app/sitemap.js
// et public/_headers.
import Registre from "@/components/twin/tableau-de-bord/Registre";

export const metadata = {
  title: "Registre – Tableau de bord Twin",
  robots: { index: false, follow: false },
};

export default function RegistrePage() {
  return <Registre />;
}
