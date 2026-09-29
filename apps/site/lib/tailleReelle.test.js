import { describe, expect, it } from "vitest";

import { adresseEnTailleReelle } from "./tailleReelle";

describe("adresseEnTailleReelle", () => {
  it("prend la variante la plus large du srcset", () => {
    const srcset = "/images-opt/a-640.webp 640w, /images-opt/a-1600.webp 1600w, /images-opt/a-1080.webp 1080w";
    expect(adresseEnTailleReelle(srcset, "/images-opt/a-1080.webp")).toBe("/images-opt/a-1600.webp");
  });

  it("lit aussi les densités", () => {
    expect(adresseEnTailleReelle("/a.webp 1x, /a@2x.webp 2x", "/a.webp")).toBe("/a@2x.webp");
  });

  it("retombe sur src sans srcset", () => {
    expect(adresseEnTailleReelle(null, "/images/a.webp")).toBe("/images/a.webp");
    expect(adresseEnTailleReelle("", "/images/a.webp")).toBe("/images/a.webp");
  });

  it("garde une candidate sans descripteur", () => {
    expect(adresseEnTailleReelle("/seule.webp", "/src.webp")).toBe("/seule.webp");
  });
});
