"use client";

// components/Survol.tsx
//
// LE SURVOL : la séance rejouée sur le relief, et son habillage par-dessus.
//
// TROIS COUCHES, dans cet ordre : la scène 3D (WebGL, MapLibre), le HUD (le
// même canvas 2D et les mêmes éléments qu'une planche image), et les repères
// d'atelier. Elles ne se mélangent jamais — c'est ce qui permet de composer
// l'habillage exactement comme une planche, et de l'exporter identique.
//
// L'APERÇU LIT LE MÊME PLAN QUE L'EXPORT. Le montage donne une liste d'images
// — un index de point de séance par image —, et la lecture ne fait qu'avancer
// dedans à cadence fixe. Une lecture qui interpolerait sur l'horloge donnerait
// autre chose que la vidéo, et on validerait un aperçu qu'on ne recevrait pas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, SkipBack, X } from "lucide-react";
import type maplibregl from "maplibre-gl";
import {
  contexteDuHud,
  dessinerAvecCadre,
  formatDe,
  planDeSurvol,
  prisesDuPlan,
  themeDe,
  type PlancheSurvol,
  type Projet,
} from "@locomotionlab/planche";
import { decouperTrace } from "@locomotionlab/trace";

import { policeChargee, policeDuLabo } from "@/lib/police";
import { imagesEnCache } from "@/lib/images";
import { cadrer, monterScene, poserLaTrace, poserLePoint } from "@/lib/scene";
import { exporterSurvol } from "@/lib/exportSurvol";
import { enNomDeFichier, telecharger } from "@/lib/export";
import type { Avancement } from "@/lib/video";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

/** L'air autour de la scène, comme pour une planche. */
const RESPIRATION = 32;

export default function Survol({
  poste,
  planche,
}: {
  poste: PosteDeTravail;
  planche: PlancheSurvol;
}) {
  const { projet } = poste;
  const cadre = useRef<HTMLDivElement | null>(null);
  const boite = useRef<HTMLDivElement | null>(null);
  const hud = useRef<HTMLCanvasElement | null>(null);
  const carte = useRef<maplibregl.Map | null>(null);
  const [ajuste, setAjuste] = useState(0.3);
  const [prete, setPrete] = useState(false);
  const [image, setImage] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  // Incrémenté à chaque montage de scène : c'est ce qui fait reposer la trace
  // et la caméra sur la carte NEUVE. Sans lui, changer de fond laisserait une
  // scène vide, la carte vivant dans une ref que nul effet ne surveille.
  const [scenePrete, setScenePrete] = useState(0);
  const [avancement, setAvancement] = useState<Avancement | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const annuler = useRef(false);

  const format = formatDe(projet.format);
  const theme = themeDe(projet.theme);
  const seance = projet.donnees.seance;

  // LE PLAN, calculé une fois : la lecture et l'export y puisent tous deux.
  const plan = useMemo(
    () => planDeSurvol(seance, planche.montage),
    [seance, planche.montage],
  );
  const prises = useMemo(
    () => prisesDuPlan(seance, plan.images, planche.camera, plan.imagesParSeconde),
    [seance, plan.images, plan.imagesParSeconde, planche.camera],
  );
  const total = plan.images.length;

  const coords = useMemo(
    () => projet.donnees.trace?.coords ?? [],
    [projet.donnees.trace],
  );

  useEffect(() => {
    let vivant = true;
    policeChargee().then(() => vivant && setPrete(true));
    const img = new Image();
    img.src = "/images/assets/logo-mark-512.png";
    img.decode().then(() => vivant && setLogo(img), () => {});
    return () => {
      vivant = false;
    };
  }, []);

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

  // LA SCÈNE est montée une fois par réglage de fond : changer d'imagerie
  // change le style, et MapLibre veut alors une carte neuve.
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const scene = monterScene(el, planche.scene, planche.camera.exageration);
    carte.current = scene.carte;
    scene.carte.once("load", () => setScenePrete((n) => n + 1));

    // LA CARTE DOIT SUIVRE SON CONTENEUR. Elle est montée avant que le plan de
    // travail ait été mesuré : sans cet observateur, le canvas WebGL garde la
    // taille qu'il avait à la naissance — ici 324 × 405 dans une boîte de
    // 591 × 739 — et la scène est cadrée de travers, tuiles comprises.
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => scene.carte.resize());
    ro?.observe(el);

    return () => {
      ro?.disconnect();
      carte.current = null;
      scene.detruire();
    };
  }, [planche.scene, planche.camera.exageration]);

  // La trace et le point suivent l'image courante.
  useEffect(() => {
    const c = carte.current;
    const prise = prises[image];
    if (!c || !prise) return;
    const appliquer = () => {
      poserLaTrace(c, coords, Math.round((plan.avancement[image] ?? 0) * (coords.length - 1)));
      poserLePoint(c, prise.lng, prise.lat);
      cadrer(c, prise);
    };
    if (c.isStyleLoaded()) appliquer();
    else c.once("load", appliquer);
  }, [image, prises, coords, plan.avancement, scenePrete]);

  // LA LECTURE avance dans le plan à la cadence du montage — pas à celle de
  // l'écran. Un moniteur à 120 Hz ne doit pas jouer la vidéo deux fois trop vite.
  useEffect(() => {
    if (!lecture || total === 0) return;
    const periode = 1000 / plan.imagesParSeconde;
    const minuteur = setInterval(() => {
      setImage((i) => {
        if (i + 1 >= total) {
          setLecture(false);
          return i;
        }
        return i + 1;
      });
    }, periode);
    return () => clearInterval(minuteur);
  }, [lecture, total, plan.imagesParSeconde]);

  // LE HUD : le même rendu que n'importe quelle planche, sur un canvas
  // transparent posé au-dessus de la scène.
  useEffect(() => {
    const ctx = hud.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, format.width, format.height);
    const index = plan.images[image] ?? 0;
    const { contexte, elements } = contexteDuHud(projet, planche, seance?.points[index] ?? null, {
      police: policeDuLabo(),
      logo,
      segments: decouperTrace(projet.donnees.trace, projet.donnees.coupures),
      images: imagesEnCache(),
    });
    for (const e of elements) dessinerAvecCadre(ctx, e, contexte);
  }, [projet, planche, image, plan.images, logo, prete, format.width, format.height, seance]);

  const echelle = ajuste;
  const secondes = total > 0 ? (image / plan.imagesParSeconde).toFixed(1) : "0.0";

  async function exporter() {
    const c = carte.current;
    const el = boite.current;
    if (!c || !el) return;
    setSouci(null);
    annuler.current = false;
    setLecture(false);
    setAvancement({ image: 0, total, restantMs: null });
    try {
      const r = await exporterSurvol(projet, planche, c, el, {
        nom: enNomDeFichier(projet.nom, "projet"),
        surAvancement: setAvancement,
        annule: () => annuler.current,
      });
      if (r) telecharger(r.blob, r.nom);
    } catch (e) {
      setSouci(
        e instanceof Error
          ? `L'export a échoué : ${e.message}`
          : "L'export a échoué.",
      );
    } finally {
      setAvancement(null);
    }
  }

  if (!seance) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-brand-text/5 px-8">
        <p className="max-w-sm text-center text-[13px] leading-relaxed text-brand-soft">
          Charge une séance — un GPX de montre — dans le tiroir Données, et le survol la
          rejouera sur le relief.
        </p>
      </div>
    );
  }

  return (
    <div ref={cadre} className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-brand-text/5">
      <div
        className="relative shadow-card"
        style={{ width: format.width * echelle, height: format.height * echelle }}
      >
        {/* La scène est en pixels d'ÉCRAN : WebGL rendrait un canvas de 1080 ×
            1920 à l'échelle 1 même réduit en CSS, pour rien. L'export, lui,
            redimensionne la scène à la taille de sortie. */}
        <div ref={boite} className="absolute inset-0 overflow-hidden" />
        <canvas
          ref={hud}
          width={format.width}
          height={format.height}
          aria-label="Habillage du survol"
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />
      </div>

      <div className="mt-3 flex w-full max-w-2xl shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={() => setLecture((l) => !l)}
          aria-label={lecture ? "Pause" : "Lecture"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-brand-field text-brand-soft transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
        >
          {lecture ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => {
            setLecture(false);
            setImage(0);
          }}
          aria-label="Revenir au début"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-brand-field text-brand-soft transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
        >
          <SkipBack size={16} aria-hidden />
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={image}
          onChange={(e) => {
            setLecture(false);
            setImage(Number(e.target.value));
          }}
          aria-label="Position dans le survol"
          className="h-9 flex-1 accent-brand-primary-dark"
        />
        <span className="tabulaire w-24 shrink-0 text-right text-[12px] text-brand-muted">
          {secondes} s / {planche.montage.duree} s
        </span>
        <button
          type="button"
          onClick={exporter}
          disabled={avancement !== null}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand-deep px-3 text-[13px] font-medium text-brand-bg transition-colors hover:bg-brand-deep-dark disabled:opacity-40 motion-reduce:transition-none"
        >
          <Download size={15} aria-hidden />
          Vidéo
        </button>
      </div>

      {souci && (
        <p role="alert" className="mt-2 px-4 text-[12px] text-brand-accent-ink">
          {souci}
        </p>
      )}

      {avancement && (
        <div
          role="dialog"
          aria-label="Export du survol"
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-brand-text/60 px-8"
        >
          <p className="tabulaire text-[13px] text-brand-bg">
            Image {avancement.image} / {avancement.total}
            {avancement.restantMs !== null &&
              ` · environ ${Math.ceil(avancement.restantMs / 1000)} s`}
          </p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-brand-bg/25">
            <div
              className="h-full bg-brand-accent transition-[width] motion-reduce:transition-none"
              style={{ width: `${(avancement.image / Math.max(1, avancement.total)) * 100}%` }}
            />
          </div>
          <p className="max-w-xs text-center text-[11px] leading-snug text-brand-bg/70">
            Chaque image attend ses tuiles : c&rsquo;est ce qui rend la vidéo identique
            partout. Laisse cet onglet au premier plan — une scène 3D ne se dessine pas en
            arrière-plan.
          </p>
          <button
            type="button"
            onClick={() => {
              annuler.current = true;
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-brand-bg/40 px-3 text-[13px] text-brand-bg"
          >
            <X size={15} aria-hidden />
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
