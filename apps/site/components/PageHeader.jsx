// components/PageHeader.jsx
//
// En-tête des pages secondaires (recherche, mentions, soutenir, cohorte).
// Il rend l'en-tête d'index de la charte : même titre, même accroche en
// romain maigre, même filet ocre — la seule différence est l'alignement,
// que certaines de ces pages centrent.

import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";

export default function PageHeader({ title, tagline = null, className = "" }) {
  return (
    <div className={`mb-10 ${className}`}>
      <EnTeteDIndex titre={title} accroche={tagline} />
    </div>
  );
}
