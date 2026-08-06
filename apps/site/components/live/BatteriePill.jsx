// components/live/BatteriePill.jsx
//
// Charge du tracker, dans un coin de la carte. Volontairement minuscule : c'est
// une information de confort, pas un chiffre à suivre — elle ne doit jamais
// disputer l'attention à la trace.
//
// Elle ne s'affiche QUE si l'appareil publie sa charge (tous les modèles ne le
// font pas, et le champ dépend du décodeur Traccar). Pas de « — » ni de pastille
// vide : sans donnée, rien du tout.

const SEUIL_ALERTE = 20;

export default function BatteriePill({ percent }) {
  if (!Number.isFinite(percent)) return null;

  const bas = percent <= SEUIL_ALERTE;
  // Le remplissage est borné à 2 px pour rester visible même à 1 %.
  const remplissage = Math.max(2, Math.min(100, percent) * 0.13);

  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-[5] inline-flex items-center gap-1.5 rounded-full bg-brand-bg/85 px-2 py-1 backdrop-blur-sm lg:bottom-3.5 lg:right-3.5"
      title={`Charge du tracker : ${percent} %`}
    >
      {/* Pictogramme dessiné plutôt qu'importé : à cette taille, une icône de
          bibliothèque devient illisible, et on veut voir le niveau réel. */}
      <span
        className={`relative block h-[9px] w-[16px] rounded-[2px] border ${
          bas ? "border-red-600/70" : "border-brand-text/45"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute left-[1px] top-[1px] bottom-[1px] rounded-[1px] ${
            bas ? "bg-red-600" : "bg-brand-text/60"
          }`}
          style={{ width: `${remplissage}px` }}
        />
        <span
          className={`absolute -right-[3px] top-1/2 h-[4px] w-[2px] -translate-y-1/2 rounded-r-[1px] ${
            bas ? "bg-red-600/70" : "bg-brand-text/45"
          }`}
        />
      </span>
      <span
        className={`font-heading text-[10px] font-bold tabular-nums ${
          bas ? "text-red-700" : "text-brand-text/70"
        }`}
      >
        {percent} %
      </span>
      <span className="sr-only">de charge restante sur le tracker</span>
    </div>
  );
}
