import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  REF_AUCUNE_ANNEXE,
  annexeRefParams,
  getAnnexe,
  listAnnexeRefs,
} from "@/lib/twinAnnexes.mjs";

const cwd = process.cwd();
const dirs = [];

function avecAnnexes(fichiers) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "twin-annexes-"));
  const dossier = path.join(racine, "public", "twin-annexes");
  fs.mkdirSync(dossier, { recursive: true });
  for (const [nom, contenu] of Object.entries(fichiers)) {
    fs.writeFileSync(path.join(dossier, nom), contenu);
  }
  dirs.push(racine);
  process.chdir(racine);
}

afterEach(() => {
  process.chdir(cwd);
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("annexes de rapport twin", () => {
  it("liste les références déposées et ignore le reste", () => {
    avecAnnexes({
      "LL-TWIN-A1B2C3D4.json": JSON.stringify({ ref: "LL-TWIN-A1B2C3D4" }),
      "LL-TWIN-00000001.json": JSON.stringify({ ref: "LL-TWIN-00000001" }),
      "notes.txt": "pas une annexe",
      ".cache.json": "{}",
    });
    expect(listAnnexeRefs()).toEqual(["LL-TWIN-00000001", "LL-TWIN-A1B2C3D4"]);
  });

  it("lit une annexe et refuse une référence hors format ou un JSON cassé", () => {
    avecAnnexes({
      "LL-TWIN-A1B2C3D4.json": JSON.stringify({ ref: "LL-TWIN-A1B2C3D4", athlete: "Val" }),
      "LL-TWIN-CASSEE.json": "{ pas du json",
    });
    expect(getAnnexe("LL-TWIN-A1B2C3D4").athlete).toBe("Val");
    expect(getAnnexe("LL-TWIN-CASSEE")).toBeNull();
    expect(getAnnexe("LL-TWIN-INCONNUE")).toBeNull();
    // jamais de traversée de chemin, jamais de lecture hors du dossier
    expect(getAnnexe("../../package")).toBeNull();
    expect(getAnnexe("")).toBeNull();
    expect(getAnnexe(null)).toBeNull();
  });

  it("ne rend JAMAIS une liste de paramètres vide (piège next-on-pages)", () => {
    avecAnnexes({});
    expect(annexeRefParams()).toEqual([{ ref: REF_AUCUNE_ANNEXE }]);
    avecAnnexes({ "LL-TWIN-A1B2C3D4.json": JSON.stringify({ ref: "LL-TWIN-A1B2C3D4" }) });
    expect(annexeRefParams()).toEqual([{ ref: "LL-TWIN-A1B2C3D4" }]);
  });
});
