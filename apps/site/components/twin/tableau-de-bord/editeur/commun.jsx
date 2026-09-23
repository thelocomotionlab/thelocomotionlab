// components/twin/tableau-de-bord/editeur/commun.jsx
//
// Les petites pièces que les trois étapes de l'éditeur partagent : une ligne de chiffre,
// un champ numérique court, une case à cocher, le cadre de l'inspecteur, et le bandeau
// « Annuler » qui suit toute suppression.

"use client";

import { useEffect } from "react";
import { Button, Case as CaseDeLaCharte, ChampCompact } from "@locomotionlab/ui";

import { ETIQUETTE } from "../Coquille";

export function Titre({ children, sousTitre }) {
  return (
    <div>
      <h2 className="font-heading text-[22px] font-bold text-brand-text">{children}</h2>
      {sousTitre ? <p className="mt-1 text-sm text-brand-muted">{sousTitre}</p> : null}
    </div>
  );
}

export function Bloc({ titre, children, className = "" }) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {titre ? <p className={ETIQUETTE}>{titre}</p> : null}
      {children}
    </section>
  );
}

/** Un chiffre et sa légende, comme sur la planche Trace. */
export function Chiffre({ titre, valeur, legende, ton = "" }) {
  return (
    <div className="border-t border-brand-grid pt-3">
      <p className={ETIQUETTE}>{titre}</p>
      <p
        className={`mt-1 font-heading text-[24px] font-light leading-none ${
          ton === "alerte" ? "text-brand-deep" : "text-brand-text"
        }`}
      >
        {valeur}
      </p>
      {legende ? <p className="mt-1 text-xs leading-relaxed text-brand-muted">{legende}</p> : null}
    </div>
  );
}

/** Un champ court, étiquette au-dessus, unité à droite. Vide reste vide. L'écran lui
 *  passe une valeur et reçoit une valeur : c'est ChampCompact, sans l'événement. */
export function ChampCourt({ onChange, value, ...reste }) {
  return (
    <ChampCompact
      value={value ?? ""}
      onChange={(evenement) => onChange(evenement.target.value)}
      type={reste.type ?? "number"}
      {...reste}
    />
  );
}

export function Case({ label, checked, onChange, aide, radio, name }) {
  return <CaseDeLaCharte label={label} checked={Boolean(checked)} surChange={onChange} aide={aide} radio={radio} name={name} />;
}

export function Inspecteur({ titre, children }) {
  return (
    <aside className="flex flex-col gap-5 border-l border-brand-hairline bg-brand-paper px-6 py-7">
      {titre ? <p className={ETIQUETTE}>{titre}</p> : null}
      {children}
    </aside>
  );
}

/**
 * Le bandeau qui suit une suppression ou un import. Rien n'est définitif pendant qu'il
 * est là : « Annuler » remet la liste à l'identique. Sans rien à défaire, il annonce.
 */
export function BandeauAnnuler({ message, surAnnuler, surFermer, annulable = true, duree = 8000 }) {
  useEffect(() => {
    if (!message) return undefined;
    const minuteur = setTimeout(surFermer, duree);
    return () => clearTimeout(minuteur);
  }, [message, surFermer, duree]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-brand-text px-5 py-2.5 text-sm text-brand-paper shadow-card"
    >
      <span>{message}</span>
      {annulable ? (
        <Button variant="secondary" size="sm" onClick={surAnnuler}>
          Annuler
        </Button>
      ) : null}
    </div>
  );
}
