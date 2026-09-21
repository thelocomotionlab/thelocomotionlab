import { describe, expect, it } from "vitest";

import {
  RENDU_API_DEFAUT,
  messageDeRendu,
  nomDuZip,
  refaireDocuments,
  renduApiBase,
  urlRendu,
} from "@/lib/twinRendu.mjs";

const OK = (blob = new Blob(["zip"])) => ({ ok: true, status: 200, blob: async () => blob });
const KO = (status) => ({ ok: false, status });

describe("l'adresse du moteur", () => {
  it("vaut la production quand rien n'est posé — une adresse publique ne manque pas au build", () => {
    expect(renduApiBase({})).toBe(RENDU_API_DEFAUT);
    expect(urlRendu({})).toBe(`${RENDU_API_DEFAUT}/rendu`);
  });

  it("se laisse surcharger, et se laisse éteindre", () => {
    expect(urlRendu({ NEXT_PUBLIC_TWIN_RENDU_API: "http://localhost:8000/" }))
      .toBe("http://localhost:8000/rendu");
    expect(urlRendu({ NEXT_PUBLIC_TWIN_RENDU_API: " " })).toBe(null);
  });

  it("le nom du fichier ne reprend que ce qui ressemble à une référence", () => {
    expect(nomDuZip("LL-TWIN-2026-07")).toBe("locomotion-twin-LL-TWIN-2026-07.zip");
    expect(nomDuZip("../../etc/passwd")).toBe("locomotion-twin-etcpasswd.zip");
    expect(nomDuZip(null)).toBe("locomotion-twin-rapport.zip");
  });
});

describe("refaire ses documents", () => {
  it("envoie la référence et l'amendement, et rend le fichier", async () => {
    let vu = null;
    const fetcher = async (url, init) => {
      vu = { url, corps: JSON.parse(init.body), methode: init.method };
      return OK();
    };
    const amendement = { reglages: [{ aid_index: 2, stop_min: 20 }] };
    const r = await refaireDocuments({ ref: "LL-TWIN-X", amendement, env: {}, fetcher });
    expect(r.ok).toBe(true);
    expect(vu.methode).toBe("POST");
    expect(vu.url).toBe(`${RENDU_API_DEFAUT}/rendu`);
    expect(vu.corps).toEqual({ ref: "LL-TWIN-X", amendement });
  });

  it("sans rien de modifié, demande le jeu du rapport tel quel", async () => {
    let corps = null;
    const fetcher = async (_u, init) => {
      corps = JSON.parse(init.body);
      return OK();
    };
    await refaireDocuments({ ref: "LL-TWIN-X", amendement: null, env: {}, fetcher });
    expect(corps.amendement).toBe(null);
  });

  it("le moteur éteint ne fait pas croire à une panne réseau", async () => {
    const r = await refaireDocuments({
      ref: "LL-TWIN-X",
      env: { NEXT_PUBLIC_TWIN_RENDU_API: " " },
      fetcher: () => {
        throw new Error("le fetch ne devrait pas être appelé");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("injoignable");
  });

  it("une requête qui n'arrive jamais le DIT, au lieu du « vérifie ta connexion »", async () => {
    const r = await refaireDocuments({
      ref: "LL-TWIN-X", env: {}, fetcher: async () => { throw new TypeError("network"); },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("injoignable");
    expect(r.message).toContain("n'a pas répondu");
  });

  it("chaque refus du moteur a son mot, et son code technique", async () => {
    for (const [statut, code] of [[404, "introuvable"], [422, "refuse"], [413, "refuse"],
                                  [429, "occupe"], [500, "http_500"]]) {
      const r = await refaireDocuments({ ref: "X", env: {}, fetcher: async () => KO(statut) });
      expect(r.ok).toBe(false);
      expect(r.code).toBe(code);
      expect(r.message.length).toBeGreaterThan(20);
    }
  });

  it("un refus laisse toujours une porte de sortie à l'athlète", () => {
    // le JSON des réglages reste téléchargeable : le bouton n'est pas le seul chemin
    for (const statut of [0, 404, 422, 429, 500, 503]) {
      expect(messageDeRendu(statut).message).toBeTruthy();
    }
    expect(messageDeRendu(0).message).toContain("JSON");
    expect(messageDeRendu(500).message).toContain("JSON");
  });
});
