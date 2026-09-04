// components/IconeRegistre.jsx
//
// Les icônes du registre, une par branche de Comprendre et une par sorte de
// repli. Même boîte 24×24, même trait de 2, mêmes bouts arrondis que lucide :
// elles tiennent à côté des autres icônes du site sans jurer.
//
// Le registre lit la BRANCHE, pas la sorte : un protocole d'énergie et un
// concept d'énergie portent le même éclair, parce que c'est la famille de
// fluctuations qu'on balaie du regard, pas la nature du texte.

const TRACES = {
  // Les branches de Comprendre.
  energie: ["M13 2 4 14h7l-1 8 9-12h-7l1-8z"],
  thermique: ["M12 3v18", "M5 8l7-5 7 5", "M5 16l7 5 7-5"],
  "charge-et-tissus": ["M6 4v16", "M18 4v16", "M3 8h6", "M15 8h6", "M3 16h6", "M15 16h6"],
  respiration: ["M4 12c3-5 7-5 9 0s5 5 7 0", "M4 18c3-5 7-5 9 0s5 5 7 0"],
  esprit: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  instruments: ["M3 17l6-8 4 5 3-3 5 6", "M3 21h18"],
  // Les sortes, quand aucune branche ne se déduit.
  concept: ["M7 20h10", "M12 20v-6", "M12 14c-3 0-5-2-5-5 3 0 5 2 5 5z", "M12 11c0-3 2-5 5-5 0 3-2 5-5 5z"],
  protocole: ["M12 3v18", "M5 8l7-5 7 5", "M5 16l7 5 7-5"],
  expedition: ["m8 3 4 8 5-5 5 15H2L8 3z"],
  carnet: ["M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z", "M8 4v16", "M12 9h3", "M12 13h3"],
  fiche: ["M8 3h8l2 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7z", "M6 7h12"],
};

export default function IconeRegistre({ cle, className = "" }) {
  const traces = TRACES[cle] ?? TRACES.concept;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {traces.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
