"use client";

// components/Inspecteur.tsx
//
// L'INSPECTEUR (296 px) : tout ce qui concerne la SÉLECTION, et rien d'autre.
//
// Sans sélection, il porte les réglages de la planche. C'est la règle « un
// élément, un endroit » : on ne cherche plus le réglage d'un titre dans six
// sections d'un onglet « Allure », on sélectionne le titre et on a tout.

import type { PlancheImage, Projet } from "@locomotionlab/planche";

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

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-brand-muted">{libelle}</span>
      <span className="tabulaire text-brand-text">{valeur}</span>
    </p>
  );
}

export default function Inspecteur({
  projet,
  planche,
  selection,
}: {
  projet: Projet;
  planche: PlancheImage | null;
  selection: string[];
}) {
  return (
    <aside
      aria-label="Inspecteur"
      className="flex w-[296px] shrink-0 flex-col overflow-y-auto border-l border-brand-field bg-brand-paper"
    >
      {selection.length > 0 ? (
        <Section titre="Sélection">
          <p className="text-[13px] text-brand-soft">{selection.length} élément(s)</p>
        </Section>
      ) : (
        <>
          <Section titre="Planche">
            <Ligne libelle="Modèle" valeur={planche?.modele ?? "—"} />
            <Ligne libelle="Éléments" valeur={String(planche?.elements.length ?? 0)} />
            <Ligne
              libelle="Journées"
              valeur={planche ? planche.tranche.mode : "—"}
            />
          </Section>
          <Section titre="Lot">
            <Ligne libelle="Format" valeur={projet.format} />
            <Ligne libelle="Thème" valeur={projet.theme} />
            <Ligne libelle="Planches" valeur={String(projet.planches.length)} />
          </Section>
          <Section titre="Données">
            <Ligne libelle="Trace" valeur={projet.donnees.trace?.nom ?? "aucune"} />
            <Ligne libelle="Séance" valeur={projet.donnees.seance ? "chargée" : "aucune"} />
            <Ligne libelle="Médias" valeur={String(projet.medias.length)} />
          </Section>
        </>
      )}
    </aside>
  );
}
