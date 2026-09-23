// components/twin/ErreurDePage.jsx
//
// CE QU'UNE PAGE DU TWIN MONTRE QUAND ELLE NE PEUT PAS S'AFFICHER, à la place de l'écran
// noir et anglais de Next.
//
// Deux cas. Le site a été redéployé pendant que la page était ouverte : elle réclame
// des fichiers de l'ancienne version, que le nouveau déploiement ne sert plus — un
// rechargement suffit, et il se fait seul, une fois. Sinon, l'erreur est dite telle
// quelle : c'est son message qu'il faut transmettre pour la corriger.

"use client";

import { useEffect } from "react";
import { Button } from "@locomotionlab/ui";

import { versionRemplacee } from "@/lib/twinTableauDeBord.mjs";

const DERNIER_RECHARGEMENT = "twin.rechargement-apres-deploiement";

export default function ErreurDePage({ error, titre, conseil }) {
  const remplacee = versionRemplacee(error);

  useEffect(() => {
    if (!remplacee) return;
    let dernier = 0;
    try {
      dernier = Number(sessionStorage.getItem(DERNIER_RECHARGEMENT)) || 0;
    } catch {
      /* stockage indisponible : on recharge quand même, une fois */
    }
    // Un rechargement qui n'a pas suffi ne se répète pas : l'erreur reste affichée.
    if (Date.now() - dernier < 60_000) return;
    try {
      sessionStorage.setItem(DERNIER_RECHARGEMENT, String(Date.now()));
    } catch {
      /* idem */
    }
    window.location.reload();
  }, [remplacee]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-24">
      <p className="font-heading text-[22px] font-bold text-brand-text">{titre}</p>
      <p className="text-sm leading-relaxed text-brand-soft">{conseil}</p>
      {error?.message ? (
        <pre className="whitespace-pre-wrap break-words rounded-md border border-brand-hairline bg-brand-paper px-4 py-3 font-mono text-xs text-brand-muted">
          {error.message}
          {error.digest ? `\n${error.digest}` : ""}
        </pre>
      ) : null}
      <div>
        <Button size="sm" onClick={() => window.location.reload()}>
          Recharger la page
        </Button>
      </div>
    </div>
  );
}
