// app/services/twin/tableau-de-bord/page.jsx
//
// LA FILE. Page CLIENT : tout se lit sur api.thelocomotionlab.com avec le jeton
// d'administration, rien n'est prérendu — il n'y a rien de public ici.
//
// Deux serrures, et il en faut deux : Cloudflare Access devant la page (elle est
// servie par Cloudflare Pages avec le reste du site), le jeton devant l'API (elle est
// sur un autre domaine, qu'Access ne couvre pas). Sans Access, un visiteur verrait
// l'outil — pas les données, mais l'outil.
//
// Hors index, hors plan de site, hors navigation : cf. app/robots.js, app/sitemap.js
// et public/_headers.
import File from "@/components/twin/tableau-de-bord/File";

export const metadata = {
  title: "File – Tableau de bord Twin",
  robots: { index: false, follow: false },
};

export default function TableauDeBordPage() {
  return <File />;
}
