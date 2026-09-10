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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MARGE,
  besoinsDeFond,
  enPixels,
  etendueDeLaPhoto,
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

/**
 * L'air laissé autour de la planche quand elle s'ajuste à la fenêtre.
 *
 * Généreux sur un écran d'ordinateur, presque nul sur un téléphone : là, un
 * liseré de 48 px de chaque côté mangerait le quart de la planche.
 */
function respiration(largeur: number): number {
  return largeur < 640 ? 8 : 48;
}

export default function PlanDeTravail({
  poste,
  avecBarre = true,
}: {
  poste: PosteDeTravail;
  /** La barre contextuelle : sur téléphone, ce sont les chips du bas. */
  avecBarre?: boolean;
}) {
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
  /** Les doigts posés, en pixels d'écran : c'est ce que le pincement mesure. */
  const doigts = useRef(new Map<number, { x: number; y: number }>());
  const pincement = useRef<{ ecart: number; milieu: { x: number; y: number }; zoom: number; vue: { x: number; y: number } } | null>(null);

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
    const air = respiration(el.clientWidth);
    setAjuste(
      Math.max(
        0.05,
        Math.min(
          (el.clientWidth - air * 2) / format.width,
          (el.clientHeight - air * 2) / format.height,
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
  const curseur = manip.recadrage
    ? "move"
    : espace
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

  /**
   * Ce qu'il faut au chrome pour dessiner un recadrage : la photo, son cadre,
   * et l'étendue qu'occuperait l'image entière à la même échelle.
   */
  // La SOURCE se lit à chaque rendu : elle vient d'un cache impératif que
  // nulle liste de dépendances ne sait surveiller, et c'est le rendu déclenché
  // par l'arrivée d'une image qui la fait apparaître.
  const photoRecadree = manip.recadrage;
  const source =
    photoRecadree?.type === "photo" && photoRecadree.mediaId
      ? (imagesEnCache().get(photoRecadree.mediaId) ?? null)
      : null;
  const aRecadrer = useMemo(() => {
    if (!source || photoRecadree?.type !== "photo") return null;
    const cadre = enPixels(photoRecadree, projet.format);
    const etendue = etendueDeLaPhoto(source, cadre, photoRecadree.cadrage);
    return etendue ? { source, cadre, etendue } : null;
  }, [source, photoRecadree, projet.format]);

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
      recadrage: aRecadrer,
    });
  }, [
    format,
    theme,
    echelle,
    manip.cadre,
    manip.rotation,
    manip.choisis,
    manip.etat,
    projet.format,
    aRecadrer,
  ]);

  /**
   * L'ÉCART ET LE MILIEU DE DEUX DOIGTS.
   *
   * Le rapport des écarts donne le facteur de zoom, le déplacement du milieu
   * donne celui de la vue : un seul geste fait les deux, comme partout.
   */
  const pince = useCallback(() => {
    const [a, b] = [...doigts.current.values()];
    if (!a || !b) return null;
    return {
      ecart: Math.hypot(b.x - a.x, b.y - a.y),
      milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }, []);

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
      className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-brand-text/5"
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
            doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (doigts.current.size === 2) {
              // Le second doigt ANNULE ce que le premier avait commencé : on
              // pince pour regarder, pas pour déplacer un élément par mégarde.
              manip.surRelachement();
              const p2 = pince();
              if (p2) pincement.current = { ...p2, zoom: echelle, vue };
              return;
            }
            // Espace ou bouton du milieu : on déplace la VUE, pas la planche.
            if (espace || e.button === 1) {
              panoramique.current = { x: e.clientX - vue.x, y: e.clientY - vue.y };
              return;
            }
            manip.surEnfoncement(pointDe(e), { ajoute: e.shiftKey });
          }}
          onPointerMove={(e) => {
            if (doigts.current.has(e.pointerId)) {
              doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }
            const deux = pincement.current;
            if (deux) {
              const p2 = pince();
              if (!p2 || deux.ecart <= 0) return;
              poste.setZoom(Math.max(0.05, Math.min(4, deux.zoom * (p2.ecart / deux.ecart))));
              setVue({
                x: deux.vue.x + (p2.milieu.x - deux.milieu.x),
                y: deux.vue.y + (p2.milieu.y - deux.milieu.y),
              });
              return;
            }
            const depart = panoramique.current;
            if (depart) {
              setVue({ x: e.clientX - depart.x, y: e.clientY - depart.y });
              return;
            }
            manip.surDeplacement(pointDe(e), { maj: e.shiftKey, alt: e.altKey });
          }}
          onPointerUp={(e) => {
            doigts.current.delete(e.pointerId);
            if (doigts.current.size < 2) pincement.current = null;
            if (panoramique.current) {
              panoramique.current = null;
              return;
            }
            manip.surRelachement(pointDe(e));
          }}
          onPointerCancel={(e) => {
            doigts.current.delete(e.pointerId);
            if (doigts.current.size < 2) pincement.current = null;
            panoramique.current = null;
            manip.surRelachement();
          }}
          onWheel={(e) => {
            // La molette n'appartient à la planche QUE pendant un recadrage.
            // Ailleurs, elle reste au navigateur.
            if (!manip.recadrage) return;
            e.preventDefault();
            manip.surMolette(e.deltaY);
          }}
        />
        {/* La barre ne paraît QUE sur sélection, et jamais pendant qu'on est
            ENTRÉ dans un élément — saisie ou recadrage : elle recouvrirait ce
            qu'on est justement en train de régler. */}
        {avecBarre && manip.cadre && manip.choisis.length > 0 && !enSaisie && !manip.recadrage && (
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
