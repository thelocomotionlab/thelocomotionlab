// app/labo/page.jsx
//
// L'ancienne page-hub « Le Labo » est remplacée par le Manifeste (refonte
// PR2). La redirection 301 vit dans next.config.mjs (redirects(), évaluée
// avant le système de fichiers) : ce composant n'est normalement plus
// atteignable, mais le fichier est conservé (règle : pas de suppression)
// et redirige en ceinture-bretelles.
import { redirect } from "next/navigation";

export default function LaboPage() {
  redirect("/manifeste");
}
