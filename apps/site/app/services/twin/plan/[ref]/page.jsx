// app/services/twin/plan/[ref]/page.jsx
//
// LA PAGE D'UN PLAN, au lien que l'athlète reçoit : /services/twin/plan/<référence>?k=<clé>.
//
// La seule route dynamique du site. Les références naissent dans le tableau de bord,
// après le build : aucune liste à prérendre. La page est donc rendue à la demande, par
// une fonction Edge de Cloudflare Pages (next-on-pages n'en accepte pas d'autre), et ce
// qu'elle rend n'est qu'une coquille : le plan se lit ensuite sur l'API, avec la clé.
//
// Hors index, hors plan de site, hors navigation : balise `robots`, en-têtes
// `X-Robots-Tag` et `Referrer-Policy` (next.config.mjs), `robots.txt`. L'adresse porte la
// clé : elle ne doit partir nulle part, pas même dans un en-tête Referer.
import PageDuPlan from "@/components/twin/plan/PageDuPlan";

export const runtime = "edge";

export const metadata = {
  title: "Ton plan – Locomotion Twin",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PlanPage({ params }) {
  const { ref } = await params;
  return <PageDuPlan reference={decodeURIComponent(ref)} />;
}
