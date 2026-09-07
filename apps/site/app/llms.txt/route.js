// app/llms.txt/route.js
//
// /llms.txt — une carte du site en markdown, pour les modèles de langage qui
// veulent en comprendre la structure. Générée au build depuis le modèle de
// contenu : ce qui n'est pas publié n'y figure pas.

import { parSorte, aventures, articles, registreDuBlog, urlDe } from "@/lib/contenu";
import { dateLisible } from "@/lib/lisible";

const SITE_URL = "https://thelocomotionlab.com";

export const dynamic = "force-static";

function ligne(page, quand) {
  const { titre, chapeau } = page.frontmatter;
  const date = quand ? ` (${dateLisible(quand)})` : "";
  return `- [${titre}](${SITE_URL}${urlDe(page)})${date}: ${chapeau}`;
}

function buildLlmsTxt() {
  const lignes = [];

  lignes.push("# The Locomotion Lab");
  lignes.push("");
  lignes.push(
    "> Espace d'exploration de la robustesse physiologique : mouvement primal, ultra-endurance, minimalisme, hormèse.",
  );
  lignes.push("");
  lignes.push(
    "Le Locomotion Lab est un laboratoire vivant qui explore les facteurs et pratiques favorisant la robustesse physiologique. Le contenu se range en quatre sortes : les aventures (campagnes : données, préparation, matériel, direct), leurs récits, les billets du carnet de bord, et les articles Science — des documents sourcés, datés et révisés.",
  );
  lignes.push("");

  lignes.push("## Index");
  lignes.push("");
  lignes.push(`- [Accueil](${SITE_URL}/)`);
  lignes.push(`- [Science](${SITE_URL}/science): les articles de fond, sourcés et révisés`);
  lignes.push(`- [Aventures](${SITE_URL}/aventures): les campagnes, une par une`);
  lignes.push(`- [Blog](${SITE_URL}/blog): le carnet de bord, au jour le jour`);
  lignes.push(`- [Services](${SITE_URL}/services): le Locomotion Twin et les ateliers`);
  lignes.push(`- [Labo](${SITE_URL}/labo): la quête, qui est derrière, comment écrire`);
  lignes.push(`- [Live](${SITE_URL}/live): le direct des aventures, ou le prochain départ`);
  lignes.push("");

  const science = articles();
  if (science.length) {
    lignes.push("## Science");
    lignes.push("");
    for (const page of science) {
      lignes.push(ligne(page, page.frontmatter.revise_le ?? page.frontmatter.publie_le));
    }
    lignes.push("");
  }

  const campagnes = aventures();
  if (campagnes.length) {
    lignes.push("## Aventures");
    lignes.push("");
    for (const page of campagnes) {
      lignes.push(ligne(page, page.frontmatter.campagne.debut));
    }
    lignes.push("");
  }

  const recits = parSorte("recit");
  if (recits.length) {
    lignes.push("## Récits");
    lignes.push("");
    for (const page of recits) lignes.push(ligne(page, page.frontmatter.date));
    lignes.push("");
  }

  const carnet = registreDuBlog().filter((page) => page.frontmatter.sorte === "billet");
  if (carnet.length) {
    lignes.push("## Blog");
    lignes.push("");
    for (const page of carnet) lignes.push(ligne(page, page.frontmatter.date));
    lignes.push("");
  }

  return lignes.join("\n");
}

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
