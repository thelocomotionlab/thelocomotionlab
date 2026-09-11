import { beforeAll, describe, expect, it } from "vitest";

import { definirVocabulaireDIcones } from "./canvas.ts";
import { FORMATS, MARGE } from "./charte.ts";
import { migrerProjet, trancheV1, type ProjetV1 } from "./migration.ts";
import {
  CONTEXTE_PAR_DEFAUT,
  MODELES,
  changerModele,
  instancier,
  instancierSurvol,
  modeleDe,
  modelesPour,
  remettreLeModele,
} from "./modeles.ts";
import type { ContexteModele } from "./modeles.ts";
import { enPixels } from "./geometrie.ts";
import { formatDe } from "./charte.ts";
import { resoudre } from "./variables.ts";
import type { CleModele, Element, ElementTexte, PlancheImage } from "./types.ts";

beforeAll(() => {
  definirVocabulaireDIcones({ connue: () => false, dessiner: () => true });
});

const CTX: ContexteModele = {
  ...CONTEXTE_PAR_DEFAUT,
  nomTrace: "Tour des Écrins",
  vecue: true,
};

const textes = (p: PlancheImage) =>
  p.elements.filter((e): e is ElementTexte => e.type === "texte");
const roles = (p: PlancheImage) => textes(p).map((e) => e.role);
const types = (p: PlancheImage) => [...new Set(p.elements.map((e) => e.type))];

describe("les modèles", () => {
  it("en compte dix pour l'image, plus Survol", () => {
    expect(MODELES).toHaveLength(10);
    expect(MODELES.map((m) => m.cle)).toEqual([
      "carte",
      "bandeau",
      "photo",
      "texte",
      "fiche",
      "etape",
      "journees",
      "cloture",
      "silhouette",
      "chiffres",
    ]);
    expect(instancierSurvol(CTX).type).toBe("survol");
  });

  it("les deux stories ne se proposent qu'en story", () => {
    // Une silhouette 9:16 n'a rien à faire dans un carrousel 4:5.
    expect(modelesPour("carrousel").map((m) => m.cle)).not.toContain("silhouette");
    expect(modelesPour("story").map((m) => m.cle)).toContain("chiffres");
  });

  it("chacun pose des éléments, et le titre vient de la trace", () => {
    for (const m of MODELES) {
      const p = instancier(m.cle, { ...CTX, format: m.formats?.[0] ?? "carrousel" });
      expect(p.elements.length, m.cle).toBeGreaterThan(0);
      expect(p.modele, m.cle).toBe(m.cle);
    }
    // Le titre porte la VARIABLE, qui se résout sur la trace au rendu.
    const titre = textes(instancier("carte", CTX)).find((e) => e.role === "titre")!;
    expect(titre.contenu).toBe("{nom}");
    expect(
      resoudre(titre.contenu, {
        trace: { nom: "Tour des Écrins" } as never,
        seance: null,
        segments: [],
        tranche: { mode: "toutes", jour: 0 },
        bilan: "apres",
        nomProjet: "Écrins 2026",
      }),
    ).toBe("Tour des Écrins");
  });

  it("dit « la sortie » d'une trace vécue, « l'itinéraire » d'un projet", () => {
    const vecue = textes(instancier("carte", CTX)).find((e) => e.role === "surtitre")!;
    const prevue = textes(instancier("carte", { ...CTX, vecue: false })).find(
      (e) => e.role === "surtitre",
    )!;
    expect(vecue.contenu).toBe("la sortie");
    expect(prevue.contenu).toBe("l'itinéraire");
  });

  it("TOUT TIENT DANS LA PLANCHE, et respecte les marges", () => {
    for (const m of MODELES) {
      const format = m.formats?.[0] ?? "carrousel";
      const f = FORMATS[format];
      for (const e of instancier(m.cle, { ...CTX, format }).elements) {
        const b = enPixels(e, format);
        expect(b.x, `${m.cle}/${e.nom}`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${m.cle}/${e.nom}`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.l, `${m.cle}/${e.nom}`).toBeLessThanOrEqual(f.width + 0.5);
        expect(b.y + b.h, `${m.cle}/${e.nom}`).toBeLessThanOrEqual(f.height + 0.5);
      }
    }
  });

  it("LA STORY RESPECTE LA ZONE SÛRE d'Instagram", () => {
    // C'est la contrainte qui se découvre autrement sur une vraie publication.
    const f = FORMATS.story;
    for (const cle of ["silhouette", "chiffres"] as CleModele[]) {
      for (const e of instancier(cle, { ...CTX, format: "story" }).elements) {
        const b = enPixels(e, "story");
        // Le fond de planche est plein cadre par nature ; le reste se range.
        if (e.type === "photo" && e.fondDePlanche) continue;
        expect(b.y, `${cle}/${e.nom}`).toBeGreaterThanOrEqual(f.zoneSure!.top - 0.5);
        expect(b.y + b.h, `${cle}/${e.nom}`).toBeLessThanOrEqual(f.zoneSure!.bottom + 0.5);
      }
    }
  });

  it("pose le mobilier de la charte, sauf là où il n'a pas lieu d'être", () => {
    // Une clôture ne se numérote pas et n'invite pas à glisser.
    const noms = (cle: CleModele) => instancier(cle, CTX).elements.map((e) => e.nom);
    expect(noms("texte")).toContain("Pagination");
    expect(noms("cloture")).not.toContain("Pagination");
    expect(noms("cloture")).not.toContain("Glisse");
  });

  it("chaque modèle amène les éléments que son nom promet", () => {
    expect(types(instancier("carte", CTX))).toContain("carte");
    expect(types(instancier("carte", CTX))).toContain("profil");
    expect(types(instancier("fiche", CTX))).toContain("fiche");
    expect(types(instancier("journees", CTX))).toContain("cases");
    expect(types(instancier("photo", CTX))).toContain("photo");
    expect(types(instancier("chiffres", { ...CTX, format: "story" }))).toContain("stat");
  });

  it("deux instanciations ne partagent aucun identifiant", () => {
    const a = instancier("carte", CTX);
    const b = instancier("carte", CTX);
    const ids = new Set([...a.elements, ...b.elements].map((e) => e.id));
    expect(ids.size).toBe(a.elements.length + b.elements.length);
    expect(a.id).not.toBe(b.id);
  });

  it("un modèle inconnu ne casse rien : la planche garde son mobilier", () => {
    expect(modeleDe("survol" as CleModele)).toBeNull();
    expect(instancier("survol" as CleModele, CTX).elements.length).toBeGreaterThan(0);
  });
});

describe("changer de modèle", () => {
  function ecrite(): PlancheImage {
    const p = instancier("carte", CTX);
    return {
      ...p,
      elements: p.elements.map((e) =>
        e.type === "texte" && e.role === "corps"
          ? ({ ...e, contenu: "Un récit écrit à la main." } as Element)
          : e.type === "texte" && e.role === "titre"
            ? ({ ...e, contenu: "Croix de Belledonne" } as Element)
            : e,
      ),
    };
  }

  it("REPREND LES CONTENUS PAR RÔLE, pas par position", () => {
    // Un titre reste un titre quand il passe de « Carte » à « Étape », même si
    // sa place change du tout au tout.
    const apres = changerModele(ecrite(), "etape", CTX);
    expect(apres.modele).toBe("etape");
    expect(textes(apres).find((e) => e.role === "titre")!.contenu).toBe("Croix de Belledonne");
    expect(textes(apres).find((e) => e.role === "corps")!.contenu).toBe(
      "Un récit écrit à la main.",
    );
  });

  it("NE JETTE PAS ce qui n'a pas de place dans le nouveau modèle", () => {
    // Perdre un texte parce qu'on a changé d'avis sur la mise en page serait le
    // pire des échanges.
    const avec = changerModele(ecrite(), "cloture", CTX);
    const dits = textes(avec).map((e) => e.contenu);
    expect(dits).toContain("Un récit écrit à la main.");
  });

  it("laisse le mobilier au modèle : une story n'hérite pas du « glisse → »", () => {
    // La pagination et le pied portent du texte, mais c'est le MODÈLE qui l'a
    // écrit. Un modèle sans pied n'en veut pas.
    const story: ContexteModele = { ...CTX, format: "story" };
    const apres = changerModele(ecrite(), "chiffres", story);
    const dits = textes(apres).map((e) => e.contenu);
    expect(dits.some((t) => t.includes("glisse"))).toBe(false);
    expect(dits.some((t) => t.includes("{planche}"))).toBe(false);
    // …et le texte de l'auteur, lui, survit.
    expect(dits).toContain("Un récit écrit à la main.");
  });

  it("garde la tranche de journées de la planche", () => {
    const p = { ...ecrite(), tranche: { mode: "seule", jour: 2 } as const };
    expect(changerModele(p, "etape", CTX).tranche).toEqual({ mode: "seule", jour: 2 });
  });

  it("« Remettre le modèle » réaligne sans perdre le texte", () => {
    const bouge: PlancheImage = {
      ...ecrite(),
      elements: ecrite().elements.map((e) => ({ ...e, x: 0.7, y: 0.9 })),
    };
    const remis = remettreLeModele(bouge, CTX);
    expect(textes(remis).find((e) => e.role === "titre")!.contenu).toBe("Croix de Belledonne");
    expect(remis.elements.every((e) => e.x !== 0.7 || e.y !== 0.9)).toBe(true);
    expect(enPixels(remis.elements.find((e) => e.type === "marque")!, "carrousel").x).toBe(MARGE);
  });
});

describe("migration d'un projet v1", () => {
  const V1: ProjetV1 = {
    schema: 1,
    format: "carrousel",
    theme: "sombre",
    bilan: true,
    coupures: [42, 84],
    trace: { nom: "Tour des Écrins", vecue: true, totalKm: 190 },
    traceCadre: null,
    cartes: [
      {
        gabarit: "carte",
        surtitre: "la sortie",
        titre: "Tour des Écrins",
        texte: "Un *récit* et [bleu: une couleur].",
        alignement: "centre",
        tailleTitre: 72,
        ombre: true,
        ombreFlou: 24,
        surtitreFilet: false,
        etiquettes: [{ segment: 0, texte: "J1" }],
      },
      {
        gabarit: "etape",
        titre: "Vénosc",
        texte: "",
        photo: { faux: "blob" },
        nomImage: "bivouac.jpg",
        ancrage: 0.2,
        depuis: 1,
        jusquA: 1,
      },
      { gabarit: "inconnu", titre: "Perdu ?" },
    ],
  };

  it("ouvre le projet et convertit chaque carte en planche", () => {
    const r = migrerProjet(V1)!;
    expect(r.projet.schema).toBe(2);
    expect(r.projet.planches).toHaveLength(3);
    expect(r.projet.planches.map((p) => p.modele)).toEqual(["carte", "etape", "texte"]);
  });

  it("NE PERD AUCUN TEXTE, et le balisage n'est pas réinterprété", () => {
    const r = migrerProjet(V1)!;
    const carte = r.projet.planches[0] as PlancheImage;
    expect(textes(carte).find((e) => e.role === "titre")!.contenu).toBe("Tour des Écrins");
    expect(textes(carte).find((e) => e.role === "corps")!.contenu).toBe(
      "Un *récit* et [bleu: une couleur].",
    );
  });

  it("reporte les réglages qui ont un correspondant", () => {
    const carte = migrerProjet(V1)!.projet.planches[0] as PlancheImage;
    const titre = textes(carte).find((e) => e.role === "titre")!;
    expect(titre.corps).toBe(72);
    expect(titre.alignement).toBe("centre");
    expect(titre.ombre).toMatchObject({ flou: 24 });
    expect(textes(carte).find((e) => e.role === "surtitre")!.filetOuvrant).toBeNull();
  });

  it("SORT LES PHOTOS dans le magasin des médias", () => {
    // Un même cliché posé sur trois planches n'y est stocké qu'une fois.
    const r = migrerProjet(V1)!;
    expect(r.photos).toHaveLength(1);
    expect(r.projet.medias[0]!.nom).toBe("bivouac.jpg");
    const etape = r.projet.planches[1] as PlancheImage;
    const photo = etape.elements.find((e) => e.type === "photo")!;
    expect(photo.type === "photo" && photo.mediaId).toBe(r.photos[0]!.id);
    expect(photo.type === "photo" && photo.cadrage.y).toBe(0.2);
  });

  it("garde la trace, les coupures et le bilan", () => {
    const r = migrerProjet(V1)!;
    expect(r.projet.donnees.coupures).toEqual([42, 84]);
    expect(r.projet.donnees.trace!.nom).toBe("Tour des Écrins");
    expect(r.projet.bilan).toBe("apres");
  });

  it("NOMME les trois tranches au lieu de les déduire de deux nombres", () => {
    expect(trancheV1({ depuis: 1, jusquA: 1 })).toEqual({ mode: "seule", jour: 1 });
    expect(trancheV1({ jusquA: 2 })).toEqual({ mode: "jusqua", jour: 2 });
    expect(trancheV1({})).toEqual({ mode: "toutes", jour: 0 });
    expect((migrerProjet(V1)!.projet.planches[1] as PlancheImage).tranche).toEqual({
      mode: "seule",
      jour: 1,
    });
  });

  it("DIT ce qu'il n'a pas su reprendre plutôt que de le taire", () => {
    const r = migrerProjet(V1)!;
    expect(r.avertissements).toHaveLength(1);
    expect(r.avertissements[0]).toContain("inconnu");
    // …et la planche existe quand même, avec son texte.
    const perdue = r.projet.planches[2] as PlancheImage;
    expect(textes(perdue).find((e) => e.role === "titre")!.contenu).toBe("Perdu ?");
  });

  it("refuse poliment ce qui n'est pas un projet v1", () => {
    expect(migrerProjet(null)).toBeNull();
    expect(migrerProjet({ schema: 2 })).toBeNull();
    expect(migrerProjet({} as ProjetV1)).toBeNull();
  });

  it("un projet v1 vide donne une planche, pas un document sans rien", () => {
    const r = migrerProjet({ schema: 1, cartes: [] })!;
    expect(r.projet.planches).toHaveLength(1);
  });
});

describe("les données font le travail", () => {
  it("LE TITRE SE REMPLIT DEPUIS LA TRACE, même chargée après coup", () => {
    // Recopier le nom à l'instanciation laissait un blanc qu'il fallait penser
    // à combler quand la trace arrivait ensuite.
    const titre = textes(instancier("carte", { ...CTX, nomTrace: null })).find(
      (e) => e.role === "titre",
    )!;
    expect(titre.contenu).toBe("{nom}");
  });
});

describe("les piles des stories ne se chevauchent pas", () => {
  const STORY: ContexteModele = { ...CTX, format: "story" };

  /** Les boîtes en pixels, hors fond de planche et hors mobilier d'en-tête. */
  function blocs(cle: CleModele) {
    return instancier(cle, STORY)
      .elements.filter((e) => !(e.type === "photo" && e.fondDePlanche) && e.type !== "marque")
      .filter((e) => e.type !== "forme")
      .map((e) => ({ nom: e.nom, ...enPixels(e, "story") }));
  }

  for (const cle of ["silhouette", "chiffres"] as const) {
    it(`« ${cle} » empile ses blocs sans qu'aucun n'en recouvre un autre`, () => {
      const b = blocs(cle);
      for (let i = 0; i < b.length; i += 1) {
        for (let j = i + 1; j < b.length; j += 1) {
          const a = b[i]!;
          const c = b[j]!;
          const seCroisent =
            a.x < c.x + c.l && c.x < a.x + a.l && a.y < c.y + c.h && c.y < a.y + a.h;
          expect(seCroisent, `${a.nom} recouvre ${c.nom}`).toBe(false);
        }
      }
    });

    it(`« ${cle} » tient dans la zone sûre`, () => {
      const zone = formatDe("story").zoneSure!;
      for (const e of blocs(cle)) {
        expect(e.y, e.nom).toBeGreaterThanOrEqual(zone.top - 1);
        expect(e.y + e.h, e.nom).toBeLessThanOrEqual(zone.bottom + 1);
      }
    });
  }
});

describe("le mobilier et le contenu ne se recouvrent pas", () => {
  /** Les éléments que `mobilier()` pose : marque, filets, pagination, glisse. */
  const MOBILIER = ["Filet d'en-tête", "Filet de pied", "Pagination", "Glisse"];
  const estMobilier = (e: Element) => e.type === "marque" || MOBILIER.includes(e.nom);

  /** Deux boîtes se recouvrent si elles se croisent dans les DEUX sens. */
  function croise(a: ReturnType<typeof enPixels>, b: ReturnType<typeof enPixels>): boolean {
    const x = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
    const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return x > 2 && y > 2;
  }

  for (const cle of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
    for (const m of MODELES) {
      if (m.formats && !m.formats.includes(cle)) continue;
      it(`${m.cle} · ${cle}`, () => {
        const planche = instancier(m.cle, { ...CTX, format: cle });
        const poses = planche.elements.map((e) => ({ e, b: enPixels(e, cle) }));
        // UN FOND PASSE SOUS LE MOBILIER par construction — une photo, ou une
        // carte plein cadre : c'est tout l'intérêt d'une marque posée dessus. Ce
        // qui ne doit jamais se superposer, c'est ce qui se LIT.
        const estFond = (e: Element) =>
          e.type === "photo" || (e.x <= 0.01 && e.y <= 0.01 && e.l >= 0.99 && e.h >= 0.99);
        const contenu = poses.filter(({ e }) => !estMobilier(e) && !estFond(e));
        for (const mo of poses.filter(({ e }) => estMobilier(e))) {
          for (const co of contenu) {
            expect(
              croise(mo.b, co.b),
              `« ${co.e.nom} » recouvre « ${mo.e.nom} »`,
            ).toBe(false);
          }
        }
      });
    }
  }
});
