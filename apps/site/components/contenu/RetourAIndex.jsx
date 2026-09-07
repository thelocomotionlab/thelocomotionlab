// components/contenu/RetourAIndex.jsx
//
// LE RENVOI DE FIN D'ARTICLE : un lien sobre vers l'index dont la page vient,
// posé sous un filet, là où la lecture se termine.

import Link from "next/link";

export default function RetourAIndex({ href, label }) {
  return (
    <div className="mt-12 border-t border-brand-hairline pt-6">
      <Link
        href={href}
        className="inline-block rounded-full border border-brand-text px-[26px] py-[11px] font-heading text-[15px] font-semibold text-brand-text no-underline transition-colors hover:bg-brand-text hover:text-brand-bg"
      >
        {label}
      </Link>
    </div>
  );
}
