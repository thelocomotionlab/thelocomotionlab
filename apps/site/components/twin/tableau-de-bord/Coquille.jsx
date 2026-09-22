// components/twin/tableau-de-bord/Coquille.jsx
//
// LA COQUILLE DU TABLEAU DE BORD : la barre du haut, la navigation, et la porte.
//
// Tant que le jeton n'est pas collé, l'écran ne montre que le champ qui le demande —
// il n'affiche pas une page vide en attendant, ni un squelette qui laisserait croire
// que ça charge.
//
// Charte, sans exception : les composants de packages/ui et les tokens de theme.css.
// Aucune couleur, police, ombre ou arrondi en dur ici (lib/charteTableauDeBord.test.js
// le vérifie).

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Field } from "@locomotionlab/ui";

import { appeler, lireLeJeton, oublierLeJeton, poserLeJeton } from "./api";

const ONGLETS = [
  { href: "/services/twin/tableau-de-bord", libelle: "File" },
  { href: "/services/twin/tableau-de-bord/athletes", libelle: "Athlètes" },
];

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";

export { ETIQUETTE };

function BarreHaute({ actif, sousTitre, surOubli }) {
  return (
    <header className="flex h-12 flex-none items-center gap-8 border-b border-brand-hairline bg-brand-paper px-6">
      <div className="flex items-center gap-2.5">
        <span className="size-3 rounded-full bg-brand-deep" aria-hidden="true" />
        <span className="font-mono text-xxs font-bold uppercase tracking-etiquette">
          Locomotion Lab
        </span>
      </div>
      <nav className="flex h-12 items-stretch gap-6 text-sm">
        {ONGLETS.map(({ href, libelle }) => (
          <Link
            key={href}
            href={href}
            className={
              libelle === actif
                ? "flex items-center border-b-2 border-brand-deep font-semibold text-brand-text"
                : "flex items-center text-brand-muted hover:text-brand-text"
            }
          >
            {libelle}
          </Link>
        ))}
      </nav>
      {sousTitre ? <span className="text-sm text-brand-muted">{sousTitre}</span> : null}
      <button
        type="button"
        onClick={surOubli}
        className="ml-auto cursor-pointer font-mono text-xxs uppercase tracking-etiquette text-brand-muted hover:text-brand-deep"
      >
        Tableau de bord Twin · privé
      </button>
    </header>
  );
}

function Porte({ surJeton, message }) {
  const [saisi, setSaisi] = useState("");

  return (
    <div className="mx-auto mt-24 max-w-[440px] px-6">
      <p className={ETIQUETTE}>Tableau de bord</p>
      <h1 className="mt-3 font-heading text-[28px] font-light leading-tight text-brand-text">
        Colle ton jeton
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-brand-soft">
        Il vit le temps de l&rsquo;onglet, et rien de plus. Il se lit dans
        <code className="mx-1 font-mono text-xs">infra/.env</code>, sous
        <code className="mx-1 font-mono text-xs">TWIN_ADMIN_TOKEN</code>.
      </p>
      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (saisi.trim()) surJeton(saisi.trim());
        }}
      >
        <Field
          label="Jeton d'administration"
          name="jeton"
          type="password"
          autoComplete="off"
          value={saisi}
          onChange={(evenement) => setSaisi(evenement.target.value)}
          error={message}
        />
        <Button type="submit" disabled={!saisi.trim()}>
          Entrer
        </Button>
      </form>
    </div>
  );
}

/**
 * La coquille. `children` reçoit `(donnees, recharger)` — le rendu n'a lieu qu'une
 * fois les données là, ce qui évite à chaque écran de traiter le cas « pas encore ».
 */
export default function Coquille({ actif, sousTitre, chemin, children }) {
  const [jeton, setJeton] = useState(null); // null = on ne sait pas encore
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    setJeton(lireLeJeton());
  }, []);

  const recharger = useCallback(async () => {
    if (!jeton) return;
    setCharge(true);
    try {
      setDonnees(await appeler(chemin, { jeton }));
      setErreur("");
    } catch (leve) {
      setErreur(leve.message);
      if (leve.statut === 401) {
        oublierLeJeton();
        setJeton("");
      }
    } finally {
      setCharge(false);
    }
  }, [chemin, jeton]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  if (jeton === null) return null; // premier rendu : sessionStorage n'est pas encore lu
  if (!jeton) {
    return (
      <Porte
        message={erreur}
        surJeton={(valeur) => {
          poserLeJeton(valeur);
          setErreur("");
          setJeton(valeur);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-bg">
      <BarreHaute
        actif={actif}
        sousTitre={sousTitre}
        surOubli={() => {
          oublierLeJeton();
          setJeton("");
        }}
      />
      <main className="flex flex-1 flex-col gap-6 px-8 py-7">
        {erreur ? (
          <p className="rounded-lg border border-brand-deep px-4 py-3 text-sm text-brand-deep-dark">
            {erreur}
          </p>
        ) : null}
        {donnees ? children(donnees, recharger, charge) : null}
        {!donnees && !erreur ? (
          <p className="text-sm text-brand-muted">Lecture…</p>
        ) : null}
      </main>
    </div>
  );
}
