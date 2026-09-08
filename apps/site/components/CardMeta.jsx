// components/CardMeta.jsx
//
// Ligne méta commune des cartes de contenus (accueil, piliers, live) :
// « RÉCIT · 09/12/2025 », « PROJET · EN COURS », « ARTICLE · À PARAÎTRE ».
// Même casse partout ; le détail après le point médian est en ocre foncé.

export default function CardMeta({ kind, detail = null, className = "" }) {
  return (
    <span
      className={`block truncate font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted ${className}`}
    >
      {kind}
      {detail ? (
        <>
          {" "}
          · <span className="font-bold text-brand-accent-ink">{detail}</span>
        </>
      ) : null}
    </span>
  );
}
