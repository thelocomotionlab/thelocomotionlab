// app/services/twin/plan/[ref]/error.jsx
//
// Une erreur sur la page d'un plan : l'athlète lit quoi faire, pas un écran noir.
"use client";

import ErreurDePage from "@/components/twin/ErreurDePage";

export default function Erreur({ error }) {
  return (
    <ErreurDePage
      error={error}
      titre="Ta page n'a pas pu s'afficher."
      conseil="Recharge-la. Si elle ne revient pas, ton PDF porte le même plan : garde-le sous la main, et écris au laboratoire avec le message ci-dessous."
    />
  );
}
