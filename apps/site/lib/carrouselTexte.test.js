// lib/carrouselTexte.test.js
//
// Le balisage est la seule chose de l'atelier qu'on tape à l'aveugle : une
// règle qui change en silence casserait des planches déjà écrites.

import { describe, expect, it } from "vitest";

import {
  ESPACEMENT,
  analyserRiche,
  blocsDeTexte,
  hauteurBlocs,
  encreDe,
  fonteDe,
  largeurLigne,
  lignesRiches,
  texteNu,
  largeurIcone,
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

describe("icônes dans le texte", () => {
  it("reconnaît une clé du vocabulaire des repères", () => {
    expect(analyserRiche("au :col: puis au :bivouac:")).toEqual([
      { texte: "au " },
      { texte: "", icone: "col" },
      { texte: " puis au " },
      { texte: "", icone: "bivouac" },
    ]);
  });

  it("laisse un deux-points ordinaire tranquille", () => {
    // « Départ : 6 h » ne doit surtout pas devenir une icône.
    expect(analyserRiche("Départ : 6 h")).toEqual([{ texte: "Départ : 6 h" }]);
  });

  it("laisse une clé INCONNUE écrite plutôt que de l'avaler", () => {
    expect(analyserRiche(":licorne:")).toEqual([{ texte: ":licorne:" }]);
  });

  it("hérite du style et de la couleur qui l'entourent", () => {
    expect(analyserRiche("[bleu: froid :neige:]")).toEqual([
      { texte: "froid ", accent: true, couleur: "bleu" },
      { texte: "", accent: true, couleur: "bleu", icone: "neige" },
    ]);
  });

  it("compte comme un mot insécable à la mise en lignes", () => {
    const ctx = ctxFactice();
    const [ligne] = lignesRiches(ctx, analyserRiche(":col:"), 500, BASE);
    expect(ligne).toHaveLength(1);
    expect(ligne[0].largeur).toBe(largeurIcone(BASE));
  });

  it("n'est pas confondue avec un blanc de fin de ligne", () => {
    const ctx = ctxFactice();
    const lignes = lignesRiches(ctx, analyserRiche("aaaa :col:"), 60, BASE);
    expect(lignes[lignes.length - 1].some((m) => m.icone === "col")).toBe(true);
  });
});

describe("blocs : listes, paragraphes, respirations", () => {
  const ctx = ctxFactice();
  const blocs = (t, l = 500) => blocsDeTexte(ctx, t, l, BASE);

  it("fait un paragraphe des lignes consécutives", () => {
    const b = blocs("un\ndeux");
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("paragraphe");
    expect(b[0].lignes[0].map((m) => m.texte).join("")).toBe("un deux");
  });

  it("reconnaît une liste sur les lignes qui commencent par un tiret", () => {
    const b = blocs("- eau\n- bois\n- feu");
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("liste");
    expect(b[0].items).toHaveLength(3);
  });

  it("sépare une liste du paragraphe qui la précède", () => {
    const b = blocs("Dans le sac :\n- eau\n- bois");
    expect(b.map((x) => x.type)).toEqual(["paragraphe", "liste"]);
  });

  it("UNE ligne vide sépare, CHAQUE ligne vide en plus aère", () => {
    // Le geste naturel : appuyer plusieurs fois sur Entrée donne plus d'air.
    expect(blocs("un\n\ndeux").map((x) => x.type)).toEqual(["paragraphe", "paragraphe"]);
    const trois = blocs("un\n\n\ndeux");
    expect(trois.map((x) => x.type)).toEqual(["paragraphe", "espace", "paragraphe"]);
    expect(trois[1].n).toBe(1);
    expect(blocs("un\n\n\n\ndeux")[1].n).toBe(2);
  });

  it("n'ouvre pas sur une respiration", () => {
    // Des lignes vides en tête ne doivent pas décaler tout le bloc.
    expect(blocs("\n\n\nun").map((x) => x.type)).toEqual(["paragraphe"]);
  });

  it("garde le balisage à l'intérieur d'un item", () => {
    const [b] = blocs("- de l'[bleu: eau] :eau:");
    expect(b.items[0][0].some((m) => m.couleur === "bleu")).toBe(true);
    expect(b.items[0][0].some((m) => m.icone === "eau")).toBe(true);
  });

  it("mesure une hauteur qui croît avec le contenu", () => {
    const court = hauteurBlocs(blocs("un"), BASE);
    const long = hauteurBlocs(blocs("un\n\ndeux"), BASE);
    const aere = hauteurBlocs(blocs("un\n\n\ndeux"), BASE);
    expect(long).toBeGreaterThan(court);
    expect(aere).toBeGreaterThan(long);
  });

  it("rend une liste vide sur un texte vide", () => {
    expect(blocs("")).toEqual([]);
    expect(blocs(null)).toEqual([]);
  });
});

describe("espacements réglables, alinéa et retrait", () => {
  const ctx = ctxFactice();
  const blocs = (t, base = BASE, l = 500) => blocsDeTexte(ctx, t, l, base);

  it("respecte l'interligne de la planche, pas celui de la charte", () => {
    const charte = hauteurBlocs(blocs("un\ndeux\ntrois", { ...BASE }), BASE);
    const serre = { ...BASE, interligne: 1 };
    expect(hauteurBlocs(blocs("un\ndeux\ntrois", serre), serre)).toBeLessThan(charte);
  });

  it("respecte la respiration de la planche", () => {
    const aere = { ...BASE, respiration: 3 };
    const t = "un\n\n\ndeux";
    expect(hauteurBlocs(blocs(t, aere), aere)).toBeGreaterThan(hauteurBlocs(blocs(t), BASE));
  });

  it("retombe sur la charte quand la planche ne dit rien", () => {
    // Une valeur absurde (négative, NaN) ne doit pas écraser la charte.
    const cassee = { ...BASE, interligne: -2, respiration: Number.NaN };
    expect(hauteurBlocs(blocs("un\n\n\ndeux", cassee), cassee)).toBe(
      hauteurBlocs(blocs("un\n\n\ndeux"), BASE),
    );
    expect(ESPACEMENT.interligne).toBeGreaterThan(1);
  });

  it("RÉTRÉCIT la première ligne d'un alinéa, pas les suivantes", () => {
    // Sans alinéa « aaa bbb » tient sur une ligne de 70 ; avec, la première
    // ligne n'a plus la place et le mot passe en dessous.
    const sans = lignesRiches(ctx, analyserRiche("aaa bbb"), 70, BASE);
    const avec = lignesRiches(ctx, analyserRiche("aaa bbb"), 70, BASE, { retrait: 40 });
    expect(sans).toHaveLength(1);
    expect(avec).toHaveLength(2);
  });

  it("porte l'alinéa sur le bloc, en pixels", () => {
    const [b] = blocs("un paragraphe", { ...BASE, alinea: 2 });
    expect(b.alinea).toBe(BASE.taille * 2);
    expect(blocs("un paragraphe")[0].alinea).toBe(0);
  });

  it("décale un paragraphe entier avec « > »", () => {
    const [b] = blocs("> une note à part");
    expect(b.type).toBe("paragraphe");
    expect(b.retrait).toBeGreaterThan(0);
    expect(b.lignes[0].map((m) => m.texte).join("")).toBe("une note à part");
  });

  it("sépare un paragraphe décalé de celui qui le précède", () => {
    const b = blocs("du texte\n> une note");
    expect(b).toHaveLength(2);
    expect(b[0].retrait).toBe(0);
    expect(b[1].retrait).toBeGreaterThan(0);
  });

  it("garde le balisage à l'intérieur d'un retrait", () => {
    const [b] = blocs("> une *note* :col:");
    expect(b.lignes[0].some((m) => m.gras)).toBe(true);
    expect(b.lignes[0].some((m) => m.icone === "col")).toBe(true);
  });
});

describe("retours à la ligne durs", () => {
  const ctx = ctxFactice();
  const DUR = { ...BASE, lignesDures: true };

  it("garde chaque ligne tapée quand la planche le demande", () => {
    const [souple] = blocsDeTexte(ctx, "Jour 1\n42 km", 500, BASE);
    const [dur] = blocsDeTexte(ctx, "Jour 1\n42 km", 500, DUR);
    expect(souple.lignes).toHaveLength(1);
    expect(dur.lignes).toHaveLength(2);
    expect(dur.lignes[0].map((m) => m.texte).join("")).toBe("Jour 1");
  });

  it("coupe quand même une ligne trop longue", () => {
    const [dur] = blocsDeTexte(ctx, "aaa bbb ccc", 40, DUR);
    expect(dur.lignes.length).toBeGreaterThan(1);
  });

  it("n'applique l'alinéa qu'à la toute première ligne", () => {
    const large = blocsDeTexte(ctx, "aaa bbb\naaa bbb", 70, DUR);
    const avec = blocsDeTexte(ctx, "aaa bbb\naaa bbb", 70, { ...DUR, alinea: 1.4 });
    // La première ligne perd la place de l'alinéa et se coupe ; la seconde non.
    expect(avec[0].lignes.length).toBeGreaterThan(large[0].lignes.length);
  });
});
