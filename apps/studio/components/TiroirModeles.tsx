"use client";

// components/TiroirModeles.tsx
//
// LA GALERIE DES MODÈLES.
//
// Un modèle n'est pas un gabarit : c'est un POINT DE DÉPART. Il pose des
// éléments aux positions de la charte, après quoi tout se déplace. Choisir un
// modèle sur une planche déjà écrite la RECOMPOSE sans rien perdre — les
// contenus sont repris par rôle.
//
// Les vignettes seront des rendus réels dans le format et le thème du projet.
// Une image fixe mentirait dès qu'on change de thème, et c'est précisément la
// question qu'on se pose en choisissant.

import { useState } from "react";
import { modelesPour, type CleModele, type Tranche } from "@locomotionlab/planche";

import { avecModele, avecPlanches, avecPlanchesDeJournee, survolNeuf } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";
import ReglageTranche from "./ReglageTranche";

/** Les deux modèles qui racontent une journée. */
const MODELES_DE_JOURNEE: { cle: CleModele; label: string }[] = [
  { cle: "etape", label: "Étape" },
  { cle: "carte", label: "Carte" },
];

export default function TiroirModeles({ poste }: { poste: PosteDeTravail }) {
  const { projet, indexPlanche, modifier, setPlanche } = poste;
  const modeles = modelesPour(projet.format);
  const courant = poste.plancheCourante?.modele ?? null;
  const jours = projet.donnees.coupures.length + (projet.donnees.trace ? 1 : 0);
  const [modeleJournee, setModeleJournee] = useState<CleModele>("etape");
  const [modeJournee, setModeJournee] = useState<Tranche["mode"]>("seule");
  const [jourChoisi, setJourChoisi] = useState(0);

  /** Pose n planches de journée à la suite, et saute sur la première. */
  function poserJournees(nombre: number, premierJour: number) {
    modifier(
      (p) => {
        const r = avecPlanchesDeJournee(p, modeleJournee, modeJournee, nombre);
        const decalees = {
          ...r.projet,
          planches: r.projet.planches.map((pl, i) =>
            i >= r.premier && pl.type === "image"
              ? { ...pl, tranche: { mode: modeJournee, jour: premierJour + (i - r.premier) } }
              : pl,
          ),
        };
        queueMicrotask(() => setPlanche(r.premier));
        return decalees;
      },
      { libelle: nombre > 1 ? "ajouter les planches de journée" : "ajouter une planche de journée" },
    );
  }

  return (
    <div className="px-3.5 py-3">
      <p className="mb-2.5 text-[12px] text-brand-muted">
        Le modèle recompose la planche courante sans perdre ce qui est écrit.
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {modeles.map((m) => (
          <li key={m.cle}>
            <button
              type="button"
              title={m.aide}
              onClick={() =>
                modifier((p) => avecModele(p, indexPlanche, m.cle), {
                  libelle: `passer en « ${m.label} »`,
                })
              }
              aria-current={courant === m.cle ? "true" : undefined}
              className={`flex w-full flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors motion-reduce:transition-none ${
                courant === m.cle
                  ? "border-brand-primary-dark bg-brand-primary/10"
                  : "border-brand-field hover:bg-brand-primary/8"
              }`}
            >
              <span className="text-[13px] font-medium">{m.label}</span>
              <span className="line-clamp-2 text-[11px] leading-snug text-brand-muted">
                {m.aide}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className="mt-4 border-t border-brand-hairline pt-3">
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Survol
        </h3>
        <button
          type="button"
          disabled={!projet.donnees.seance}
          onClick={() =>
            modifier(
              (p) => {
                const planches = [...p.planches, survolNeuf(p)];
                queueMicrotask(() => setPlanche(planches.length - 1));
                return avecPlanches(p, planches);
              },
              { libelle: "ajouter un survol" },
            )
          }
          className="w-full rounded-md border border-brand-field px-3 py-2 text-[13px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none disabled:opacity-40"
        >
          + Survol
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-brand-muted">
          {projet.donnees.seance
            ? "La séance rejouée sur le relief : la caméra suit le point, les chiffres défilent."
            : "Charge une séance — un GPX de montre — dans Données pour la survoler."}
        </p>
      </section>

      <section className="mt-4 border-t border-brand-hairline pt-3">
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Planche de journée
        </h3>
        {jours === 0 ? (
          <p className="text-[11px] leading-snug text-brand-muted">
            Découpe d&apos;abord la trace en journées, dans Données.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {MODELES_DE_JOURNEE.map((m) => (
                <button
                  key={m.cle}
                  type="button"
                  onClick={() => setModeleJournee(m.cle)}
                  aria-pressed={modeleJournee === m.cle}
                  className={`flex-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors motion-reduce:transition-none ${
                    modeleJournee === m.cle
                      ? "border-brand-primary-dark bg-brand-primary/12"
                      : "border-brand-field text-brand-soft hover:bg-brand-primary/8"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <ReglageTranche
              tranche={{ mode: modeJournee, jour: jourChoisi }}
              jours={jours}
              compact
              onChange={(t) => {
                // « Le tour » n'a pas de sens pour une planche de journée : la
                // journée est justement ce qu'on vient y montrer.
                setModeJournee(t.mode === "toutes" ? "seule" : t.mode);
                setJourChoisi(t.jour);
              }}
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => poserJournees(1, jourChoisi)}
                className="flex-1 rounded-md border border-brand-field px-2 py-1.5 text-[12px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none"
              >
                + J{jourChoisi + 1}
              </button>
              <button
                type="button"
                onClick={() => poserJournees(jours, 0)}
                title={
                  jours > 1 ? `Une planche par journée, de J1 à J${jours}` : "Une planche pour J1"
                }
                className="flex-1 rounded-md border border-brand-field px-2 py-1.5 text-[12px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none"
              >
                {jours > 1 ? `+ Les ${jours} journées` : "+ La journée"}
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="mt-3 text-[11px] leading-snug text-brand-muted">
        {projet.donnees.trace
          ? `Trace : ${projet.donnees.trace.nom ?? "sans nom"}.`
          : "Aucune trace chargée — les modèles Carte et Journées resteront vides."}
      </p>
    </div>
  );
}
