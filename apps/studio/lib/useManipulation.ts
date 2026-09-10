"use client";

// lib/useManipulation.ts
//
// ATTRAPER UN ÉLÉMENT À LA SOURIS.
//
// C'est le geste qui manquait à la v1 : on y réglait une image en cherchant le
// bon curseur dans un onglet, au lieu de toucher l'image. Tout ce qui se voit
// se saisit — et le panneau ne sert plus qu'à ce que la main ne règle pas au
// pixel.
//
// LES CALCULS SONT DANS LE PAQUET, pas ici. Ce module ne fait que traduire des
// événements en gestes : où on a cliqué, ce qu'on tire, quand l'étape
// d'historique s'ouvre et se referme. La géométrie — collision, poignées,
// magnétisme — est testée sans souris dans `@locomotionlab/planche`.
//
// UN GLISSÉ EST UNE ÉTAPE. Le geste pousse un état par image avec une clé de
// fusion, et la relâche referme l'étape : Ctrl+Z ramène là où le geste a
// commencé, pas une image avant.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  POIGNEE,
  aimanter,
  angleVers,
  avecBoite,
  centreDe,
  ciblesDeLaPlanche,
  elementSous,
  elementsDans,
  enFractions,
  enPixels,
  englobante,
  etendreAuxGroupes,
  formeNeuve,
  formatDe,
  parPas,
  poigneeSous,
  redimensionner,
  texteNeuf,
  tourner,
  type BoitePx,
  type ClePoignee,
  type Element,
  type ElementTexte,
  type Guide,
  type PlancheImage,
  type Point,
  type Projet,
} from "@locomotionlab/planche";

import { avecAjouts, avecPlanches } from "./projet";
import type { Outil, PosteDeTravail } from "./usePosteDeTravail";

/** En deçà, c'est un clic, pas un glissé : sans ce seuil, sélectionner déplace. */
const SEUIL_GLISSE = 3;

/** Maj pendant une rotation cale sur des paliers. */
const PAS_ROTATION = 15;

type Geste =
  | { quoi: "deplacer"; depart: Point; boites: Map<string, BoitePx> }
  | { quoi: "redimensionner"; depart: Point; poignee: ClePoignee; boites: Map<string, BoitePx> }
  | { quoi: "tourner"; centre: Point; angleInitial: number; rotations: Map<string, number> }
  | { quoi: "rectangle"; depart: Point }
  | { quoi: "poser"; depart: Point; outil: Outil };

export type EtatManipulation = {
  /** Le rectangle de sélection en cours, en pixels de planche. */
  rectangle: BoitePx | null;
  guides: Guide[];
  /** Le geste en cours, pour le curseur. */
  geste: Geste["quoi"] | null;
};

/** Deux clics plus espacés que ça sont deux clics, pas un double-clic. */
const DOUBLE_CLIC = 400;

export function useManipulation(poste: PosteDeTravail) {
  const { projet, plancheCourante, indexPlanche, selection, setSelection, modifier, sceller } =
    poste;
  const { outil, setOutil } = poste;
  const geste = useRef<Geste | null>(null);
  const bouge = useRef(false);
  const dernierClic = useRef<{ id: string; le: number } | null>(null);
  /** L'élément dont le texte est ouvert à la saisie, en place. */
  const [edition, setEdition] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatManipulation>({
    rectangle: null,
    guides: [],
    geste: null,
  });

  const planche = plancheCourante?.type === "image" ? plancheCourante : null;
  const format = projet.format;

  const elements = useMemo(() => planche?.elements ?? [], [planche]);
  const choisis = useMemo(
    () => elements.filter((e) => selection.includes(e.id)),
    [elements, selection],
  );

  /** La boîte qui encadre la sélection — ce que les poignées entourent. */
  const cadre = useMemo(() => {
    if (choisis.length === 0) return null;
    if (choisis.length === 1) return enPixels(choisis[0]!, format);
    return englobante(choisis.map((e) => enPixels(e, format)));
  }, [choisis, format]);

  /** La rotation du cadre : celle de l'élément seul, aucune sur une sélection
   *  multiple — un cadre commun tourné n'aurait pas de sens. */
  const rotation = choisis.length === 1 ? choisis[0]!.rotation : 0;

  /** Remplace des éléments de la planche courante, dans une étape d'historique. */
  const remplacer = useCallback(
    (transforme: (e: Element) => Element, options: { libelle: string; fusion?: string }) => {
      modifier(
        (p: Projet) => {
          const courante = p.planches[indexPlanche];
          if (!courante || courante.type !== "image") return p;
          const planches = [...p.planches];
          planches[indexPlanche] = {
            ...courante,
            elements: courante.elements.map((e) => (selection.includes(e.id) ? transforme(e) : e)),
          } as PlancheImage;
          return avecPlanches(p, planches);
        },
        options,
      );
    },
    [modifier, indexPlanche, selection],
  );

  const cibles = useMemo(() => {
    if (!planche) return { x: [], y: [] };
    return ciblesDeLaPlanche(planche.elements, format, selection);
  }, [planche, format, selection]);

  /* ------------------------------------------------------------- les gestes */

  const surEnfoncement = useCallback(
    (p: Point, opts: { ajoute: boolean }) => {
      if (!planche) return;
      bouge.current = false;

      // UN OUTIL DE POSE PREND LA MAIN. Avec T, R ou L en main, un enfoncement
      // dessine la boîte de ce qu'on ajoute : ni poignée ni sélection ne s'y
      // interposent, sinon poser un texte par-dessus une photo serait
      // impossible.
      if (outil !== "V") {
        setEdition(null);
        setSelection([]);
        geste.current = { quoi: "poser", depart: p, outil };
        setEtat((s) => ({ ...s, geste: "poser" }));
        return;
      }

      // Une poignée d'abord : elle est SUR l'élément, et la viser doit
      // redimensionner, pas re-sélectionner.
      if (cadre) {
        const cle = poigneeSous(cadre, rotation, p, POIGNEE);
        if (cle === "rotation") {
          geste.current = {
            quoi: "tourner",
            centre: centreDe(cadre),
            angleInitial: angleVers(centreDe(cadre), p),
            rotations: new Map(choisis.map((e) => [e.id, e.rotation])),
          };
          setEtat((s) => ({ ...s, geste: "tourner" }));
          return;
        }
        if (cle) {
          geste.current = {
            quoi: "redimensionner",
            depart: p,
            poignee: cle,
            boites: new Map(choisis.map((e) => [e.id, enPixels(e, format)])),
          };
          setEtat((s) => ({ ...s, geste: "redimensionner" }));
          return;
        }
      }

      const vise = elementSous(planche.elements, p, format);
      if (!vise) {
        // Sur le fond : on trace un rectangle de sélection. Échap et un clic
        // simple désélectionnent.
        setEdition(null);
        if (!opts.ajoute) setSelection([]);
        geste.current = { quoi: "rectangle", depart: p };
        setEtat((s) => ({ ...s, geste: "rectangle" }));
        return;
      }

      // DOUBLE-CLIC : le caret entre dans l'image. Sur un texte seulement — les
      // autres éléments n'ont rien à saisir en place (une photo se recadre, ce
      // qui est un autre geste).
      const maintenant = Date.now();
      const precedent = dernierClic.current;
      dernierClic.current = { id: vise.id, le: maintenant };
      if (
        vise.type === "texte" &&
        !vise.verrouille &&
        precedent?.id === vise.id &&
        maintenant - precedent.le < DOUBLE_CLIC
      ) {
        setSelection([vise.id]);
        setEdition(vise.id);
        geste.current = null;
        setEtat((s) => ({ ...s, geste: null }));
        return;
      }
      if (edition !== null && edition !== vise.id) setEdition(null);

      const dejaPris = selection.includes(vise.id);
      // Prendre un membre prend son groupe : c'est ce que « grouper » veut dire.
      const brute = opts.ajoute
        ? dejaPris
          ? selection.filter((id) => id !== vise.id)
          : [...selection, vise.id]
        : dejaPris
          ? selection
          : [vise.id];
      const prochaine = etendreAuxGroupes(planche.elements, brute);
      setSelection(prochaine);

      // Un élément VERROUILLÉ se sélectionne mais ne se déplace pas : sinon on
      // ne pourrait jamais le déverrouiller au doigt.
      const mobiles = planche.elements.filter(
        (e) => prochaine.includes(e.id) && !e.verrouille,
      );
      if (mobiles.length === 0) return;
      geste.current = {
        quoi: "deplacer",
        depart: p,
        boites: new Map(mobiles.map((e) => [e.id, enPixels(e, format)])),
      };
      setEtat((s) => ({ ...s, geste: "deplacer" }));
    },
    [planche, cadre, rotation, choisis, format, selection, setSelection, edition, outil],
  );

  const surDeplacement = useCallback(
    (p: Point, mods: { maj: boolean; alt: boolean }) => {
      const g = geste.current;
      if (!g) return;

      if (g.quoi === "rectangle") {
        const rect: BoitePx = {
          x: Math.min(g.depart.x, p.x),
          y: Math.min(g.depart.y, p.y),
          l: Math.abs(p.x - g.depart.x),
          h: Math.abs(p.y - g.depart.y),
        };
        bouge.current = rect.l > SEUIL_GLISSE || rect.h > SEUIL_GLISSE;
        setEtat((s) => ({ ...s, rectangle: rect }));
        if (planche && bouge.current) {
          setSelection(
            etendreAuxGroupes(
              planche.elements,
              elementsDans(planche.elements, rect, format).map((e) => e.id),
            ),
          );
        }
        return;
      }

      if (g.quoi === "poser") {
        bouge.current = true;
        setEtat((s) => ({
          ...s,
          rectangle: {
            x: Math.min(g.depart.x, p.x),
            y: Math.min(g.depart.y, p.y),
            l: Math.abs(p.x - g.depart.x),
            h: Math.abs(p.y - g.depart.y),
          },
        }));
        return;
      }

      if (g.quoi === "tourner") {
        const brut = angleVers(g.centre, p) - g.angleInitial;
        const angle = mods.maj ? parPas(brut, PAS_ROTATION) : brut;
        bouge.current = true;
        remplacer((e) => ({ ...e, rotation: (g.rotations.get(e.id) ?? 0) + angle }), {
          libelle: "tourner",
          fusion: `tourner:${selection.join(",")}`,
        });
        return;
      }

      const dx = p.x - g.depart.x;
      const dy = p.y - g.depart.y;
      if (!bouge.current && Math.hypot(dx, dy) < SEUIL_GLISSE) return;
      bouge.current = true;

      if (g.quoi === "deplacer") {
        // Le magnétisme s'applique au CADRE de la sélection, puis le décalage
        // retenu est reporté sur chacun : coller chaque élément séparément les
        // écarterait les uns des autres.
        const premier = [...g.boites.values()];
        const ensemble = englobante(premier.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })));
        const colle = ensemble && !mods.alt ? aimanter(ensemble, cibles) : null;
        const ex = colle ? colle.boite.x - (ensemble!.x ?? 0) : 0;
        const ey = colle ? colle.boite.y - (ensemble!.y ?? 0) : 0;
        setEtat((s) => ({ ...s, guides: colle?.guides ?? [] }));
        remplacer(
          (e) => {
            const b = g.boites.get(e.id);
            if (!b) return e;
            return avecBoite(e, { ...b, x: b.x + dx + ex, y: b.y + dy + ey }, format);
          },
          { libelle: "déplacer", fusion: `deplacer:${selection.join(",")}` },
        );
        return;
      }

      // Redimensionner : le déplacement de la souris est ramené dans le repère
      // de l'élément. Sans ça, tirer le bord droit d'un texte incliné à 30°
      // l'agrandirait en diagonale.
      const local = rotation
        ? tourner({ x: dx, y: dy }, { x: 0, y: 0 }, -rotation)
        : { x: dx, y: dy };
      const coin = g.poignee.length === 2;
      remplacer(
        (e) => {
          const b = g.boites.get(e.id);
          if (!b) return e;
          return avecBoite(
            e,
            redimensionner(b, g.poignee, local.x, local.y, {
              proportionnel: coin !== mods.maj,
              depuisLeCentre: mods.alt,
            }),
            format,
          );
        },
        { libelle: "redimensionner", fusion: `redimensionner:${selection.join(",")}` },
      );
    },
    [planche, cibles, format, rotation, remplacer, selection, setSelection],
  );

  /**
   * LA BOÎTE D'UN ÉLÉMENT POSÉ À L'OUTIL.
   *
   * Un glissé donne la boîte tracée ; un simple clic donne une boîte par défaut
   * posée sous le curseur. Sans ce second cas, cliquer avec T en main ne
   * produirait qu'un texte de zéro pixel, invisible et introuvable.
   */
  const poserA = useCallback(
    (g: Extract<Geste, { quoi: "poser" }>, fin: Point) => {
      const f = formatDe(format);
      const l = Math.abs(fin.x - g.depart.x);
      const h = Math.abs(fin.y - g.depart.y);
      const trace = l > SEUIL_GLISSE && h > SEUIL_GLISSE;
      const parDefaut =
        g.outil === "T"
          ? { l: f.width * 0.6, h: f.width * 0.09 }
          : g.outil === "L"
            ? { l: f.width * 0.4, h: 10 }
            : { l: f.width * 0.3, h: f.width * 0.3 };
      const px = trace
        ? { x: Math.min(g.depart.x, fin.x), y: Math.min(g.depart.y, fin.y), l, h }
        : { x: g.depart.x, y: g.depart.y, ...parDefaut };
      const boite = enFractions(px, format);
      const neuf: Element =
        g.outil === "T"
          ? texteNeuf(boite, "Un titre", "titre")
          : g.outil === "L"
            ? formeNeuve(boite, { forme: "ligne", nom: "Ligne" })
            : formeNeuve(boite, { forme: "rectangle" });
      modifier((p: Projet) => avecAjouts(p, indexPlanche, [neuf]), {
        libelle: "poser un élément",
      });
      // L'outil ne colle pas à la main : on pose une chose, et on la règle.
      setOutil("V");
      queueMicrotask(() => setSelection([neuf.id]));
    },
    [format, modifier, indexPlanche, setOutil, setSelection],
  );

  const surRelachement = useCallback(
    (p?: Point) => {
      const g = geste.current;
      if (g?.quoi === "poser" && p) poserA(g, p);
      geste.current = null;
      bouge.current = false;
      setEtat({ rectangle: null, guides: [], geste: null });
      // Referme l'étape : la poussée suivante en ouvrira une neuve.
      sceller();
    },
    [sceller, poserA],
  );

  // Un élément qui disparaît de la planche (supprimé, autre planche) ou qui
  // quitte la sélection (choisi dans les calques) ne doit pas laisser un champ
  // de saisie flotter au-dessus d'un texte qu'on ne modifie plus.
  const enSaisie =
    edition !== null && selection.includes(edition)
      ? (elements.find((e): e is ElementTexte => e.id === edition && e.type === "texte") ?? null)
      : null;

  return {
    cadre,
    rotation,
    choisis,
    etat,
    outil,
    edition: enSaisie,
    ouvrirSaisie: setEdition,
    fermerSaisie: useCallback(() => setEdition(null), []),
    surEnfoncement,
    surDeplacement,
    surRelachement,
  };
}
