// app/soutenir/page.jsx
//
// Soutenir vit désormais dans Le Labo, au-dessus de Contact. La route reste
// servie parce que des billets et des liens extérieurs y pointent : elle
// redirige, en permanent, vers la section.

import { permanentRedirect } from "next/navigation";

export default function SoutenirPage() {
  permanentRedirect("/labo#labo-soutenir");
}
