// components/contenu/EnTeteDIndex.jsx
//
// L'EN-TÊTE D'UNE PAGE D'INDEX : titre, accroche, filet ocre.
//
// Le même motif sur Blog, Aventures, Science, Labo et Services ; seule la
// couleur du titre change, parce qu'elle dit de quel registre on parle.

import { Accroche } from "@locomotionlab/ui/contenu";

const TEINTES = {
  neutre: "text-brand-text",
  aventure: "text-brand-deep",
  science: "text-brand-slate-dark",
};

export default function EnTeteDIndex({ titre, accroche, teinte = "neutre" }) {
  return (
    <header>
      <h1
        className={`m-0 font-heading text-[34px] font-bold leading-[1.05] tracking-[-0.015em] md:text-[46px] ${TEINTES[teinte]}`}
      >
        {titre}
      </h1>
      {accroche ? <Accroche>{accroche}</Accroche> : null}
      <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
    </header>
  );
}
