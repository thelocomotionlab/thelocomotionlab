// app/labo/page.jsx
//
// L'ancienne page-hub « Le Labo » est remplacée par La quête. La
// redirection 308 vit dans next.config.mjs (redirects(), évaluée avant le
// système de fichiers) : ce composant n'est normalement plus atteignable,
// et redirige en ceinture-bretelles.
import { redirect } from "next/navigation";

export default function LaboPage() {
  redirect("/quete");
}
