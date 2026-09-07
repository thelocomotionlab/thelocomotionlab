// Une carte qui pointe vers un id absent de l'index fait échouer le build, avec
// le message du §9, et pas seulement dans la fonction de validation : le script
// lancé par `pnpm -F site build` doit sortir en erreur.

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { messages, validerContenu } from "../src/index.ts";
import { billet, sansBibliographie } from "./aide.ts";

const executer = promisify(execFile);
const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "construire-index.ts",
);

const CORPS_ORPHELIN = `Un billet qui cite un protocole disparu.

<VersProtocole id="protocole-fantome" />
`;

describe("une carte vers un id inexistant", () => {
  it("produit le message exact du §9", () => {
    const resultat = validerContenu({
      documents: [billet("nouveau-bloc", CORPS_ORPHELIN)],
      ...sansBibliographie,
    });

    expect(resultat.erreurs).toEqual([
      '<VersProtocole id="protocole-fantome"> dans content/blog/nouveau-bloc.mdx : aucun bloc ne porte cet id',
    ]);
    expect(messages.carteSansBloc("protocole-fantome", "content/blog/nouveau-bloc.mdx")).toBe(
      resultat.erreurs[0],
    );
  });

  it("vaut aussi pour un id cité par `protocoles` en frontmatter", () => {
    const resultat = validerContenu({
      documents: [
        {
          fichier: "content/aventures/reunion-2025.mdx",
          donnees: {
            sorte: "aventure",
            titre: "Traversée de La Réunion en autonomie",
            slug: "reunion-2025",
            statut: "publie",
            chapeau: "170 km et deux pitons.",
            etat: "termine",
            campagne: { debut: "2025-09-29" },
            sections: [{ type: "preparation", protocoles: ["protocole-fantome"] }],
          },
          corps: "",
        },
      ],
      ...sansBibliographie,
    });

    expect(resultat.erreurs).toEqual([
      '<VersProtocole id="protocole-fantome"> dans content/aventures/reunion-2025.mdx : aucun bloc ne porte cet id',
    ]);
  });

  it("fait sortir le script de build en erreur", async () => {
    const racine = await mkdtemp(join(tmpdir(), "contenu-"));
    const contenu = join(racine, "content");
    const paquetages = join(racine, "paquetages");
    await mkdir(join(contenu, "blog"), { recursive: true });
    await mkdir(paquetages, { recursive: true });
    await writeFile(join(racine, "bibliography.json"), "{}");
    await writeFile(
      join(contenu, "blog", "nouveau-bloc.mdx"),
      `---
sorte: billet
titre: "Nouveau bloc d'entraînement"
slug: "nouveau-bloc"
statut: publie
chapeau: "Un chapeau."
date: 2026-05-17
type: billet
---

${CORPS_ORPHELIN}`,
    );

    const echec = await executer("node", [
      script,
      "--contenu",
      contenu,
      "--bibliographie",
      join(racine, "bibliography.json"),
      "--paquetages",
      paquetages,
      "--sortie",
      join(racine, "blocs.json"),
    ]).catch((erreur: Error & { code?: number; stderr?: string }) => erreur);

    expect(echec).toBeInstanceOf(Error);
    const sortie = echec as Error & { code?: number; stderr?: string };
    expect(sortie.code).toBe(1);
    expect(sortie.stderr).toContain(
      'aucun bloc ne porte cet id',
    );
  });
});
