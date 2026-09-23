// app/services/twin/tableau-de-bord/plan/page.jsx
//
// L'ÉCRAN PLAN : composer (`?athlete=`), voir, publier et envoyer (`?ref=`). Page CLIENT
// comme le reste du tableau de bord.
//
// Hors index, hors plan de site, hors navigation : cf. app/robots.js, app/sitemap.js
// et public/_headers.
import Plan from "@/components/twin/tableau-de-bord/plan/Plan";

export const metadata = {
  title: "Plan – Tableau de bord Twin",
  robots: { index: false, follow: false },
};

export default function PlanPage() {
  return <Plan />;
}
