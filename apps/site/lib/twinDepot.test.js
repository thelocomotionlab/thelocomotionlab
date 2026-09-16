import { describe, expect, it } from "vitest";

import { DEPOT_API_DEFAUT, depotApiBase, messageDErreur, urlDepots } from "@/lib/twinDepot.mjs";

describe("adresse du service de dépôt", () => {
  it("vaut la production quand la variable d'environnement est absente", () => {
    // LE bug corrigé : un build sans variable posait une base vide, et le
    // formulaire refusait tout envoi alors que le service tournait.
    expect(depotApiBase({})).toBe(DEPOT_API_DEFAUT);
    expect(urlDepots({})).toBe("https://depot.thelocomotionlab.com/twin/depots");
  });

  it("se laisse surcharger, et tolère une barre oblique finale", () => {
    const env = { NEXT_PUBLIC_TWIN_DEPOT_API: "http://localhost:3000/twin/" };
    expect(depotApiBase(env)).toBe("http://localhost:3000/twin");
    expect(urlDepots(env)).toBe("http://localhost:3000/twin/depots");
  });

  it("se désactive sur une valeur vide explicite", () => {
    expect(depotApiBase({ NEXT_PUBLIC_TWIN_DEPOT_API: "  " })).toBe("");
    expect(urlDepots({ NEXT_PUBLIC_TWIN_DEPOT_API: "" })).toBeNull();
  });
});

describe("ce qu'on dit quand le dépôt refuse", () => {
  it("nomme la cause quand le service la donne", () => {
    const { message, code } = messageDErreur(400, '{"ok":false,"error":"montre_invalide"}');
    expect(code).toBe("montre_invalide");
    expect(message).toContain("étape 1");
  });

  it("distingue « jamais arrivé » de « refusé »", () => {
    const injoignable = messageDErreur(0, "");
    expect(injoignable.code).toBe("injoignable");
    expect(injoignable.contact).toBe(true);
    expect(injoignable.message).toContain("n'a pas répondu");

    const refuse = messageDErreur(400, "pas du json");
    expect(refuse.code).toBe("http_400");
    expect(refuse.message).toContain("refusé");
  });

  it("garde les cas trop gros et trop fréquents", () => {
    expect(messageDErreur(413, "").code).toBe("archive_trop_grosse");
    expect(messageDErreur(413, "").contact).toBe(true);
    expect(messageDErreur(429, "").contact).toBe(false);
    expect(messageDErreur(502, "").code).toBe("http_502");
  });
});
