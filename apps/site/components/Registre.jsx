// components/Registre.jsx
//
// Une ligne par entrée — icône, titre, « en bref », état, date — sous un
// filet. C'est le motif du registre de l'accueil, étendu à tout ce qui n'a
// pas de photo. Les items arrivent pré-formatés (lib/registre.mjs) : ce
// composant ne fait que dessiner, et reste donc utilisable depuis un composant
// client comme depuis un composant serveur.

import Link from "next/link";
import IconeRegistre from "@/components/IconeRegistre";

export function Chip({ chip }) {
  if (!chip) return null;
  return <span className={`ll-chip ll-chip--${chip.ton}`}>{chip.label}</span>;
}

function Ligne({ item, pilier }) {
  return (
    <li>
      <Link href={item.href} className={`ll-registre-row ll-registre-row--${pilier}`}>
        <IconeRegistre cle={item.icone} className="ll-registre-ico" />
        <div className="min-w-0">
          <p className="ll-registre-t">{item.title}</p>
          {item.resume ? <p className="ll-registre-b">{item.resume}</p> : null}
        </div>
        <div className="ll-registre-meta">
          <Chip chip={item.chip} />
          {item.date ? <span className="ll-registre-d">{item.date}</span> : null}
        </div>
      </Link>
    </li>
  );
}

export default function Registre({ items = [], pilier = "comprendre" }) {
  if (!items.length) return null;
  return (
    <ul className="ll-registre">
      {items.map((item) => (
        <Ligne key={item.slug ?? item.href} item={item} pilier={pilier} />
      ))}
    </ul>
  );
}
