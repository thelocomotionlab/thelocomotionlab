// components/twin/tableau-de-bord/Courses.jsx
//
// L'ONGLET COURSES : la bibliothèque, ou l'éditeur d'une course quand la query en nomme
// une. L'identifiant vient de la query, pas du chemin — cf. AthleteDepuisLURL.

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import Bibliotheque from "./Bibliotheque";
import Coquille from "./Coquille";
import Editeur from "./editeur/Editeur";

function DepuisLaQuery() {
  const query = useSearchParams();
  const id = query.get("id") || "";
  if (!id) return <Bibliotheque />;
  return (
    <Coquille actif="Courses" chemin={`/courses/${encodeURIComponent(id)}`}>
      {(course) => <Editeur key={course.id} initiale={course} etapeInitiale={query.get("etape") || ""} />}
    </Coquille>
  );
}

export default function Courses() {
  return (
    <Suspense fallback={null}>
      <DepuisLaQuery />
    </Suspense>
  );
}
