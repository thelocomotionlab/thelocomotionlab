// packages/ui/src/components/contenu/contenu.test.tsx
//
// Ce que ces tests gardent, ce n'est pas l'apparence : ce sont les trois règles
// que les composants portent. L'ancre vient du slug, le numéro de la position,
// et le numéro d'une référence de son rang d'apparition.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "@locomotionlab/contenu/sections";

import SectionsAventure from "./SectionsAventure.tsx";
import Sommaire from "./Sommaire.tsx";
import Accroche from "./Accroche.tsx";
import BadgeStatut from "./BadgeStatut.tsx";
import Protocole from "./Protocole.tsx";
import Note from "./Note.tsx";
import { VersProtocole, VersNote } from "./CarteDeBloc.tsx";
import Bibliographie from "./Bibliographie.tsx";
import { creerRegistreDeReferences } from "./references.ts";
import { creerAppelDeReference } from "./AppelDeReference.tsx";
import { STATUTS_DE_PROTOCOLE } from "@locomotionlab/contenu/blocs";

const SECTIONS: Section[] = [
  { type: "caracteristiques", champs: [{ label: "Distance", valeur: "198,1 km" }] },
  { type: "libre", id: "genese-et-preparatifs", titre: "Genèse et préparatifs" },
  { type: "paquetage", titre: "Le paquetage", ref: "tour-des-ecrins" },
];

const GEO: Section = {
  type: "geo",
  titre: "Trace",
  colonnes: ["Repère", "km"],
  lignes: [["Vénosc", "0"]],
};

/** Les `id` posés par le rendu, dans l'ordre. */
function ancresRendues(html: string): string[] {
  return [...html.matchAll(/id="([^"]+)"/g)].map((trouve) => trouve[1]!);
}

/** Les `href` de fragment, dans l'ordre. */
function liensRendus(html: string): string[] {
  return [...html.matchAll(/href="#([^"]+)"/g)].map((trouve) => trouve[1]!);
}

describe("les sections posent leurs propres ancres", () => {
  it("dérive l'ancre du slug de la section, jamais du numéro", () => {
    const html = renderToStaticMarkup(<SectionsAventure sections={SECTIONS} />);
    expect(ancresRendues(html)).toEqual([
      "caracteristiques",
      "genese-et-preparatifs",
      "paquetage",
    ]);
    expect(html).not.toContain('id="01-caracteristiques"');
  });

  it("numérote depuis la position, en deux chiffres", () => {
    const html = renderToStaticMarkup(<SectionsAventure sections={SECTIONS} />);
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain(">03<");
    expect(html).not.toContain(">04<");
  });

  it("insérer une section en tête renumérote et ne déplace aucune ancre", () => {
    const avant = renderToStaticMarkup(<SectionsAventure sections={SECTIONS} />);
    const apres = renderToStaticMarkup(<SectionsAventure sections={[GEO, ...SECTIONS]} />);

    expect(ancresRendues(apres)).toEqual(["geo", ...ancresRendues(avant)]);
    expect(apres).toContain(">04<");
  });

  it("une aventure à trois sections se rend entièrement, sans cadre en attente", () => {
    const html = renderToStaticMarkup(<SectionsAventure sections={SECTIONS} />);
    expect(html.match(/<section /g)).toHaveLength(3);
    expect(html).toContain("Caractéristiques");
    expect(html).toContain("Genèse et préparatifs");
    expect(html).toContain("Le paquetage");
  });
});

describe("le sommaire est dérivé de la liste des sections", () => {
  it("pointe exactement vers les ancres que les sections posent", () => {
    const sections = [GEO, ...SECTIONS];
    const sommaire = renderToStaticMarkup(<Sommaire sections={sections} />);
    const page = renderToStaticMarkup(<SectionsAventure sections={sections} />);

    expect(liensRendus(sommaire)).toEqual(ancresRendues(page));
  });

  it("porte les mêmes numéros et les mêmes libellés que les sections", () => {
    const html = renderToStaticMarkup(<Sommaire sections={SECTIONS} />);
    expect(html).toContain(">01<");
    expect(html).toContain("Caractéristiques");
    expect(html).toContain("Genèse et préparatifs");
  });

  it("ne rend rien sur une aventure sans section", () => {
    expect(renderToStaticMarkup(<Sommaire sections={[]} />)).toBe("");
  });
});

describe("l'appel de référence est numéroté à l'affichage", () => {
  it("numérote dans l'ordre de première rencontre, et garde le numéro", () => {
    const registre = creerRegistreDeReferences();
    const Ref = creerAppelDeReference(registre);

    const html = renderToStaticMarkup(
      <p>
        un <Ref cle="gundersen2016" /> deux <Ref cle="bonaldo2013" /> trois{" "}
        <Ref cle="gundersen2016" />
      </p>,
    );

    expect([...html.matchAll(/<sup[^>]*>(\d+)<\/sup>/g)].map((t) => t[1])).toEqual(["1", "2", "1"]);
    expect(registre.citees()).toEqual(["gundersen2016", "bonaldo2013"]);
  });

  it("ne fige aucun numéro dans le contenu : le même appel change de rang selon l'ordre", () => {
    const premier = creerRegistreDeReferences();
    creerAppelDeReference(premier);
    premier.numero("bonaldo2013");
    expect(premier.numero("gundersen2016")).toBe(2);

    const second = creerRegistreDeReferences();
    expect(second.numero("gundersen2016")).toBe(1);
  });

  it("la bibliographie ne liste que les clés citées, dans l'ordre des appels", () => {
    const registre = creerRegistreDeReferences();
    registre.numero("bonaldo2013");
    registre.numero("gundersen2016");

    const html = renderToStaticMarkup(
      <Bibliographie
        registre={registre}
        entrees={{
          bonaldo2013: { auteur: "Bonaldo & Sandri", annee: "2013", titre: "Muscle atrophy" },
          gundersen2016: { auteur: "Gundersen et al.", annee: "2016", titre: "Muscle memory" },
          jamais2020: { auteur: "Personne", annee: "2020", titre: "Non citée" },
        }}
      />,
    );

    expect(html.indexOf("Bonaldo")).toBeLessThan(html.indexOf("Gundersen"));
    expect(html).not.toContain("Non citée");
  });

  it("ne rend rien quand aucune référence n'a été appelée", () => {
    const html = renderToStaticMarkup(
      <Bibliographie registre={creerRegistreDeReferences()} entrees={{}} />,
    );
    expect(html).toBe("");
  });
});

describe("la charte tient dans les composants", () => {
  it("l'accroche est en romain maigre, jamais en italique", () => {
    const html = renderToStaticMarkup(<Accroche>170 km et deux pitons.</Accroche>);
    expect(html).toContain("font-sans");
    expect(html).toContain("font-light");
    expect(html).toContain("not-italic");
    expect(html).not.toContain(" italic");
  });

  it("les quatre statuts de protocole ont un rendu", () => {
    for (const statut of STATUTS_DE_PROTOCOLE) {
      const html = renderToStaticMarkup(<BadgeStatut statut={statut} />);
      expect(html, statut).toContain("rounded-full");
      expect(html.replace(/class="[^"]*"/g, ""), statut).toMatch(/>[^<]+</);
    }
  });

  it("un protocole porte sa mention et son ancre, jamais un statut", () => {
    const html = renderToStaticMarkup(
      <Protocole
        id="train-low-eat-low"
        titre="Train-low, Eat-low"
        objectif="Maximiser l'activation de l'AMPK"
        sensations="Début de deuxième footing difficile."
      >
        Footing à jeûn de 50 min.
      </Protocole>,
    );

    expect(html).toContain('id="protocole-train-low-eat-low"');
    expect(html).toContain("Sensations");
    expect(html).toContain("Démarche personnelle, ne constitue pas un conseil.");
    for (const statut of ["En test", "Éprouvé", "Hypothèse", "Abandonné"]) {
      expect(html, statut).not.toContain(statut);
    }
  });

  it("une carte de renvoi prend l'accent de sa sorte de bloc", () => {
    const source = { sorte: "billet" as const, slug: "nouveau-bloc", titre: "Nouveau bloc" };
    const protocole = renderToStaticMarkup(
      <VersProtocole
        bloc={{
          type: "protocole",
          id: "p",
          titre: "T",
          objectif: "O",
          statut: "en-test",
          url: "/blog/nouveau-bloc#protocole-p",
          source,
        }}
      />,
    );
    const note = renderToStaticMarkup(
      <VersNote
        bloc={{
          type: "note",
          id: "n",
          titre: "T",
          objectif: "O",
          url: "/blog/nouveau-bloc#note-n",
          source,
        }}
      />,
    );

    expect(protocole).toContain("border-t-brand-deep");
    expect(note).toContain("border-t-brand-primary-dark");
    expect(note).not.toContain("border-t-brand-deep");
    expect(note).toContain("Note écrite dans le billet");
  });

  it("une note porte son ancre et n'a ni statut ni numéro", () => {
    const html = renderToStaticMarkup(
      <Note id="chasse-d-eau" titre="La chasse d'eau">
        Le modèle de Millet.
      </Note>,
    );

    expect(html).toContain('id="note-chasse-d-eau"');
    expect(html).not.toContain("n = ");
    expect(html).not.toContain("rounded-full");
  });
});
