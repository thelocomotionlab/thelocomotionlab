"use client";

// components/PlanDeTravail.tsx
//
// LE PLAN DE TRAVAIL : la planche, posée sur un fond neutre.
//
// L'APERÇU EST L'IMAGE FINALE. Le canvas est dimensionné en PIXELS DE SORTIE
// (1080 × 1350, 1080 × 1920, 1080 × 1080) et seulement réduit en CSS. Ce qu'on
// voit est ce qu'on exporte, au pixel près — c'est ce qui rend la manipulation
// directe honnête : une poignée déplacera vraiment le pixel qu'elle montre.
//
// LES REPÈRES D'ATELIER SONT SUR UN SECOND CANVAS, par-dessus. Marges de la
// charte et zone sûre d'Instagram ne partent pas sur le réseau : les dessiner
// dans le même canvas que la planche les enverrait à l'export.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MARGE,
  besoinsDeFond,
  enPixels,
  contexteDeRendu,
  dessinerPlanche,
  formatDe,
  themeDe,
  type Projet,
  type SourceImage,
} from "@locomotionlab/planche";
import { decouperTrace } from "@locomotionlab/trace";

import { policeChargee, policeDuLabo } from "@/lib/police";
import { completerLesFonds, fondsEnCache } from "@/lib/tuiles";
import { completerLesImages, imagesEnCache, poser } from "@/lib/images";
import { importer } from "@/lib/medias";
import { dessinerChrome, dessinerReperes } from "@/lib/chrome";
import { useManipulation } from "@/lib/useManipulation";
import BarreContextuelle from "./BarreContextuelle";
import SaisieEnPlace from "./SaisieEnPlace";
import { avecDoublons, avecOrdre, sansSelection, surSelection } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** L'air laissé autour de la planche quand elle s'ajuste à la fenêtre. */
const RESPIRATION = 48;

export default function PlanDeTravail({ poste }: { poste: PosteDeTravail }) {
  const projet: Projet = poste.projet;
  const { indexPlanche, zoom, vue, setVue } = poste;
  const manip = useManipulation(poste);
  const cadre = useRef<HTMLDivElement | null>(null);
  const planche = useRef<HTMLCanvasElement | null>(null);
  const reperes = useRef<HTMLCanvasElement | null>(null);
  const [ajuste, setAjuste] = useState(0.3);
  const [prete, setPrete] = useState(false);
  const [logo, setLogo] = useState<SourceImage | null>(null);
  // Incrémenté quand une mosaïque arrive : le rendu se rejoue avec le terrain.
  const [fondsVenus, setFondsVenus] = useState(0);
  const [espace, setEspace] = useState(false);
  const panoramique = useRef<{ x: number; y: number } | null>(null);

  const format = formatDe(projet.format);
  const theme = themeDe(projet.theme);

  // La fonte d'abord : sans elle, la première planche se mesure sur la police
  // de secours, les lignes se coupent ailleurs, et tout se décale à l'arrivée
  // d'Ubuntu.
  useEffect(() => {
    let vivant = true;
    policeChargee().then(() => vivant && setPrete(true));
    const img = new Image();
    img.src = "/images/assets/logo-mark-512.png";
    img.decode().then(
      () => vivant && setLogo(img),
      () => {},
    );
    return () => {
      vivant = false;
    };
  }, []);

  // « Ajuster » se recalcule à chaque changement de taille du plan de travail :
  // replier le tiroir doit agrandir la planche, pas laisser un blanc.
  const mesurer = useCallback(() => {
    const el = cadre.current;
    if (!el) return;
    setAjuste(
      Math.max(
        0.05,
        Math.min(
          (el.clientWidth - RESPIRATION * 2) / format.width,
          (el.clientHeight - RESPIRATION * 2) / format.height,
        ),
      ),
    );
  }, [format.width, format.height]);

  useEffect(() => {
    mesurer();
    const el = cadre.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer]);

  // ESPACE + GLISSÉ déplace la vue. La barre d'espace ne fait rien d'autre dans
  // le studio, et c'est le geste que toute la profession connaît.
  useEffect(() => {
    const bas = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible?.tagName ?? "")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setEspace(true);
      }
    };
    const haut = (e: KeyboardEvent) => e.code === "Space" && setEspace(false);
    window.addEventListener("keydown", bas);
    window.addEventListener("keyup", haut);
    return () => {
      window.removeEventListener("keydown", bas);
      window.removeEventListener("keyup", haut);
    };
  }, []);

  const echelle = zoom ?? ajuste;
  const courante = projet.planches[indexPlanche] ?? null;
  const enSaisie = manip.edition;
  const curseur = espace
    ? "grab"
    : poste.outil !== "V"
      ? "crosshair"
      : manip.etat.geste === "deplacer" || manip.etat.geste === "tourner"
        ? "grabbing"
        : "default";

  useEffect(() => {
    const ctx = planche.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, format.width, format.height);
    if (!courante || courante.type !== "image") {
      ctx.fillStyle = theme.fond;
      ctx.fillRect(0, 0, format.width, format.height);
      return;
    }
    // L'élément en cours de saisie est retiré du rendu : le champ posé au pixel
    // le remplace. Le garder dessous doublerait le texte, décalé d'un cheveu.
    const aDessiner = manip.edition
      ? {
          ...courante,
          elements: courante.elements.map((e) =>
            e.id === manip.edition?.id ? { ...e, masque: true } : e,
          ),
        }
      : courante;
    const c = contexteDeRendu(projet, aDessiner, {
      police: policeDuLabo(),
      logo,
      segments: decouperTrace(projet.donnees.trace, projet.donnees.coupures),
      fonds: fondsEnCache(),
      images: imagesEnCache(),
    });
    dessinerPlanche(ctx, aDessiner, c);

    // La planche est déjà à l'écran, sur son aplat : les tuiles la complètent
    // quand elles arrivent. L'inverse — attendre le réseau pour dessiner —
    // rendrait le studio inutilisable au bivouac.
    let vivant = true;
    const manquantes = aDessiner.elements.flatMap((e) =>
      e.type === "photo" && e.mediaId ? [e.mediaId] : [],
    );
    Promise.all([
      completerLesFonds(besoinsDeFond(courante, c)),
      completerLesImages(manquantes),
    ]).then(([fond, image]) => {
      if ((fond || image) && vivant) setFondsVenus((n) => n + 1);
    });
    return () => {
      vivant = false;
    };
  }, [projet, courante, format, theme, logo, prete, fondsVenus, manip.edition]);

  useEffect(() => {
    const ctx = reperes.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, format.width, format.height);
    dessinerReperes(ctx, format.width, format.height, MARGE, format.zoneSure, theme, echelle);
    dessinerChrome(ctx, format.width, format.height, {
      zoom: echelle,
      cadre: manip.cadre,
      rotation: manip.rotation,
      membres: manip.choisis.map((e) => enPixels(e, projet.format)),
      guides: manip.etat.guides,
      rectangle: manip.etat.rectangle,
      verrouille: manip.choisis.length === 1 && manip.choisis[0]!.verrouille,
    });
  }, [format, theme, echelle, manip.cadre, manip.rotation, manip.choisis, manip.etat, projet.format]);

  /** Le point sous le curseur, en pixels de PLANCHE — jamais en pixels d'écran. */
  const pointDe = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = reperes.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (e.clientX - r.left) / echelle, y: (e.clientY - r.top) / echelle };
    },
    [echelle],
  );

  return (
    <div
      ref={cadre}
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-brand-text/5"
    >
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={async (e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          // Le point du lâcher décide de la place : on pose la photo LÀ, sous le
          // curseur, plutôt qu'au centre d'une planche qu'on ne regardait pas.
          const p = pointDe(e);
          for (const fichier of e.dataTransfer.files) {
            const r = await importer(fichier);
            if (!r) continue;
            poser(r.media.id, r.image);
            poste.poserPhotoA(r.media, p);
          }
        }}
        className="relative shadow-card"
        style={{
          width: format.width * echelle,
          height: format.height * echelle,
          transform: vue.x || vue.y ? `translate(${vue.x}px, ${vue.y}px)` : undefined,
        }}
      >
        <canvas
          ref={planche}
          width={format.width}
          height={format.height}
          aria-label={`Planche ${format.label}`}
          className="block h-full w-full"
        />
        <canvas
          ref={reperes}
          width={format.width}
          height={format.height}
          aria-hidden
          className="absolute inset-0 block h-full w-full touch-none"
          style={{ cursor: curseur }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            // Espace ou bouton du milieu : on déplace la VUE, pas la planche.
            if (espace || e.button === 1) {
              panoramique.current = { x: e.clientX - vue.x, y: e.clientY - vue.y };
              return;
            }
            manip.surEnfoncement(pointDe(e), { ajoute: e.shiftKey });
          }}
          onPointerMove={(e) => {
            const depart = panoramique.current;
            if (depart) {
              setVue({ x: e.clientX - depart.x, y: e.clientY - depart.y });
              return;
            }
            manip.surDeplacement(pointDe(e), { maj: e.shiftKey, alt: e.altKey });
          }}
          onPointerUp={(e) => {
            if (panoramique.current) {
              panoramique.current = null;
              return;
            }
            manip.surRelachement(pointDe(e));
          }}
          onPointerCancel={() => {
            panoramique.current = null;
            manip.surRelachement();
          }}
        />
        {/* La barre ne paraît QUE sur sélection, et jamais pendant la saisie :
            elle recouvrirait le texte qu'on est en train d'écrire. */}
        {manip.cadre && manip.choisis.length > 0 && !enSaisie && (
          <BarreContextuelle
            choisis={manip.choisis}
            cadre={manip.cadre}
            echelle={echelle}
            theme={theme}
            onRegler={(transforme, libelle) =>
              poste.modifier(
                (p) => surSelection(p, indexPlanche, poste.selection, transforme),
                { libelle },
              )
            }
            onDupliquer={() => {
              let neufs: string[] = [];
              poste.modifier(
                (p) => {
                  const r = avecDoublons(p, indexPlanche, poste.selection);
                  neufs = r.nouveaux;
                  return r.projet;
                },
                { libelle: "dupliquer" },
              );
              queueMicrotask(() => neufs.length > 0 && poste.setSelection(neufs));
            }}
            onSupprimer={() => {
              poste.modifier((p) => sansSelection(p, indexPlanche, poste.selection), {
                libelle: "supprimer",
              });
              poste.setSelection([]);
            }}
            onOrdre={(vers) =>
              poste.modifier(
                (p) =>
                  poste.selection.reduce((acc, id) => avecOrdre(acc, indexPlanche, id, vers), p),
                { libelle: vers === "devant" ? "passer devant" : "passer derrière" },
              )
            }
          />
        )}

        {enSaisie && (
          <SaisieEnPlace
            key={enSaisie.id}
            element={enSaisie}
            projet={projet}
            echelle={echelle}
            onChange={(contenu) =>
              poste.modifier(
                (p) =>
                  surSelection(p, indexPlanche, [enSaisie.id], (x) =>
                    x.type === "texte" ? { ...x, contenu } : x,
                  ),
                { libelle: "écrire", fusion: `contenu:${enSaisie.id}` },
              )
            }
            onFermer={() => {
              manip.fermerSaisie();
              poste.sceller();
            }}
            onAnnuler={poste.annuler}
            onRefaire={poste.refaire}
          />
        )}
      </div>

      <p className="tabulaire pointer-events-none absolute bottom-2 right-3 text-[11px] text-brand-muted">
        {format.width} × {format.height} · {Math.round(echelle * 100)} %
      </p>
    </div>
  );
}
