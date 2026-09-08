// components/DonneesStructurees.jsx
//
// Le porteur des données structurées (JSON-LD) d'une page.
//
// Les objets eux-mêmes sont fabriqués par lib/jsonld.js ; ce composant se
// contente de les sérialiser dans le document. Il en accepte plusieurs pour
// qu'une page puisse déclarer à la fois ce qu'elle est et où elle se situe.

// Un « < » dans un titre fermerait la balise script avant la fin du JSON.
// Échappé sous sa forme unicode, il reste lisible par un parseur JSON et
// inerte pour le parseur HTML.
const serialiser = (objet) => JSON.stringify(objet).replace(/</g, "\\u003c");

export default function DonneesStructurees({ id, donnees }) {
  const graphe = Array.isArray(donnees) ? donnees : [donnees];

  return graphe.map((objet, rang) => (
    <script
      key={`${id}-${rang}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiser(objet) }}
    />
  ));
}
