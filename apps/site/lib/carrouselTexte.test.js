// lib/carrouselTexte.test.js
//
// Le balisage est la seule chose de l'atelier qu'on tape à l'aveugle : une
// règle qui change en silence casserait des planches déjà écrites.

import { describe, expect, it } from "vitest";

import {
  analyserRiche,
  encreDe,
  fonteDe,
  largeurLigne,
  lignesRiches,
  paragraphesRiches,
  texteNu,
} from "./carrouselTexte";

/** Un contexte 2D de comptoir : une lettre = 10 px, quelle que soit la fonte. */
function ctxFactice() {
  return { font: "", measureText: (t) => ({ width: t.length * 10 }) };
}
const BASE = { police: "Ubuntu", taille: 30, graisse: 400, couleur: "#fff", accent: "#EFB159" };

describe("analyserRiche", () => {
  it("laisse un texte nu intact", () => {
    expect(analyserRiche("Bonjour le monde")).toEqual([{ texte: "Bonjour le monde" }]);
  });

  it("reconnaît les quatre marqueurs", () => {
    expect(analyserRiche("*a*")).toEqual([{ texte: "a", gras: true }]);
    expect(analyserRiche("_a_")).toEqual([{ texte: "a", italique: true }]);
    expect(analyserRiche("~a~")).toEqual([{ texte: "a", souligne: true }]);
    expect(analyserRiche("[a]")).toEqual([{ texte: "a", accent: true }]);
  });

  it("découpe autour du style", () => {
    expect(analyserRiche("avant *pendant* après")).toEqual([
      { texte: "avant " },
      { texte: "pendant", gras: true },
      { texte: " après" },
    ]);
  });

  it("imbrique les styles", () => {
    expect(analyserRiche("*_deux_*")).toEqual([{ texte: "deux", gras: true, italique: true }]);
  });

  it("alterne au lieu d'imbriquer un marqueur déjà ouvert", () => {
    // « a » et « c » en gras, « b » normal — pas une paire absurde.
    expect(analyserRiche("*a*b*c*")).toEqual([
      { texte: "a", gras: true },
      { texte: "b" },
      { texte: "c", gras: true },
    ]);
  });

  it("laisse un marqueur seul tel quel", () => {
    expect(analyserRiche("3 * 4 = 12")).toEqual([{ texte: "3 * 4 = 12" }]);
    expect(analyserRiche("un [crochet")).toEqual([{ texte: "un [crochet" }]);
  });

  it("traite une paire vide comme du texte", () => {
    expect(analyserRiche("**")).toEqual([{ texte: "**" }]);
  });

  it("échappe avec une barre oblique inverse", () => {
    expect(analyserRiche("\\*pas gras\\*")).toEqual([{ texte: "*pas gras*" }]);
  });

  it("rend le texte nu, balises retirées", () => {
    expect(texteNu("un *mot* [en ambre]")).toBe("un mot en ambre");
  });

  it("ne casse pas sur une entrée vide ou absente", () => {
    expect(analyserRiche("")).toEqual([]);
    expect(analyserRiche(null)).toEqual([]);
  });
});

describe("fonteDe", () => {
  it("monte en graisse pour le gras et bascule en italique", () => {
    expect(fonteDe({ gras: true }, BASE)).toBe("700 30px Ubuntu");
    expect(fonteDe({ italique: true }, BASE)).toBe("italic 400 30px Ubuntu");
    expect(fonteDe({ gras: true, italique: true }, BASE)).toBe("italic 700 30px Ubuntu");
  });

  it("ne DESCEND jamais la graisse d'un titre déjà gras", () => {
    // Un titre est en 700 : `*mot*` ne doit pas l'alléger.
    expect(fonteDe({ gras: true }, { ...BASE, graisse: 700 })).toBe("700 30px Ubuntu");
  });
});

describe("lignesRiches", () => {
  const ctx = ctxFactice();

  it("coupe à la largeur demandée", () => {
    const lignes = lignesRiches(ctx, analyserRiche("aaa bbb ccc ddd"), 70, BASE);
    expect(lignes).toHaveLength(2);
    expect(lignes[0].map((m) => m.texte).join("")).toBe("aaa bbb");
  });

  it("ne commence jamais une ligne par un blanc", () => {
    const lignes = lignesRiches(ctx, analyserRiche("aaa bbb ccc"), 40, BASE);
    for (const l of lignes) expect(l[0].texte.trim()).not.toBe("");
  });

  it("ne laisse pas de blanc en fin de ligne", () => {
    // Sinon un texte centré se décale, et un soulignement court dans le vide.
    const lignes = lignesRiches(ctx, analyserRiche("aaa bbb ccc"), 40, BASE);
    for (const l of lignes) expect(l[l.length - 1].texte.trim()).not.toBe("");
  });

  it("garde le style à travers la coupure", () => {
    const lignes = lignesRiches(ctx, analyserRiche("*aaa bbb*"), 40, BASE);
    expect(lignes).toHaveLength(2);
    expect(lignes.every((l) => l.every((m) => m.gras))).toBe(true);
  });

  it("mesure la ligne à partir de ses morceaux", () => {
    const [ligne] = lignesRiches(ctx, analyserRiche("abcd"), 500, BASE);
    expect(largeurLigne(ligne)).toBe(40);
  });
});

describe("paragraphesRiches", () => {
  it("sépare sur une ligne vide, et une seule", () => {
    const p = paragraphesRiches(ctxFactice(), "un\ndeux\n\ntrois", 900, BASE);
    expect(p).toHaveLength(2);
    expect(p[0][0].map((m) => m.texte).join("")).toBe("un deux");
  });

  it("ignore les paragraphes vides", () => {
    expect(paragraphesRiches(ctxFactice(), "\n\n  \n\n", 900, BASE)).toEqual([]);
  });
});

describe("couleurs nommées", () => {
  it("reconnaît un préfixe de couleur connu", () => {
    expect(analyserRiche("[bleu: froid]")).toEqual([
      { texte: "froid", accent: true, couleur: "bleu" },
    ]);
  });

  it("accepte les accents et les majuscules du nom", () => {
    expect(analyserRiche("[Fuchsia: x]")[0].couleur).toBe("fuchsia");
  });

  it("laisse [texte] sur l'ambre du thème", () => {
    expect(analyserRiche("[chaud]")).toEqual([{ texte: "chaud", accent: true }]);
  });

  it("ne mange pas un préfixe INCONNU", () => {
    // « note: » n'est pas une couleur : c'est du texte, il doit rester écrit.
    expect(analyserRiche("[note: à voir]")).toEqual([{ texte: "note: à voir", accent: true }]);
  });

  it("résout l'ambre par le thème, les autres par la charte", () => {
    const base = { accent: "#C08327", couleur: "#222" };
    expect(encreDe({ accent: true }, base)).toBe("#C08327");
    expect(encreDe({ accent: true, couleur: "ambre" }, base)).toBe("#C08327");
    expect(encreDe({ accent: true, couleur: "bleu" }, base)).toBe("#8CB9BD");
    expect(encreDe({}, base)).toBe("#222");
  });
});
