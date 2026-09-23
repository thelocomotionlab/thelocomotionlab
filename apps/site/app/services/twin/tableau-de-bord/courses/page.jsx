// app/services/twin/tableau-de-bord/courses/page.jsx
//
// LA BIBLIOTHÈQUE DES COURSES, et l'éditeur d'une course (`?id=`). Page CLIENT comme le
// reste du tableau de bord : tout se lit sur l'API, avec le jeton.
//
// Hors index, hors plan de site, hors navigation : cf. app/robots.js, app/sitemap.js
// et public/_headers.
import Courses from "@/components/twin/tableau-de-bord/Courses";

export const metadata = {
  title: "Courses – Tableau de bord Twin",
  robots: { index: false, follow: false },
};

export default function CoursesPage() {
  return <Courses />;
}
