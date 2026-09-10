import { beforeAll, describe, expect, it } from "vitest";

import { definirVocabulaireDIcones, type Ctx2D } from "./canvas.ts";
import {
  ESPACEMENT,
  analyserRiche,
  blocsDeTexte,
  decalageAlignement,
  dessinerCapitales,
  dessinerLigneRiche,
  encreDe,
  fonteDe,
  glypheTrace,
  hauteurBlocs,
  largeurBlocs,
  largeurIcone,
  largeurLigne,
  lignesRiches,
  morceauxCapitales,
  poserBlocs,
  texteNu,
  type Bloc,
  type StyleTexte,
} from "./texte.ts";

/** Le vocabulaire de la carte, réduit à ce dont les tests ont besoin. */
const CONNUES = ["col", "bivouac", "eau", "neige", "sac", "repas"];

beforeAll(() => {
  definirVocabulaireDIcones({
    connue: (cle) => CONNUES.includes(cle),
    dessiner: () => true,
  });
});

type Op = { op: string; args: unknown[] };

/**
 * Un contexte 2D de comptoir : une lettre = 10 px, quelle que soit la fonte, et
 * chaque opération de dessin est notée. Mesurer sans canvas rend la mise en page
 * testable ; noter les tracés rend la POSE testable, ce qui manquait.
 */
function ctxFactice(): Ctx2D & { ops: Op[] } {
  const ops: Op[] = [];
  const note =
    (op: string) =>
    (...args: unknown[]) => {
      ops.push({ op, args });
    };
  return {
    ops,
    font: "",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    shadowColor: "rgba(0,0,0,0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText: note("fillText"),
    fillRect: note("fillRect"),
    strokeRect: note("strokeRect"),
    clearRect: note("clearRect"),
    beginPath: note("beginPath"),
    closePath: note("closePath"),
    moveTo: note("moveTo"),
    lineTo: note("lineTo"),
    quadraticCurveTo: note("quadraticCurveTo"),
    arc: note("arc"),
    ellipse: note("ellipse"),
    rect: note("rect"),
    fill: note("fill"),
    stroke: note("stroke"),
    clip: note("clip"),
    setLineDash: note("setLineDash"),
    save: note("save"),
    restore: note("restore"),
    translate: note("translate"),
    rotate: note("rotate"),
    scale: note("scale"),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  } as Ctx2D & { ops: Op[] };
}

const BASE: StyleTexte = {
  police: "Ubuntu",
  taille: 30,
  graisse: 400,
  couleur: "#fff",
  accent: "#EFB159",
};

const nu = (morceaux: { texte: string }[]) => morceaux.map((m) => m.texte).join("");

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
    expect(fonteDe({ texte: "", gras: true }, BASE)).toBe("700 30px Ubuntu");
    expect(fonteDe({ texte: "", italique: true }, BASE)).toBe("italic 400 30px Ubuntu");
    expect(fonteDe({ texte: "", gras: true, italique: true }, BASE)).toBe("italic 700 30px Ubuntu");
  });

  it("ne DESCEND jamais la graisse d'un titre déjà gras", () => {
    // Un titre est en 700 : `*mot*` ne doit pas l'alléger.
    expect(fonteDe({ texte: "", gras: true }, { ...BASE, graisse: 700 })).toBe("700 30px Ubuntu");
  });

  it("UNE SEULE FAMILLE : nommer une police ne change plus la fonte", () => {
    // La charte n'a qu'Ubuntu Sans ; `[mono: …]` reste lu pour que les planches
    // déjà écrites s'ouvrent, mais la hiérarchie sort de la graisse, de la casse
    // et de l'interlettrage.
    const [mo] = analyserRiche("[mono: 57,5 km]");
    expect(mo!.famille).toBe("mono");
    expect(fonteDe(mo!, BASE)).toBe("400 30px Ubuntu");
  });

  it("…mais nommer une police NE TEINTE PAS le mot", () => {
    // Le piège que la garde évite : `[…]` porte l'ambre, et demander une police
    // ne doit pas colorer le mot au passage.
    const [mo] = analyserRiche("[serif: mot]");
    expect(mo!.accent).toBeUndefined();
    expect(encreDe(mo!, BASE)).toBe(BASE.couleur);
  });

  it("laisse un préfixe inconnu tranquille — c'est du texte", () => {
    expect(texteNu("[note: à faire]")).toBe("note: à faire");
  });
});

describe("lignesRiches", () => {
  const ctx = ctxFactice();

  it("coupe à la largeur demandée", () => {
    const lignes = lignesRiches(ctx, analyserRiche("aaa bbb ccc ddd"), 70, BASE);
    expect(lignes).toHaveLength(2);
    expect(nu(lignes[0]!)).toBe("aaa bbb");
  });

  it("ne commence jamais une ligne par un blanc", () => {
    const lignes = lignesRiches(ctx, analyserRiche("aaa bbb ccc"), 40, BASE);
    for (const l of lignes) expect(l[0]!.texte.trim()).not.toBe("");
  });

  it("ne laisse pas de blanc en fin de ligne", () => {
    // Sinon un texte centré se décale, et un soulignement court dans le vide.
    const lignes = lignesRiches(ctx, analyserRiche("aaa bbb ccc"), 40, BASE);
    for (const l of lignes) expect(l[l.length - 1]!.texte.trim()).not.toBe("");
  });

  it("garde le style à travers la coupure", () => {
    const lignes = lignesRiches(ctx, analyserRiche("*aaa bbb*"), 40, BASE);
    expect(lignes).toHaveLength(2);
    expect(lignes.every((l) => l.every((m) => m.gras))).toBe(true);
  });

  it("mesure la ligne à partir de ses morceaux", () => {
    const [ligne] = lignesRiches(ctx, analyserRiche("abcd"), 500, BASE);
    expect(largeurLigne(ligne!)).toBe(40);
  });
});

describe("couleurs nommées", () => {
  it("reconnaît un préfixe de couleur connu", () => {
    expect(analyserRiche("[bleu: froid]")).toEqual([
      { texte: "froid", accent: true, couleur: "bleu" },
    ]);
  });

  it("accepte les accents et les majuscules du nom", () => {
    expect(analyserRiche("[Fuchsia: x]")[0]!.couleur).toBe("fuchsia");
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
    expect(encreDe({ texte: "", accent: true }, base)).toBe("#C08327");
    expect(encreDe({ texte: "", accent: true, couleur: "ambre" }, base)).toBe("#C08327");
    expect(encreDe({ texte: "", accent: true, couleur: "bleu" }, base)).toBe("#8CB9BD");
    expect(encreDe({ texte: "" }, base)).toBe("#222");
  });

  it("`gris` prend l'encre atténuée, et retombe sur l'encre s'il n'y en a pas", () => {
    const base = { accent: "#C08327", couleur: "#222", douce: "#888" };
    expect(encreDe({ texte: "", accent: true, couleur: "gris" }, base)).toBe("#888");
    expect(encreDe({ texte: "", accent: true, couleur: "gris" }, { ...base, douce: undefined })).toBe(
      "#222",
    );
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
    expect(ligne![0]!.largeur).toBe(largeurIcone(BASE));
  });

  it("n'est pas confondue avec un blanc de fin de ligne", () => {
    const ctx = ctxFactice();
    const lignes = lignesRiches(ctx, analyserRiche("aaaa :col:"), 60, BASE);
    expect(lignes[lignes.length - 1]!.some((m) => m.icone === "col")).toBe(true);
  });
});

describe("blocs : listes, paragraphes, respirations", () => {
  const ctx = ctxFactice();
  const blocs = (t: unknown, l = 500) => blocsDeTexte(ctx, t, l, BASE);
  const para = (b: Bloc) => (b.type === "paragraphe" ? b : null);

  it("fait un paragraphe des lignes consécutives", () => {
    const b = blocs("un\ndeux");
    expect(b).toHaveLength(1);
    expect(b[0]!.type).toBe("paragraphe");
    expect(nu(para(b[0]!)!.lignes[0]!)).toBe("un deux");
  });

  it("reconnaît une liste sur les lignes qui commencent par un tiret", () => {
    const b = blocs("- eau\n- bois\n- feu");
    expect(b).toHaveLength(1);
    expect(b[0]!.type).toBe("liste");
    expect(b[0]!.type === "liste" && b[0]!.items).toHaveLength(3);
  });

  it("sépare une liste du paragraphe qui la précède", () => {
    expect(blocs("Dans le sac :\n- eau\n- bois").map((x) => x.type)).toEqual([
      "paragraphe",
      "liste",
    ]);
  });

  it("UNE ligne vide sépare, CHAQUE ligne vide en plus aère", () => {
    // Le geste naturel : appuyer plusieurs fois sur Entrée donne plus d'air.
    expect(blocs("un\n\ndeux").map((x) => x.type)).toEqual(["paragraphe", "paragraphe"]);
    const trois = blocs("un\n\n\ndeux");
    expect(trois.map((x) => x.type)).toEqual(["paragraphe", "espace", "paragraphe"]);
    expect(trois[1]!.type === "espace" && trois[1]!.n).toBe(1);
    const quatre = blocs("un\n\n\n\ndeux")[1]!;
    expect(quatre.type === "espace" && quatre.n).toBe(2);
  });

  it("n'ouvre pas sur une respiration", () => {
    // Des lignes vides en tête ne doivent pas décaler tout le bloc.
    expect(blocs("\n\n\nun").map((x) => x.type)).toEqual(["paragraphe"]);
  });

  it("garde le balisage à l'intérieur d'un item", () => {
    const b = blocs("- de l'[bleu: eau] :eau:")[0]!;
    const ligne = b.type === "liste" ? b.items[0]!.lignes[0]! : [];
    expect(ligne.some((m) => m.couleur === "bleu")).toBe(true);
    expect(ligne.some((m) => m.icone === "eau")).toBe(true);
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
  const blocs = (t: unknown, base: StyleTexte = BASE, l = 500) => blocsDeTexte(ctx, t, l, base);

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
    const b = blocs("un paragraphe", { ...BASE, alinea: 2 })[0]!;
    expect(b.type === "paragraphe" && b.alinea).toBe(BASE.taille * 2);
    const sans = blocs("un paragraphe")[0]!;
    expect(sans.type === "paragraphe" && sans.alinea).toBe(0);
  });

  it("décale un paragraphe entier avec « > »", () => {
    const b = blocs("> une note à part")[0]!;
    expect(b.type).toBe("paragraphe");
    if (b.type !== "paragraphe") return;
    expect(b.retrait).toBeGreaterThan(0);
    expect(nu(b.lignes[0]!)).toBe("une note à part");
  });

  it("sépare un paragraphe décalé de celui qui le précède", () => {
    const b = blocs("du texte\n> une note");
    expect(b).toHaveLength(2);
    expect(b[0]!.type === "paragraphe" && b[0]!.retrait).toBe(0);
    expect(b[1]!.type === "paragraphe" && b[1]!.retrait).toBeGreaterThan(0);
  });

  it("garde le balisage à l'intérieur d'un retrait", () => {
    const b = blocs("> une *note* :col:")[0]!;
    const ligne = b.type === "paragraphe" ? b.lignes[0]! : [];
    expect(ligne.some((m) => m.gras)).toBe(true);
    expect(ligne.some((m) => m.icone === "col")).toBe(true);
  });
});

describe("retours à la ligne durs", () => {
  const ctx = ctxFactice();
  const DUR: StyleTexte = { ...BASE, lignesDures: true };
  const lignesDe = (b: Bloc) => (b.type === "paragraphe" ? b.lignes : []);

  it("garde chaque ligne tapée quand la planche le demande", () => {
    const souple = blocsDeTexte(ctx, "Jour 1\n42 km", 500, BASE)[0]!;
    const dur = blocsDeTexte(ctx, "Jour 1\n42 km", 500, DUR)[0]!;
    expect(lignesDe(souple)).toHaveLength(1);
    expect(lignesDe(dur)).toHaveLength(2);
    expect(nu(lignesDe(dur)[0]!)).toBe("Jour 1");
  });

  it("coupe quand même une ligne trop longue", () => {
    expect(lignesDe(blocsDeTexte(ctx, "aaa bbb ccc", 40, DUR)[0]!).length).toBeGreaterThan(1);
  });

  it("n'applique l'alinéa qu'à la toute première ligne", () => {
    const large = blocsDeTexte(ctx, "aaa bbb\naaa bbb", 70, DUR);
    const avec = blocsDeTexte(ctx, "aaa bbb\naaa bbb", 70, { ...DUR, alinea: 1.4 });
    expect(lignesDe(avec[0]!).length).toBeGreaterThan(lignesDe(large[0]!).length);
  });
});

describe("alignement et corps, ligne par ligne", () => {
  const ctx = ctxFactice();
  const blocs = (t: unknown, base: StyleTexte = BASE, l = 500) => blocsDeTexte(ctx, t, l, base);
  const lignesDe = (b: Bloc) => (b.type === "paragraphe" ? b.lignes : []);

  it("centre une ligne sans toucher aux autres", () => {
    const b = blocs("À gauche.\n| Au milieu.\nÀ gauche encore.");
    expect(b).toHaveLength(3);
    expect(b.map((x) => x.align)).toEqual([null, "centre", null]);
    // Le préfixe ne doit PAS rester écrit.
    expect(nu(lignesDe(b[1]!)[0]!)).toBe("Au milieu.");
  });

  it("connaît les trois directions", () => {
    expect(blocs("| a")[0]!.align).toBe("centre");
    expect(blocs("|> a")[0]!.align).toBe("droite");
    expect(blocs("|< a")[0]!.align).toBe("gauche");
  });

  it("réduit et agrandit le corps, par pas", () => {
    const petit = blocs("-- a")[0]!.base!.taille;
    const tresPetit = blocs("---- a")[0]!.base!.taille;
    const grand = blocs("++ a")[0]!.base!.taille;
    expect(petit).toBeLessThan(BASE.taille);
    expect(tresPetit).toBeLessThan(petit);
    expect(grand).toBeGreaterThan(BASE.taille);
    expect(blocs("a")[0]!.base).toBeNull();
  });

  it("cumule alignement et corps, collés ou séparés", () => {
    for (const prefixe of ["|--", "-- |", "|  --"]) {
      const b = blocs(`${prefixe} une note`)[0]!;
      expect(b.align, prefixe).toBe("centre");
      expect(b.base!.taille, prefixe).toBeLessThan(BASE.taille);
      expect(nu(lignesDe(b)[0]!), prefixe).toBe("une note");
    }
  });

  it("mesure le bloc réduit à SON corps, pas à celui de la planche", () => {
    expect(hauteurBlocs(blocs("-- une ligne"), BASE)).toBeLessThan(
      hauteurBlocs(blocs("une ligne"), BASE),
    );
  });

  it("s'applique aussi à une liste, et n'en mélange pas deux", () => {
    const b = blocs("- eau\n| - bois");
    expect(b).toHaveLength(2);
    expect(b[0]!.align).toBeNull();
    expect(b[1]!.align).toBe("centre");
    expect(b[1]!.type === "liste" && nu(b[1]!.items[0]!.lignes[0]!)).toBe("bois");
  });

  it("se combine avec le retrait « > »", () => {
    const b = blocs("> |> une note à droite")[0]!;
    expect(b.type === "paragraphe" && b.retrait).toBeGreaterThan(0);
    expect(b.align).toBe("droite");
  });

  it("laisse tranquille ce qui n'est pas un préfixe", () => {
    // Rien derrière le préfixe : c'est du texte. Une rangée de tirets reste une
    // rangée de tirets, un point de liste reste un point de liste, et une
    // soustraction s'écrit encore.
    const mots = (t: string) => nu(lignesDe(blocs(t)[0]!)[0]!);
    expect(mots("---- ")).toBe("----");
    expect(mots("----x")).toBe("----x");
    expect(blocs("----")[0]!.base).toBeNull();
    expect(blocs("- eau")[0]!.type).toBe("liste");
    expect(mots("12 - 4 = 8")).toBe("12 - 4 = 8");
  });

  it("décale une ligne selon l'alignement demandé", () => {
    expect(decalageAlignement("gauche", 100, 40)).toBe(0);
    expect(decalageAlignement("centre", 100, 40)).toBe(30);
    expect(decalageAlignement("droite", 100, 40)).toBe(60);
    // Une ligne plus large que sa boîte ne se décale pas dans le négatif.
    expect(decalageAlignement("centre", 40, 100)).toBe(0);
  });
});

describe("une puce par point de liste", () => {
  const ctx = ctxFactice();
  const blocs = (t: string) => blocsDeTexte(ctx, t, 500, BASE);
  const liste = (t: string) => {
    const b = blocs(t)[0]!;
    return b.type === "liste" ? b : null;
  };

  it("prend le PREMIER :clé: du point comme puce, et l'ôte du texte", () => {
    const b = liste("- :sac: sac 30 L")!;
    expect(b.items[0]!.puce).toBe("sac");
    expect(nu(b.items[0]!.lignes[0]!)).toBe("sac 30 L");
  });

  it("marche avec ou sans espace après le tiret", () => {
    expect(liste("-:repas: vivres")!.items[0]!.puce).toBe("repas");
    expect(liste("- :repas: vivres")!.items[0]!.puce).toBe("repas");
  });

  it("accepte aussi les formes tracées", () => {
    const b = liste("- :losange: un point\n- :aucune: un autre")!;
    expect(b.items.map((i) => i.puce)).toEqual(["losange", "aucune"]);
  });

  it("laisse les points SANS clé suivre la puce de la planche", () => {
    expect(liste("- :sac: avec\n- sans")!.items.map((i) => i.puce)).toEqual(["sac", null]);
  });

  it("ne mange pas une clé INCONNUE : elle reste écrite", () => {
    const b = liste("- :licorne: un point")!;
    expect(b.items[0]!.puce).toBeNull();
    expect(nu(b.items[0]!.lignes[0]!)).toBe(":licorne: un point");
  });

  it("garde la puce de la planche quand on la nomme d'abord", () => {
    // `- :point: :sac: …` : la puce reste le point, l'icône entre dans le texte.
    const b = liste("- :point: :sac: sac 30 L")!;
    expect(b.items[0]!.puce).toBe("point");
    expect(b.items[0]!.lignes[0]!.some((m) => m.icone === "sac")).toBe(true);
  });
});

describe("les données « libellé = valeur »", () => {
  const ctx = ctxFactice();
  const base: StyleTexte = { police: "Ubuntu", taille: 30, couleur: "#111", accent: "#EFB159" };
  const blocs = (t: string, b: StyleTexte = base) => blocsDeTexte(ctx, t, 500, b);
  const donnee = (t: string, b: StyleTexte = base) => {
    const x = blocs(t, b)[0]!;
    return x.type === "donnee" ? x : null;
  };

  it("met le libellé en capitales et garde la valeur telle quelle", () => {
    const d = donnee("Distance = 57,5 km")!;
    expect(nu(d.label)).toBe("DISTANCE");
    expect(nu(d.valeur[0]!)).toBe("57,5 km");
  });

  it("laisse le balisage entrer des DEUX côtés", () => {
    const d = donnee("[bleu: Masse] portée = *8,4 kg*")!;
    expect(d.label.some((m) => m.couleur === "bleu")).toBe(true);
    expect(d.valeur[0]!.some((m) => m.gras)).toBe(true);
  });

  it("n'attrape pas ce qui n'est pas une donnée", () => {
    // Une soustraction, une chaîne d'égalités, un point de liste : trois façons
    // d'écrire un « = » sans demander une fiche.
    expect(blocs("12 - 4 = 8")[0]!.type).toBe("paragraphe");
    expect(blocs("a = b = c")[0]!.type).toBe("paragraphe");
    expect(blocs("x=y")[0]!.type).toBe("paragraphe");
    expect(blocs("- Distance = 57,5 km")[0]!.type).toBe("liste");
  });

  it("serre deux données qui se suivent, pas une donnée après un texte", () => {
    // Une suite de données se lit comme UN tableau ; après un paragraphe, elle
    // reprend l'écart normal entre blocs.
    const suite = hauteurBlocs(blocs("A = 1\nB = 2"), base);
    const apres = hauteurBlocs(blocs("un mot\nA = 1"), base);
    const une = hauteurBlocs(blocs("A = 1"), base);
    const mot = hauteurBlocs(blocs("un mot"), base);
    expect(suite - 2 * une).toBeLessThan(apres - une - mot);
  });

  it("suit les corps que la planche impose", () => {
    const petit = hauteurBlocs(blocs("A = 1", { ...base, tailleLabel: 10, tailleValeur: 20 }), base);
    const grand = hauteurBlocs(blocs("A = 1", { ...base, tailleLabel: 20, tailleValeur: 60 }), base);
    expect(grand).toBeGreaterThan(petit);
  });
});

describe("la flèche du swipe, posable dans une phrase", () => {
  it("entre dans le vocabulaire de `:clé:` comme une icône", () => {
    expect(analyserRiche("Vénosc :fleche: Valgaudémar")).toEqual([
      { texte: "Vénosc " },
      { texte: "", icone: "fleche" },
      { texte: " Valgaudémar" },
    ]);
  });

  it("hérite du style et de la couleur qui l'entourent", () => {
    const [mo] = analyserRiche("[bleu: :fleche:]");
    expect(mo!.icone).toBe("fleche");
    expect(mo!.couleur).toBe("bleu");
  });

  it("prend sa VRAIE largeur, pas celle d'un carré", () => {
    // Une flèche est longue et plate : lui réserver un carré ouvrirait un trou
    // avant le mot suivant.
    expect(largeurIcone(BASE, "fleche")).toBeGreaterThan(largeurIcone(BASE, "col"));
    expect(largeurIcone(BASE, "col")).toBe(largeurIcone(BASE));
  });

  it("est un glyphe TRACÉ, pas un dessin du vocabulaire des repères", () => {
    expect(glypheTrace("fleche")).not.toBeNull();
    expect(glypheTrace("col")).toBeNull();
  });
});

describe("la pose sur le canvas", () => {
  it("pose chaque morceau à la suite et rend la largeur parcourue", () => {
    const ctx = ctxFactice();
    const [ligne] = lignesRiches(ctx, analyserRiche("ab *cd*"), 500, BASE);
    ctx.ops.length = 0;
    const large = dessinerLigneRiche(ctx, ligne!, 100, 200, BASE);
    const poses = ctx.ops.filter((o) => o.op === "fillText");
    expect(poses.map((o) => o.args[0])).toEqual(["ab", " ", "cd"]);
    expect(poses[0]!.args[1]).toBe(100);
    expect(large).toBe(largeurLigne(ligne!));
  });

  it("souligne sous la ligne de base, et jamais un blanc", () => {
    const ctx = ctxFactice();
    const [ligne] = lignesRiches(ctx, analyserRiche("~ab cd~"), 500, BASE);
    ctx.ops.length = 0;
    dessinerLigneRiche(ctx, ligne!, 0, 100, BASE);
    const traits = ctx.ops.filter((o) => o.op === "fillRect");
    // Deux mots soulignés, pas l'espace entre les deux.
    expect(traits).toHaveLength(2);
    expect(traits.every((t) => (t.args[1] as number) > 100)).toBe(true);
  });

  it("LA PLAQUE SE POSE AVANT LE TEXTE — sinon elle le recouvre", () => {
    const ctx = ctxFactice();
    const avecPlaque: StyleTexte = { ...BASE, plaque: { rgb: "0, 0, 0", alpha: 0.9 } };
    const [ligne] = lignesRiches(ctx, analyserRiche("abc"), 500, avecPlaque);
    ctx.ops.length = 0;
    dessinerLigneRiche(ctx, ligne!, 0, 100, avecPlaque);
    const fond = ctx.ops.findIndex((o) => o.op === "fill");
    const texte = ctx.ops.findIndex((o) => o.op === "fillText");
    expect(fond).toBeGreaterThanOrEqual(0);
    expect(fond).toBeLessThan(texte);
  });

  it("écarte les capitales lettre à lettre", () => {
    const ctx = ctxFactice();
    ctx.ops.length = 0;
    const large = dessinerCapitales(ctx, morceauxCapitales("ab"), 0, 100, 20, 0.16, "#EFB159");
    const poses = ctx.ops.filter((o) => o.op === "fillText");
    expect(poses.map((o) => o.args[0])).toEqual(["A", "B"]);
    // Une lettre fait 10 px, l'écart 0,16 × 20 = 3,2.
    expect(poses[1]!.args[1]).toBeCloseTo(13.2, 6);
    expect(large).toBeCloseTo(23.2, 6);
  });

  it("poserBlocs descend, et rend le bas mesuré par hauteurBlocs", () => {
    const ctx = ctxFactice();
    const blocs = blocsDeTexte(ctx, "un paragraphe\n\n- eau\n- bois", 500, BASE);
    const bas = poserBlocs(ctx, blocs, 0, 40, BASE, { align: "gauche", largeur: 500 });
    expect(bas).toBeCloseTo(40 + hauteurBlocs(blocs, BASE), 6);
  });

  it("largeurBlocs rend la plus longue ligne, retrait de liste compris", () => {
    const ctx = ctxFactice();
    const large = largeurBlocs(ctx, blocsDeTexte(ctx, "abcd", 500, BASE), BASE);
    const enListe = largeurBlocs(ctx, blocsDeTexte(ctx, "- abcd", 500, BASE), BASE);
    expect(large).toBe(40);
    expect(enListe).toBeGreaterThan(large);
  });
});
