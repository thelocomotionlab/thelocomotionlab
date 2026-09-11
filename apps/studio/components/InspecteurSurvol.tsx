"use client";

// components/InspecteurSurvol.tsx
//
// LES RÉGLAGES D'UN SURVOL : la scène, la caméra, le montage.
//
// Trois familles, et pas une de plus. La SCÈNE dit ce qu'on voit dessous ; la
// CAMÉRA, d'où on le regarde ; le MONTAGE, à quel rythme. C'est la seule
// découpe qui tienne, parce qu'on ne règle jamais les trois pour la même
// raison : on change de fond pour la lisibilité, de caméra pour le vertige, de
// montage pour la durée d'une story.
//
// TOUT SE VOIT AUSSITÔT. Chaque réglage passe par l'historique et rejoue la
// scène — il n'y a pas d'aperçu à demander, l'aperçu EST la scène.

import type { Camera, Montage, PlancheSurvol, Projet, Scene } from "@locomotionlab/planche";
import { imagesDuMontage } from "@locomotionlab/planche";

import { avecPlanches } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

const FONDS: { cle: Scene["fond"]; label: string }[] = [
  { cle: "satellite", label: "Satellite" },
  { cle: "relief", label: "Relief" },
  { cle: "topo", label: "Topo" },
  { cle: "aucun", label: "Aucun" },
];

const MODES: { cle: Camera["mode"]; label: string; aide: string }[] = [
  { cle: "suivre", label: "Suivre", aide: "Derrière le point, dans le sens de la marche." },
  { cle: "orbite", label: "Orbite", aide: "La caméra tourne autour du point." },
  { cle: "ensemble", label: "Ensemble", aide: "Tout l'itinéraire, vu de haut." },
];

const DUREES = [15, 30, 60, 90];

export default function InspecteurSurvol({
  poste,
  planche,
}: {
  poste: PosteDeTravail;
  planche: PlancheSurvol;
}) {
  const { indexPlanche, modifier } = poste;

  /** Remplace la planche de survol dans une étape d'historique. */
  function regler(part: Partial<PlancheSurvol>, libelle: string, fusion?: string) {
    modifier(
      (p: Projet) => {
        const planches = [...p.planches];
        const courante = planches[indexPlanche];
        if (!courante || courante.type !== "survol") return p;
        planches[indexPlanche] = { ...courante, ...part };
        return avecPlanches(p, planches);
      },
      { libelle, fusion },
    );
  }

  const surScene = (part: Partial<Scene>, libelle: string, fusion?: string) =>
    regler({ scene: { ...planche.scene, ...part } }, libelle, fusion);
  const surCamera = (part: Partial<Camera>, libelle: string, fusion?: string) =>
    regler({ camera: { ...planche.camera, ...part } }, libelle, fusion);
  const surMontage = (part: Partial<Montage>, libelle: string, fusion?: string) =>
    regler({ montage: { ...planche.montage, ...part } }, libelle, fusion);

  return (
    <aside
      aria-label="Inspecteur"
      className="flex w-[296px] shrink-0 flex-col overflow-y-auto border-l border-brand-field bg-brand-paper"
    >
      <Section titre="Scène">
        <Choix
          options={FONDS.map((f) => ({ cle: f.cle, label: f.label }))}
          valeur={planche.scene.fond}
          onChange={(v) => surScene({ fond: v as Scene["fond"] }, "changer le fond")}
        />
        <Bascule
          libelle="Ciel et brume"
          actif={planche.scene.ciel}
          onChange={(v) => surScene({ ciel: v }, "le ciel")}
        />
        <Curseur
          libelle="Épaisseur de la trace"
          valeur={planche.scene.epaisseur}
          min={2}
          max={16}
          onChange={(n) => surScene({ epaisseur: n }, "épaisseur", "survol:epaisseur")}
        />
        <p className="mt-1 text-[11px] leading-snug text-brand-muted">
          « Aucun » ne garde que le relief et la trace — la silhouette du terrain, sans
          photo aérienne.
        </p>
      </Section>

      <Section titre="Caméra">
        <Choix
          options={MODES.map((m) => ({ cle: m.cle, label: m.label }))}
          valeur={planche.camera.mode}
          onChange={(v) => surCamera({ mode: v as Camera["mode"] }, "mode de caméra")}
        />
        <p className="mb-2 text-[11px] leading-snug text-brand-muted">
          {MODES.find((m) => m.cle === planche.camera.mode)?.aide}
        </p>
        <Curseur
          libelle="Inclinaison"
          valeur={planche.camera.pitch}
          min={0}
          max={80}
          suffixe="°"
          onChange={(n) => surCamera({ pitch: n }, "inclinaison", "survol:pitch")}
        />
        <Curseur
          libelle="Relief"
          valeur={planche.camera.exageration}
          min={1}
          max={2}
          pas={0.1}
          suffixe="×"
          onChange={(n) => surCamera({ exageration: n }, "relief", "survol:relief")}
        />
        <Curseur
          libelle="Douceur du cap"
          valeur={planche.camera.douceur}
          min={0.5}
          max={12}
          pas={0.5}
          suffixe=" s"
          onChange={(n) => surCamera({ douceur: n }, "douceur", "survol:douceur")}
        />
        <Curseur
          libelle="Rotation maximale"
          valeur={planche.camera.rotationMax}
          min={5}
          max={90}
          suffixe=" °/s"
          onChange={(n) => surCamera({ rotationMax: n }, "rotation", "survol:rotation")}
        />
        <Bascule
          libelle="Zoom automatique"
          actif={planche.camera.zoomAuto}
          onChange={(v) => surCamera({ zoomAuto: v }, "zoom automatique")}
        />
        <Curseur
          libelle="Zoom"
          valeur={planche.camera.zoom}
          min={9}
          max={18}
          pas={0.5}
          onChange={(n) => surCamera({ zoom: n }, "zoom", "survol:zoom")}
        />
        <p className="mt-1 text-[11px] leading-snug text-brand-muted">
          La douceur lisse le cap sur ce nombre de secondes, et la rotation ne dépasse
          jamais son plafond : c&rsquo;est ce qui évite que la vidéo secoue dans les lacets.
        </p>
      </Section>

      <Section titre="Montage">
        <div className="mb-2 flex gap-1">
          {DUREES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => surMontage({ duree: d }, "durée")}
              aria-pressed={planche.montage.duree === d}
              className={`flex-1 rounded-md border px-1.5 py-1 text-[12px] transition-colors motion-reduce:transition-none ${
                planche.montage.duree === d
                  ? "border-brand-primary-dark bg-brand-primary/12"
                  : "border-brand-field text-brand-soft hover:bg-brand-primary/8"
              }`}
            >
              {d} s
            </button>
          ))}
        </div>
        <Choix
          options={[
            { cle: "distance", label: "À la distance" },
            { cle: "temps", label: "Au temps" },
          ]}
          valeur={planche.montage.vitesse}
          onChange={(v) => surMontage({ vitesse: v as Montage["vitesse"] }, "vitesse")}
        />
        <Curseur
          libelle="Mélange"
          valeur={planche.montage.melange}
          min={0}
          max={1}
          pas={0.05}
          onChange={(n) => surMontage({ melange: n }, "mélange", "survol:melange")}
        />
        <Bascule
          libelle="Retirer les pauses"
          actif={planche.montage.retirerPauses}
          onChange={(v) => surMontage({ retirerPauses: v }, "les pauses")}
        />
        <Curseur
          libelle="Tenue au départ"
          valeur={planche.montage.tenueDepart}
          min={0}
          max={5}
          pas={0.5}
          suffixe=" s"
          onChange={(n) => surMontage({ tenueDepart: n }, "tenue", "survol:tenue1")}
        />
        <Curseur
          libelle="Tenue à l'arrivée"
          valeur={planche.montage.tenueArrivee}
          min={0}
          max={5}
          pas={0.5}
          suffixe=" s"
          onChange={(n) => surMontage({ tenueArrivee: n }, "tenue", "survol:tenue2")}
        />
        <p className="mt-1 text-[11px] leading-snug text-brand-muted">
          {imagesDuMontage(planche.montage)} images à {planche.montage.imagesParSeconde} par
          seconde. « À la distance », le point avance d&rsquo;un pas régulier ; « au temps »,
          il ralentit dans les montées, comme ce jour-là.
        </p>
      </Section>
    </aside>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-brand-hairline px-3.5 py-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
        {titre}
      </h3>
      {children}
    </section>
  );
}

function Choix({
  options,
  valeur,
  onChange,
}: {
  options: { cle: string; label: string }[];
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.cle}
          type="button"
          onClick={() => onChange(o.cle)}
          aria-pressed={valeur === o.cle}
          className={`flex-1 rounded-md border px-1.5 py-1 text-[12px] transition-colors motion-reduce:transition-none ${
            valeur === o.cle
              ? "border-brand-primary-dark bg-brand-primary/12"
              : "border-brand-field text-brand-soft hover:bg-brand-primary/8"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Bascule({
  libelle,
  actif,
  onChange,
}: {
  libelle: string;
  actif: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-[12px] text-brand-soft">
      <input
        type="checkbox"
        checked={actif}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brand-primary-dark"
      />
      {libelle}
    </label>
  );
}

function Curseur({
  libelle,
  valeur,
  min,
  max,
  pas = 1,
  suffixe = "",
  onChange,
}: {
  libelle: string;
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  suffixe?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mb-2 block">
      <span className="mb-0.5 flex items-baseline justify-between text-[12px] text-brand-soft">
        {libelle}
        <span className="tabulaire text-brand-muted">
          {valeur}
          {suffixe}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-brand-primary-dark"
      />
    </label>
  );
}
