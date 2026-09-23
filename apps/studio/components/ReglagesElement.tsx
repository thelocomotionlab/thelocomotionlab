"use client";

// components/ReglagesElement.tsx
//
// CE QUE CHAQUE TYPE D'ÉLÉMENT A DE PROPRE.
//
// L'inspecteur porte l'identité, la position et la typographie ; ici vivent les
// réglages qu'un seul type connaît — le fond d'une carte, les journées d'une
// grille, le cadrage d'une photo. Un élément qu'on ne peut pas régler est un
// élément qu'il faut aller écrire à la main dans le fichier du projet, et c'est
// exactement ce que le studio existe pour éviter.

import { useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import {
  COULEURS_TEXTE,
  brandColors,
  ecrireLesSeries,
  lireLesSeries,
  PALETTE_JOURS,
  PUCES_SIMPLES,
  VARIABLES,
  couleurDuJour,
  idNeuf,
  type CleVariable,
  type Element,
  type ElementCarte,
  type ElementCases,
  type ElementFiche,
  type ElementForme,
  type ElementIcone,
  type ElementMarque,
  type ElementPhoto,
  type ElementSemaines,
  type ElementProfil,
  type ElementStat,
  type ElementTexte,
  type DegradesCarte,
  type Etiquette,
  type LigneLegende,
  type Filet,
} from "@locomotionlab/planche";
import { CLES_ICONES } from "@locomotionlab/ui/icones";

import { Bouton, Case, Choix, Couleur, Curseur, Mot, Nombre } from "./Controles";

/** Le nombre de journées que la trace du projet porte. */
export type Contexte = { jours: number };

type Poser<T extends Element> = (transforme: (e: T) => T, libelle: string) => void;

function Titre({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-2.5 mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-brand-muted first:mt-0">
      {children}
    </h4>
  );
}

function Aide({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-snug text-brand-muted">{children}</p>;
}

/**
 * UN FILET — largeur, épaisseur, couleur — ou pas de filet du tout.
 *
 * Cinq champs du modèle sont des filets (contour, bordure, filet ouvrant, filet
 * sous le titre) et se règlent tous pareil ; la case décide de son existence,
 * parce que `null` et « épaisseur zéro » ne sont pas la même chose à la reprise.
 */
function ReglageFilet({
  libelle,
  filet,
  onChange,
  avecLargeur = true,
}: {
  libelle: string;
  filet: Filet | null;
  onChange: (f: Filet | null) => void;
  avecLargeur?: boolean;
}) {
  return (
    <>
      <Case
        libelle={libelle}
        coche={Boolean(filet)}
        onChange={(v) => onChange(v ? { largeur: 120, epaisseur: 4, couleur: "" } : null)}
      />
      {filet && (
        <div className="mb-1 border-l border-brand-hairline pl-2">
          {avecLargeur && (
            <Nombre
              libelle="Largeur"
              valeur={filet.largeur}
              suffixe="px"
              onChange={(n) => onChange({ ...filet, largeur: Math.max(0, n) })}
            />
          )}
          <Nombre
            libelle="Épaisseur"
            valeur={filet.epaisseur}
            suffixe="px"
            onChange={(n) => onChange({ ...filet, epaisseur: Math.max(0.5, n) })}
          />
          <Couleur
            libelle="Couleur"
            valeur={filet.couleur}
            onChange={(v) => onChange({ ...filet, couleur: v })}
          />
        </div>
      )}
    </>
  );
}

/**
 * LES COULEURS DES JOURNÉES : la palette de la charte, ou les siennes.
 *
 * Carte, profil et grille lisent la MÊME liste — c'est ce qui fait qu'un jour
 * garde sa teinte d'une pièce à l'autre de la planche. Vide, chacun retombe sur
 * la palette, et les trois s'accordent sans qu'on ait rien à régler.
 */
function ReglageCouleursDesJours({
  couleurs,
  jours,
  onChange,
}: {
  couleurs: string[];
  jours: number;
  onChange: (c: string[]) => void;
}) {
  const combien = Math.max(1, Math.min(12, jours));
  const liste = Array.from({ length: combien }, (_, i) => couleurs[i] ?? "");
  return (
    <>
      <div className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
        <span className="text-brand-muted">Journées</span>
        <span className="flex flex-wrap items-center justify-end gap-1">
          {liste.map((c, i) => (
            <input
              key={i}
              type="color"
              value={c || couleurDuJour([], i)}
              aria-label={`Couleur du jour ${i + 1}`}
              onChange={(e) => {
                const suite = [...liste];
                suite[i] = e.target.value;
                onChange(suite);
              }}
              className="h-6 w-6 cursor-pointer rounded border border-brand-field bg-brand-bg"
            />
          ))}
        </span>
      </div>
      {couleurs.length > 0 && (
        <Bouton onClick={() => onChange([])} titre="Reprendre la palette de la charte">
          Palette de la charte
        </Bouton>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ texte */

function ReglagesTexte({ e, poser }: { e: ElementTexte; poser: Poser<ElementTexte> }) {
  return (
    <>
      <Titre>Mise en page</Titre>
      <Choix
        libelle="Alignement"
        valeur={e.alignement}
        options={[
          { cle: "gauche" as const, label: "À gauche" },
          { cle: "centre" as const, label: "Centré" },
          { cle: "droite" as const, label: "À droite" },
        ]}
        onChange={(v) => poser((x) => ({ ...x, alignement: v }), "alignement")}
      />
      <Choix
        libelle="Casse"
        valeur={e.casse}
        options={[
          { cle: "normale" as const, label: "Telle que tapée" },
          { cle: "capitales" as const, label: "Petites capitales" },
        ]}
        onChange={(v) => poser((x) => ({ ...x, casse: v }), "casse")}
      />
      <Nombre
        libelle="Interlettrage"
        valeur={e.lettrage}
        pas={0.01}
        decimales={2}
        suffixe="em"
        onChange={(n) => poser((x) => ({ ...x, lettrage: n }), "interlettrage")}
      />
      <Nombre
        libelle="Interligne"
        valeur={e.interligne}
        pas={0.05}
        decimales={2}
        onChange={(n) => poser((x) => ({ ...x, interligne: Math.max(0.6, n) }), "interligne")}
      />
      <Nombre
        libelle="Entre les points"
        valeur={e.entreItems ?? 0.35}
        pas={0.05}
        decimales={2}
        onChange={(n) => poser((x) => ({ ...x, entreItems: Math.max(0, n) }), "interligne")}
      />
      <Case
        libelle="Réduire pour tenir dans le cadre"
        coche={e.ajuster !== false}
        onChange={(v) => poser((x) => ({ ...x, ajuster: v }), "ajuster")}
      />
      <Case
        libelle="Italique"
        coche={e.italique}
        onChange={(v) => poser((x) => ({ ...x, italique: v }), "italique")}
      />
      <Couleur
        libelle="Encre"
        valeur={e.couleur}
        onChange={(v) => poser((x) => ({ ...x, couleur: v }), "encre")}
      />
      <Choix
        libelle="Puce"
        valeur={e.puce}
        options={PUCES_SIMPLES.map((p) => ({ cle: p.cle as string, label: p.label }))}
        onChange={(v) => poser((x) => ({ ...x, puce: v }), "puce")}
      />

      <Titre>Filets</Titre>
      <ReglageFilet
        libelle="Filet d'ouverture"
        filet={e.filetOuvrant}
        onChange={(f) => poser((x) => ({ ...x, filetOuvrant: f }), "filet")}
      />
      <ReglageFilet
        libelle="Filet sous le titre"
        filet={e.filetSousTitre}
        onChange={(f) => poser((x) => ({ ...x, filetSousTitre: f }), "filet")}
      />

      <Titre>Fond et relief</Titre>
      <Case
        libelle="Plaque sous les lettres"
        coche={Boolean(e.plaque)}
        onChange={(v) =>
          poser(
            (x) => ({
              ...x,
              plaque: v
                ? {
                    couleur: "",
                    opacite: 0.72,
                    margeX: 0.5,
                    margeY: 0.28,
                    rayon: 6,
                    degrade: "aucun",
                    fondu: 0.4,
                  }
                : null,
            }),
            "plaque",
          )
        }
      />
      {e.plaque && (
        <div className="mb-1 border-l border-brand-hairline pl-2">
          <Curseur
            libelle="Opacité"
            valeur={e.plaque.opacite}
            onChange={(n) =>
              poser((x) => (x.plaque ? { ...x, plaque: { ...x.plaque, opacite: n } } : x), "plaque")
            }
          />
          <Nombre
            libelle="Rayon"
            valeur={e.plaque.rayon}
            suffixe="px"
            onChange={(n) =>
              poser((x) => (x.plaque ? { ...x, plaque: { ...x.plaque, rayon: n } } : x), "plaque")
            }
          />
          <Couleur
            libelle="Couleur"
            valeur={e.plaque.couleur}
            onChange={(v) =>
              poser((x) => (x.plaque ? { ...x, plaque: { ...x.plaque, couleur: v } } : x), "plaque")
            }
          />
        </div>
      )}
      <Case
        libelle="Ombre portée"
        coche={Boolean(e.ombre)}
        onChange={(v) =>
          poser(
            (x) => ({
              ...x,
              ombre: v ? { flou: 18, dx: 0, dy: 2, opacite: 0.45, couleur: "" } : null,
            }),
            "ombre",
          )
        }
      />
      {e.ombre && (
        <div className="mb-1 border-l border-brand-hairline pl-2">
          <Nombre
            libelle="Flou"
            valeur={e.ombre.flou}
            suffixe="px"
            onChange={(n) =>
              poser((x) => (x.ombre ? { ...x, ombre: { ...x.ombre, flou: Math.max(0, n) } } : x), "ombre")
            }
          />
          <Curseur
            libelle="Opacité"
            valeur={e.ombre.opacite}
            onChange={(n) =>
              poser((x) => (x.ombre ? { ...x, ombre: { ...x.ombre, opacite: n } } : x), "ombre")
            }
          />
        </div>
      )}
      <Aide>
        Les couleurs nommées du balisage : {Object.keys(COULEURS_TEXTE).join(", ")}.
      </Aide>
    </>
  );
}

/* ------------------------------------------------------------------ photo */

function ReglagesPhoto({ e, poser }: { e: ElementPhoto; poser: Poser<ElementPhoto> }) {
  const r = e.reglages;
  return (
    <>
      <Titre>Cadrage</Titre>
      <Nombre
        libelle="Échelle"
        valeur={e.cadrage.echelle}
        pas={0.05}
        decimales={2}
        onChange={(n) =>
          poser((x) => ({ ...x, cadrage: { ...x.cadrage, echelle: Math.max(1, n) } }), "cadrage")
        }
      />
      <Case
        libelle="Retournée"
        coche={e.retournee}
        onChange={(v) => poser((x) => ({ ...x, retournee: v }), "retourner")}
      />
      <Nombre
        libelle="Coins"
        valeur={e.coins}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, coins: Math.max(0, n) }), "coins")}
      />
      <Aide>Glisse la photo dans son cadre pour la recadrer.</Aide>

      <Titre>Rendu</Titre>
      <Curseur
        libelle="Luminosité"
        valeur={r.luminosite}
        max={2}
        onChange={(n) => poser((x) => ({ ...x, reglages: { ...x.reglages, luminosite: n } }), "photo")}
      />
      <Curseur
        libelle="Contraste"
        valeur={r.contraste}
        max={2}
        onChange={(n) => poser((x) => ({ ...x, reglages: { ...x.reglages, contraste: n } }), "photo")}
      />
      <Curseur
        libelle="Saturation"
        valeur={r.saturation}
        max={2}
        onChange={(n) => poser((x) => ({ ...x, reglages: { ...x.reglages, saturation: n } }), "photo")}
      />

      <Titre>Voile et fondus</Titre>
      <Case
        libelle="Voile"
        coche={Boolean(e.voile)}
        onChange={(v) =>
          poser((x) => ({ ...x, voile: v ? { couleur: "", opacite: 0.3 } : null }), "voile")
        }
      />
      {e.voile && (
        <div className="mb-1 border-l border-brand-hairline pl-2">
          <Curseur
            libelle="Opacité"
            valeur={e.voile.opacite}
            onChange={(n) =>
              poser((x) => (x.voile ? { ...x, voile: { ...x.voile, opacite: n } } : x), "voile")
            }
          />
          <Couleur
            libelle="Couleur"
            valeur={e.voile.couleur}
            onChange={(v) =>
              poser((x) => (x.voile ? { ...x, voile: { ...x.voile, couleur: v } } : x), "voile")
            }
          />
        </div>
      )}
      <Case
        libelle="Fondus vers le fond"
        coche={Boolean(e.degrades)}
        onChange={(v) =>
          poser(
            (x) => ({ ...x, degrades: v ? { haut: 0, bas: 1, hauteur: 0.42 } : null }),
            "fondus",
          )
        }
      />
      {e.degrades && (
        <div className="mb-1 border-l border-brand-hairline pl-2">
          <Curseur
            libelle="En haut"
            valeur={e.degrades.haut}
            onChange={(n) =>
              poser((x) => (x.degrades ? { ...x, degrades: { ...x.degrades, haut: n } } : x), "fondus")
            }
          />
          <Curseur
            libelle="En bas"
            valeur={e.degrades.bas}
            onChange={(n) =>
              poser((x) => (x.degrades ? { ...x, degrades: { ...x.degrades, bas: n } } : x), "fondus")
            }
          />
          <Curseur
            libelle="Hauteur"
            valeur={e.degrades.hauteur}
            onChange={(n) =>
              poser(
                (x) => (x.degrades ? { ...x, degrades: { ...x.degrades, hauteur: n } } : x),
                "fondus",
              )
            }
          />
        </div>
      )}
      <ReglageFilet
        libelle="Bordure"
        filet={e.bordure}
        avecLargeur={false}
        onChange={(f) => poser((x) => ({ ...x, bordure: f }), "bordure")}
      />
    </>
  );
}

/* ------------------------------------------------------------------ formes */

function ReglagesForme({ e, poser }: { e: ElementForme; poser: Poser<ElementForme> }) {
  return (
    <>
      <Choix
        libelle="Forme"
        valeur={e.forme}
        options={[
          { cle: "rectangle" as const, label: "Rectangle" },
          { cle: "cercle" as const, label: "Cercle" },
          { cle: "ligne" as const, label: "Ligne" },
          { cle: "filet" as const, label: "Filet" },
        ]}
        onChange={(v) => poser((x) => ({ ...x, forme: v }), "forme")}
      />
      <Case
        libelle="Rempli"
        coche={e.remplissage !== null}
        onChange={(v) => poser((x) => ({ ...x, remplissage: v ? "" : null }), "remplissage")}
      />
      {e.remplissage !== null && (
        <Couleur
          libelle="Remplissage"
          valeur={e.remplissage}
          onChange={(v) => poser((x) => ({ ...x, remplissage: v }), "remplissage")}
        />
      )}
      <Nombre
        libelle="Coins"
        valeur={e.coins}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, coins: Math.max(0, n) }), "coins")}
      />
      <ReglageFilet
        libelle="Contour"
        filet={e.contour}
        avecLargeur={false}
        onChange={(f) => poser((x) => ({ ...x, contour: f }), "contour")}
      />
    </>
  );
}

function ReglagesIcone({ e, poser }: { e: ElementIcone; poser: Poser<ElementIcone> }) {
  return (
    <>
      <Choix
        libelle="Icône"
        valeur={e.cle}
        options={CLES_ICONES.map((c) => ({ cle: c, label: c }))}
        onChange={(v) => poser((x) => ({ ...x, cle: v }), "icône")}
      />
      <Couleur
        libelle="Couleur"
        valeur={e.couleur}
        onChange={(v) => poser((x) => ({ ...x, couleur: v }), "couleur")}
      />
      <Nombre
        libelle="Épaisseur"
        valeur={e.epaisseur}
        pas={0.1}
        decimales={1}
        onChange={(n) => poser((x) => ({ ...x, epaisseur: Math.max(0.5, n) }), "épaisseur")}
      />
    </>
  );
}

function ReglagesMarque({ e, poser }: { e: ElementMarque; poser: Poser<ElementMarque> }) {
  return (
    <>
      <Choix
        libelle="Variante"
        valeur={e.variante}
        options={[
          { cle: "logo-nom" as const, label: "Logo et nom" },
          { cle: "logo" as const, label: "Logo seul" },
          { cle: "nom" as const, label: "Nom seul" },
          { cle: "cercle" as const, label: "Logo cerclé" },
        ]}
        onChange={(v) => poser((x) => ({ ...x, variante: v }), "marque")}
      />
      <Couleur
        libelle="Teinte"
        valeur={e.teinte}
        onChange={(v) => poser((x) => ({ ...x, teinte: v }), "teinte")}
      />
    </>
  );
}

/* ------------------------------------------------------------------ carte */

function ReglagesCarte({
  e,
  poser,
  ctx,
}: {
  e: ElementCarte;
  poser: Poser<ElementCarte>;
  ctx: Contexte;
}) {
  /** Une entrée RÉÉCRIT l'étiquette de sa journée ; sans entrée, « J3 ». */
  const reecrire = (jour: number, champ: Partial<Etiquette>) =>
    poser((x) => {
      const dit = x.etiquettes.find((t) => t.segment === jour);
      const neuve: Etiquette = dit
        ? { ...dit, ...champ }
        : { id: idNeuf("et"), segment: jour, texte: "", icone: null, dx: 0, dy: 0, masquee: false, ...champ };
      return { ...x, etiquettes: [...x.etiquettes.filter((t) => t.segment !== jour), neuve] };
    }, "étiquette");

  const d = e.degrades;
  const majDegrade = (champ: Partial<DegradesCarte>) =>
    poser(
      (x) => ({
        ...x,
        degrades: { haut: 0.8, hautH: 180, bas: 1, basH: 520, ...x.degrades, ...champ },
      }),
      "dégradé",
    );

  return (
    <>
      <Choix
        libelle="Fond"
        valeur={e.fond}
        options={[
          { cle: "aucun" as const, label: "Aucun — la silhouette" },
          { cle: "relief" as const, label: "Relief" },
          { cle: "topo" as const, label: "Topo" },
          { cle: "satellite" as const, label: "Satellite" },
        ]}
        onChange={(v) => poser((x) => ({ ...x, fond: v }), "fond de carte")}
      />
      <Nombre
        libelle="Épaisseur"
        valeur={e.epaisseur}
        onChange={(n) => poser((x) => ({ ...x, epaisseur: Math.max(1, n) }), "épaisseur")}
      />
      <Case
        libelle="Marqueur de départ"
        coche={e.depart}
        onChange={(v) => poser((x) => ({ ...x, depart: v }), "départ")}
      />
      <Case
        libelle="Marqueur d'arrivée"
        coche={e.arrivee}
        onChange={(v) => poser((x) => ({ ...x, arrivee: v }), "arrivée")}
      />
      <Case
        libelle="Itinéraire entier en sourdine"
        coche={e.itineraireSourdine}
        onChange={(v) => poser((x) => ({ ...x, itineraireSourdine: v }), "sourdine")}
      />

      <Titre>Dégradés</Titre>
      <Case
        libelle="Voiler pour le texte"
        coche={Boolean(d)}
        onChange={(v) =>
          poser(
            (x) => ({
              ...x,
              degrades: v ? { haut: 0.8, hautH: 180, bas: 1, basH: 520 } : null,
            }),
            "dégradé",
          )
        }
      />
      {d && (
        <div className="mb-1 border-l border-brand-hairline pl-2">
          <Curseur
            libelle="En-tête"
            valeur={d.haut}
            onChange={(n) => majDegrade({ haut: n })}
          />
          <Nombre
            libelle="Sa hauteur"
            valeur={d.hautH}
            suffixe="px"
            onChange={(n) => majDegrade({ hautH: Math.max(0, n) })}
          />
          <Curseur libelle="Pied" valeur={d.bas} onChange={(n) => majDegrade({ bas: n })} />
          <Nombre
            libelle="Sa hauteur"
            valeur={d.basH}
            suffixe="px"
            onChange={(n) => majDegrade({ basH: Math.max(0, n) })}
          />
          <Aide>
            L&rsquo;intensité MULTIPLIE le voile de la charte : 1 est celui des planches
            d&rsquo;avant, 0 l&rsquo;éteint. La hauteur est la distance sur laquelle il
            s&rsquo;éteint — court et dense mange le ciel, long et léger le garde.
          </Aide>
        </div>
      )}

      <Titre>Couleurs</Titre>
      <ReglageCouleursDesJours
        couleurs={e.couleurs}
        jours={ctx.jours}
        onChange={(c) => poser((x) => ({ ...x, couleurs: c }), "couleurs")}
      />

      <Titre>Étiquettes</Titre>
      <Case
        libelle="Une par journée"
        coche={e.etiquettesAuto !== false}
        onChange={(v) => poser((x) => ({ ...x, etiquettesAuto: v }), "étiquettes")}
      />
      {e.etiquettesAuto !== false &&
        Array.from({ length: Math.max(1, ctx.jours) }, (_, i) => {
          const dit = e.etiquettes.find((t) => t.segment === i);
          return (
            <div key={i} className="mb-1.5 border-l border-brand-hairline pl-2">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={dit?.texte ?? ""}
                  placeholder={`J${i + 1}`}
                  aria-label={`Étiquette du jour ${i + 1}`}
                  onChange={(ev) => reecrire(i, { texte: ev.target.value })}
                  className="min-w-0 flex-1 rounded border border-brand-field bg-brand-bg px-1.5 py-1 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => reecrire(i, { masquee: !dit?.masquee })}
                  aria-pressed={Boolean(dit?.masquee)}
                  aria-label={`Masquer l'étiquette du jour ${i + 1}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-field transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
                >
                  {dit?.masquee ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {!dit?.masquee && (
                <>
                  <Choix
                    libelle="Icône"
                    valeur={dit?.icone ?? ""}
                    options={[
                      { cle: "", label: "Pastille du jour" },
                      ...CLES_ICONES.map((k) => ({ cle: k, label: k })),
                    ]}
                    onChange={(v) => reecrire(i, { icone: v || null })}
                  />
                  <Nombre
                    libelle="Décalage X"
                    valeur={(dit?.dx ?? 0) * 100}
                    suffixe="%"
                    onChange={(n) => reecrire(i, { dx: n / 100 })}
                  />
                  <Nombre
                    libelle="Décalage Y"
                    valeur={(dit?.dy ?? 0) * 100}
                    suffixe="%"
                    onChange={(n) => reecrire(i, { dy: n / 100 })}
                  />
                </>
              )}
            </div>
          );
        })}
      <Aide>Vide, la journée porte son numéro. Attrape-la dans la planche pour la déplacer.</Aide>
    </>
  );
}

/* ----------------------------------------------------------------- profil */

function ReglagesProfil({
  e,
  poser,
  ctx,
}: {
  e: ElementProfil;
  poser: Poser<ElementProfil>;
  ctx: Contexte;
}) {
  const parJournee = e.parJournee !== false;
  return (
    <>
      <Case
        libelle="Restant estompé"
        coche={e.restantEstompe}
        onChange={(v) => poser((x) => ({ ...x, restantEstompe: v }), "restant")}
      />
      <Case
        libelle="Une couleur par journée"
        coche={parJournee}
        onChange={(v) => poser((x) => ({ ...x, parJournee: v }), "journées")}
      />
      <Couleur
        libelle="Couleur imposée"
        valeur={e.remplissage}
        onChange={(v) => poser((x) => ({ ...x, remplissage: v }), "remplissage")}
      />
      <Aide>
        Une couleur imposée passe devant les journées : tout le profil la prend.
      </Aide>
      {parJournee && !e.remplissage && (
        <>
          <Titre>Couleurs</Titre>
          <ReglageCouleursDesJours
            couleurs={e.couleurs ?? []}
            jours={ctx.jours}
            onChange={(c) => poser((x) => ({ ...x, couleurs: c }), "couleurs")}
          />
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------- chiffre, fiche */

const OPTIONS_VARIABLES = VARIABLES.map((v) => ({ cle: v.cle, label: v.label }));

function ReglagesStat({ e, poser }: { e: ElementStat; poser: Poser<ElementStat> }) {
  return (
    <>
      <Choix
        libelle="Variable"
        valeur={e.variable}
        options={OPTIONS_VARIABLES}
        onChange={(v) => poser((x) => ({ ...x, variable: v as CleVariable }), "variable")}
      />
      <Mot
        libelle="Libellé"
        valeur={e.libelle ?? ""}
        placeholder="celui de la variable"
        onChange={(v) => poser((x) => ({ ...x, libelle: v || null }), "libellé")}
      />
      <Nombre
        libelle="Corps"
        valeur={e.taille}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, taille: Math.max(8, n) }), "corps")}
      />
      <Mot
        libelle="Valeur"
        valeur={e.valeurManuelle ?? ""}
        placeholder="calculée"
        onChange={(v) => poser((x) => ({ ...x, valeurManuelle: v || null }), "valeur")}
      />
      <Aide>Une valeur écrite ici remplace le calcul — la montre a raison.</Aide>
    </>
  );
}

function ReglagesFiche({ e, poser }: { e: ElementFiche; poser: Poser<ElementFiche> }) {
  const maj = (i: number, champ: Partial<ElementFiche["lignes"][number]>) =>
    poser(
      (x) => ({ ...x, lignes: x.lignes.map((l, j) => (i === j ? { ...l, ...champ } : l)) }),
      "fiche",
    );
  return (
    <>
      <Nombre
        libelle="Corps du libellé"
        valeur={e.tailleLibelle}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, tailleLibelle: Math.max(6, n) }), "corps")}
      />
      <Nombre
        libelle="Corps de la valeur"
        valeur={e.tailleValeur}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, tailleValeur: Math.max(6, n) }), "corps")}
      />
      <Titre>Lignes</Titre>
      {e.lignes.map((l, i) => (
        <div key={i} className="mb-1.5 border-l border-brand-hairline pl-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={l.libelle}
              onChange={(ev) => maj(i, { libelle: ev.target.value })}
              aria-label="Libellé"
              className="min-w-0 flex-1 rounded border border-brand-field bg-brand-bg px-1.5 py-1 text-[13px]"
            />
            <button
              type="button"
              onClick={() =>
                poser((x) => ({ ...x, lignes: x.lignes.filter((_, j) => j !== i) }), "fiche")
              }
              aria-label="Retirer la ligne"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-field transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <Choix
            libelle="Source"
            valeur={l.variable ?? ""}
            options={[{ cle: "", label: "Valeur écrite" }, ...OPTIONS_VARIABLES]}
            onChange={(v) =>
              maj(i, v ? { variable: v as CleVariable, valeur: null } : { variable: null, valeur: "" })
            }
          />
          {!l.variable && (
            <Mot libelle="Valeur" valeur={l.valeur ?? ""} onChange={(v) => maj(i, { valeur: v })} />
          )}
          <Case libelle="En accent" coche={l.accent} onChange={(v) => maj(i, { accent: v })} />
        </div>
      ))}
      <Bouton
        onClick={() =>
          poser(
            (x) => ({
              ...x,
              lignes: [...x.lignes, { libelle: "Libellé", valeur: "", variable: null, accent: false }],
            }),
            "fiche",
          )
        }
      >
        Ajouter une ligne
      </Bouton>
    </>
  );
}

/* ------------------------------------------------------------------ cases */

function ReglagesCases({
  e,
  poser,
  ctx,
}: {
  e: ElementCases;
  poser: Poser<ElementCases>;
  ctx: Contexte;
}) {
  const ecrites = e.cases ?? [];
  const ecrire = (jour: number, texte: string) =>
    poser((x) => {
      const suite = (x.cases ?? []).filter((k) => k.jour !== jour);
      return { ...x, cases: texte ? [...suite, { jour, texte }] : suite };
    }, "case");
  return (
    <>
      <Nombre
        libelle="Colonnes"
        valeur={e.colonnes}
        onChange={(n) => poser((x) => ({ ...x, colonnes: Math.max(1, Math.min(4, n)) }), "colonnes")}
      />
      <Nombre
        libelle="Corps"
        valeur={e.taille || 30}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, taille: Math.max(8, n) }), "corps")}
      />
      <Case
        libelle="Mini-carte"
        coche={e.miniCarte !== false}
        onChange={(v) => poser((x) => ({ ...x, miniCarte: v }), "mini-carte")}
      />
      <Case
        libelle="Mini-profil"
        coche={e.miniProfil !== false}
        onChange={(v) => poser((x) => ({ ...x, miniProfil: v }), "mini-profil")}
      />
      <Case
        libelle="Filet de séparation"
        coche={e.filet}
        onChange={(v) => poser((x) => ({ ...x, filet: v }), "filet")}
      />

      <Titre>Couleurs</Titre>
      <ReglageCouleursDesJours
        couleurs={e.couleurs ?? []}
        jours={ctx.jours}
        onChange={(c) => poser((x) => ({ ...x, couleurs: c }), "couleurs")}
      />

      <Titre>Textes</Titre>
      {Array.from({ length: Math.max(1, ctx.jours) }, (_, i) => (
        <label key={i} className="mb-1 block text-[12px]">
          <span className="text-brand-muted">Jour {i + 1}</span>
          <textarea
            value={ecrites.find((k) => k.jour === i)?.texte ?? ""}
            placeholder="écrit depuis la trace"
            onChange={(ev) => ecrire(i, ev.target.value)}
            rows={2}
            className="mt-0.5 w-full resize-y rounded border border-brand-field bg-brand-bg px-1.5 py-1 text-[13px] leading-snug"
          />
        </label>
      ))}
      <Aide>Vide, la journée écrit son numéro et ses chiffres.</Aide>
    </>
  );
}

/* --------------------------------------------------------------- semaines */

/**
 * LE BLOC DE DONNÉES SE TAPE, il ne se saisit pas champ par champ.
 *
 * Dix-sept semaines sur deux séries, c'est trente-six cases : personne ne les
 * remplit une par une. On écrit — ou on colle — le bloc entier, on relit ce qui
 * a été compris, et les couleurs déjà posées survivent, parce qu'on recolle
 * souvent juste pour corriger un chiffre.
 */
/** Un nombre tapé dans un champ texte — vide, c'est « auto ». */
function nombreOuRien(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function texteDuNombre(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

function ReglagesSemaines({
  e,
  poser,
}: {
  e: ElementSemaines;
  poser: Poser<ElementSemaines>;
}) {
  const [brut, setBrut] = useState<string | null>(null);
  const texte = brut ?? ecrireLesSeries(e);
  const lu = lireLesSeries(texte);

  const ecrire = (v: string) => {
    setBrut(v);
    const { abscisse, series } = lireLesSeries(v);
    if (series.length === 0 && abscisse.length === 0) return;
    poser(
      (x) => ({
        ...x,
        abscisse,
        series,
        // Les index montrés restent valides : une série retirée ne doit pas
        // laisser le graphique pointer dans le vide.
        barres: Math.min(x.barres, Math.max(0, series.length - 1)),
        courbe: x.courbe === null ? null : Math.min(x.courbe, series.length - 1),
      }),
      "données",
    );
  };

  const optionsSeries = e.series.map((s, i) => ({
    cle: String(i),
    label: s.unite ? `${s.nom} (${s.unite})` : s.nom || `Série ${i + 1}`,
  }));

  const majLegende = (i: number, champ: Partial<LigneLegende>) =>
    poser(
      (x) => ({ ...x, legende: x.legende.map((l, k) => (k === i ? { ...l, ...champ } : l)) }),
      "légende",
    );

  return (
    <>
      <Titre>Données</Titre>
      <textarea
        value={texte}
        onChange={(ev) => ecrire(ev.target.value)}
        onBlur={() => setBrut(null)}
        rows={9}
        spellCheck={false}
        aria-label="Le bloc de données"
        className="w-full resize-y rounded-md border border-brand-field bg-brand-bg px-2 py-1.5 font-mono text-[11px] leading-snug"
      />
      <Aide>
        {lu.abscisse.length} étiquette{lu.abscisse.length > 1 ? "s" : ""} et {lu.series.length}{" "}
        série{lu.series.length > 1 ? "s" : ""} lue{lu.series.length > 1 ? "s" : ""}. Une accolade
        oubliée ne fait pas perdre le reste.
      </Aide>

      <Titre>Ce qu&apos;on montre</Titre>
      <Choix
        libelle="En barres"
        valeur={String(e.barres)}
        options={optionsSeries}
        onChange={(v) => poser((x) => ({ ...x, barres: Number(v) }), "série")}
      />
      <Choix
        libelle="En courbe"
        valeur={e.courbe === null ? "" : String(e.courbe)}
        options={[{ cle: "", label: "Aucune" }, ...optionsSeries]}
        onChange={(v) => poser((x) => ({ ...x, courbe: v === "" ? null : Number(v) }), "série")}
      />
      <Couleur
        libelle="Barres"
        valeur={e.couleurBarres}
        onChange={(v) => poser((x) => ({ ...x, couleurBarres: v }), "couleur")}
      />
      {e.courbe !== null && (
        <Couleur
          libelle="Courbe"
          valeur={e.couleurCourbe}
          onChange={(v) => poser((x) => ({ ...x, couleurCourbe: v }), "couleur")}
        />
      )}
      <Aide>
        Deux séries au plus : trois échelles sans rapport — cent kilomètres, cinq mille
        mètres, huit heures — ne se superposent pas sans mentir sur l&rsquo;une d&rsquo;elles.
      </Aide>

      <Titre>Axes</Titre>
      <Nombre
        libelle="Une étiquette sur"
        valeur={e.pasDesLabels}
        onChange={(n) => poser((x) => ({ ...x, pasDesLabels: Math.max(1, Math.round(n)) }), "axes")}
      />
      <Choix
        libelle="Étiquettes"
        valeur={String(e.inclinaison || 0)}
        options={[
          { cle: "0", label: "Droites" },
          { cle: "30", label: "En biais · 30°" },
          { cle: "45", label: "En biais · 45°" },
          { cle: "60", label: "En biais · 60°" },
        ]}
        onChange={(v) => poser((x) => ({ ...x, inclinaison: Number(v) }), "axes")}
      />
      <Case
        libelle="Graduations chiffrées"
        coche={e.axes}
        onChange={(v) => poser((x) => ({ ...x, axes: v }), "axes")}
      />
      <Case
        libelle="Nom des séries sur les axes"
        coche={e.titresAxes}
        onChange={(v) => poser((x) => ({ ...x, titresAxes: v }), "axes")}
      />
      <Nombre
        libelle="Corps"
        valeur={e.taille}
        suffixe="px"
        onChange={(n) => poser((x) => ({ ...x, taille: Math.max(8, n) }), "corps")}
      />

      <Titre>Axe des barres</Titre>
      <Mot
        libelle="Maximum"
        valeur={texteDuNombre(e.plafondBarres)}
        placeholder="auto"
        onChange={(v) => poser((x) => ({ ...x, plafondBarres: nombreOuRien(v) }), "axes")}
      />
      <Mot
        libelle="Une graduation tous les"
        valeur={texteDuNombre(e.pasBarres)}
        placeholder="auto"
        onChange={(v) => poser((x) => ({ ...x, pasBarres: nombreOuRien(v) }), "axes")}
      />
      {e.courbe !== null && (
        <>
          <Titre>Axe de la courbe</Titre>
          <Mot
            libelle="Maximum"
            valeur={texteDuNombre(e.plafondCourbe)}
            placeholder="auto"
            onChange={(v) => poser((x) => ({ ...x, plafondCourbe: nombreOuRien(v) }), "axes")}
          />
          <Mot
            libelle="Une graduation tous les"
            valeur={texteDuNombre(e.pasCourbe)}
            placeholder="auto"
            onChange={(v) => poser((x) => ({ ...x, pasCourbe: nombreOuRien(v) }), "axes")}
          />
        </>
      )}
      <Aide>
        Vide, c&rsquo;est automatique : un cran rond au-dessus de la plus haute valeur, et de
        trois à six graduations rondes.
      </Aide>

      <Titre>Dessin</Titre>
      <Case
        libelle="Lignes de grille"
        coche={e.grille !== false}
        onChange={(v) => poser((x) => ({ ...x, grille: v }), "grille")}
      />
      <Nombre
        libelle="Largeur des barres"
        valeur={Math.round((e.largeurBarre || 0.72) * 100)}
        suffixe="%"
        onChange={(n) =>
          poser((x) => ({ ...x, largeurBarre: Math.min(1, Math.max(0.2, n / 100)) }), "barres")
        }
      />
      {e.courbe !== null && (
        <Case
          libelle="Pastilles sur la courbe"
          coche={e.pastilles !== false}
          onChange={(v) => poser((x) => ({ ...x, pastilles: v }), "courbe")}
        />
      )}

      <Titre>Couleurs des barres</Titre>
      <Aide>Clique une barre dans la planche pour la colorer.</Aide>
      {e.couleurs.some(Boolean) && (
        <Bouton
          onClick={() => poser((x) => ({ ...x, couleurs: [] }), "couleurs")}
          titre="Toutes les barres reprennent la couleur de la série"
        >
          Tout remettre à la série
        </Bouton>
      )}

      <Titre>Légende</Titre>
      {e.legende.length === 0 && <Aide>Aucune. Elle dit ce que les couleurs racontent.</Aide>}
      {e.legende.map((l, i) => (
        <div key={i} className="mb-1 flex items-center gap-1">
          <input
            type="color"
            value={l.couleur || brandColors.primary}
            aria-label={`Couleur de la ligne ${i + 1}`}
            onChange={(ev) => majLegende(i, { couleur: ev.target.value })}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border border-brand-field bg-brand-bg"
          />
          <input
            type="text"
            value={l.texte}
            placeholder="ce que dit cette couleur"
            aria-label={`Texte de la ligne ${i + 1}`}
            onChange={(ev) => majLegende(i, { texte: ev.target.value })}
            className="min-w-0 flex-1 rounded border border-brand-field bg-brand-bg px-1.5 py-1 text-[13px]"
          />
          <button
            type="button"
            onClick={() =>
              poser((x) => ({ ...x, legende: x.legende.filter((_, k) => k !== i) }), "légende")
            }
            aria-label={`Retirer la ligne ${i + 1}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand-field transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <Bouton
        onClick={() =>
          poser(
            (x) => ({ ...x, legende: [...x.legende, { couleur: brandColors.primary, texte: "" }] }),
            "légende",
          )
        }
      >
        Ajouter une ligne
      </Bouton>
    </>
  );
}

/* --------------------------------------------------------------- l'aiguillage */

export default function ReglagesElement({
  element,
  regler,
  ctx,
}: {
  element: Element;
  regler: (transforme: (e: Element) => Element, libelle: string) => void;
  ctx: Contexte;
}) {
  // Chaque panneau ne connaît QUE son type : l'aiguillage garde ici le contrôle
  // que la transformation ne s'applique pas à un voisin d'un autre type, dans une
  // sélection multiple comme sur un élément seul.
  const poser =
    <T extends Element>(type: T["type"]): Poser<T> =>
    (transforme, libelle) =>
      regler((e) => (e.type === type ? (transforme(e as T) as Element) : e), libelle);

  switch (element.type) {
    case "texte":
      return <ReglagesTexte e={element} poser={poser<ElementTexte>("texte")} />;
    case "photo":
      return <ReglagesPhoto e={element} poser={poser<ElementPhoto>("photo")} />;
    case "forme":
      return <ReglagesForme e={element} poser={poser<ElementForme>("forme")} />;
    case "icone":
      return <ReglagesIcone e={element} poser={poser<ElementIcone>("icone")} />;
    case "marque":
      return <ReglagesMarque e={element} poser={poser<ElementMarque>("marque")} />;
    case "carte":
      return <ReglagesCarte e={element} poser={poser<ElementCarte>("carte")} ctx={ctx} />;
    case "profil":
      return <ReglagesProfil e={element} poser={poser<ElementProfil>("profil")} ctx={ctx} />;
    case "stat":
      return <ReglagesStat e={element} poser={poser<ElementStat>("stat")} />;
    case "fiche":
      return <ReglagesFiche e={element} poser={poser<ElementFiche>("fiche")} />;
    case "cases":
      return <ReglagesCases e={element} poser={poser<ElementCases>("cases")} ctx={ctx} />;
    case "semaines":
      return <ReglagesSemaines e={element} poser={poser<ElementSemaines>("semaines")} />;
    default:
      return null;
  }
}
