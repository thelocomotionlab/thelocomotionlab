import { describe, expect, it } from "vitest";

import {
  contientUnGroupe,
  degrouper,
  etendreAuxGroupes,
  grouper,
  renouer,
} from "./groupes.ts";
import { formeNeuve, texteNeuf } from "./fabrique.ts";
import type { Element } from "./types.ts";

function lot(): Element[] {
  return [
    texteNeuf({ x: 0, y: 0, l: 0.5, h: 0.1 }, "a", "titre"),
    texteNeuf({ x: 0, y: 0.2, l: 0.5, h: 0.1 }, "b", "corps"),
    formeNeuve({ x: 0, y: 0.4, l: 0.2, h: 0.2 }),
  ];
}

describe("grouper", () => {
  it("noue les éléments choisis sous une même clé", () => {
    const els = lot();
    const noue = grouper(els, [els[0]!.id, els[1]!.id]);
    expect(noue[0]!.groupe).toBeTruthy();
    expect(noue[1]!.groupe).toBe(noue[0]!.groupe);
    expect(noue[2]!.groupe).toBeNull();
  });

  it("ne noue pas un élément seul", () => {
    const els = lot();
    expect(grouper(els, [els[0]!.id])).toBe(els);
  });
});

describe("etendreAuxGroupes", () => {
  it("prend les compagnons quand on prend un membre", () => {
    const base = lot();
    const noue = grouper(base, [base[0]!.id, base[2]!.id]);
    expect(etendreAuxGroupes(noue, [noue[0]!.id])).toEqual([noue[0]!.id, noue[2]!.id]);
  });

  it("rend l'ordre de la planche, pas celui du clic", () => {
    const base = lot();
    const noue = grouper(base, [base[0]!.id, base[2]!.id]);
    expect(etendreAuxGroupes(noue, [noue[2]!.id])).toEqual([noue[0]!.id, noue[2]!.id]);
  });

  it("laisse une sélection sans groupe telle quelle", () => {
    const els = lot();
    const ids = [els[1]!.id];
    expect(etendreAuxGroupes(els, ids)).toBe(ids);
  });
});

describe("degrouper", () => {
  it("dénoue tout le groupe touché, pas seulement le membre visé", () => {
    const base = lot();
    const noue = grouper(base, [base[0]!.id, base[1]!.id]);
    const libre = degrouper(noue, [noue[0]!.id]);
    expect(libre.every((e) => e.groupe === null)).toBe(true);
  });

  it("ne touche pas un autre groupe", () => {
    const base = [...lot(), formeNeuve({ x: 0, y: 0, l: 0.1, h: 0.1 }, { forme: "cercle" })];
    const a = grouper(base, [base[0]!.id, base[1]!.id]);
    const b = grouper(a, [a[2]!.id, a[3]!.id]);
    const libre = degrouper(b, [b[2]!.id]);
    expect(libre[0]!.groupe).toBe(b[0]!.groupe);
    expect(libre[2]!.groupe).toBeNull();
    expect(libre[3]!.groupe).toBeNull();
  });
});

describe("contientUnGroupe", () => {
  it("distingue une sélection nouée d'une sélection libre", () => {
    const base = lot();
    const noue = grouper(base, [base[0]!.id, base[1]!.id]);
    expect(contientUnGroupe(noue, [noue[0]!.id])).toBe(true);
    expect(contientUnGroupe(noue, [noue[2]!.id])).toBe(false);
  });
});

describe("renouer", () => {
  it("donne une clé neuve à la copie, la même pour tous ses membres", () => {
    const base = lot();
    const noue = grouper(base, [base[0]!.id, base[1]!.id]);
    const copies = renouer(noue.slice(0, 2).map((e) => ({ ...e })));
    expect(copies[0]!.groupe).not.toBe(noue[0]!.groupe);
    expect(copies[1]!.groupe).toBe(copies[0]!.groupe);
  });

  it("garde deux groupes distincts distincts", () => {
    const base = lot();
    const a = grouper(base, [base[0]!.id, base[1]!.id]);
    const cle = "groupe-autre";
    const copies = renouer([...a.slice(0, 2), { ...a[2]!, groupe: cle }]);
    expect(copies[2]!.groupe).not.toBe(cle);
    expect(copies[2]!.groupe).not.toBe(copies[0]!.groupe);
  });
});
