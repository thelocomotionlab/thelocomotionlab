// app/services/twin/tableau-de-bord/error.jsx
//
// Une erreur dans un écran du tableau de bord : le reste du site reste en place, et
// l'erreur se lit au lieu de l'écran noir.
"use client";

import ErreurDePage from "@/components/twin/ErreurDePage";

export default function Erreur({ error }) {
  return (
    <ErreurDePage
      error={error}
      titre="Cet écran n'a pas pu s'afficher."
      conseil="Recharge la page. Si l'écran ne revient pas, copie le message ci-dessous : c'est lui qui dit quoi corriger."
    />
  );
}
