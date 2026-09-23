// components/twin/plan/PageDuPlan.jsx
//
// LA PAGE D'UN PLAN : ce que l'athlète lit avec sa clé, et son assistance avec la sienne.
//
// La page ne porte rien d'elle-même : elle lit l'API avec la clé du lien, et tout ce
// qu'elle montre vient de la version que le laboratoire a publiée. Une clé fausse, une
// référence inconnue, un plan pas encore publié — même réponse, même message : cette
// page ne confirme l'existence de rien à qui n'a pas le bon lien.

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { NIVEAUX, departLisible, duree, jourLisible, nombre } from "@/lib/twinTableauDeBord.mjs";
import { heureApres } from "@/lib/twinPlan.mjs";

import ApresLaCourse from "./ApresLaCourse";
import CadrePartage, { Documents, ETIQUETTE } from "./CadrePartage";
import ToiSeul from "./ToiSeul";
import { lirePage } from "./api";

function Entete({ vue }) {
  const prive = vue.acces === "prive";
  const niveau = NIVEAUX[vue.niveau] ?? "";
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-brand-hairline pb-4">
      <span className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full bg-brand-deep" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-surtitre text-brand-text">Locomotion Lab</span>
      </span>
      <span className="text-sm text-brand-muted">
        {prive ? `Ta page, ${vue.athlete}` : `Le plan de ${vue.athlete}`}
        {prive && niveau ? ` · ${niveau}` : ""} · version {vue.version} ·{" "}
        {vue.fige ? (vue.resultat ? "courue" : "figée au départ") : "à venir"}
      </span>
    </header>
  );
}

function Introduction({ vue }) {
  const p = vue.prediction ?? {};
  const c = vue.course ?? {};
  const depart = vue.plan?.start_time || vue.depart_le;
  const prive = vue.acces === "prive";
  const quand = departLisible(vue.depart_le).replace(" · ", " à ");
  return (
    <div>
      <h1 className="m-0 font-heading text-[32px] font-light leading-tight text-brand-text sm:text-[40px]">
        {vue.fige && vue.resultat ? (prive ? "Ta course" : "La course") : prive ? "Ton plan" : "Son plan"}
      </h1>
      <p className="mt-3 max-w-3xl text-lecture leading-lecture text-brand-text [text-wrap:pretty]">
        {c.name}, départ {quand}.{" "}
        {prive ? "Tu arrives" : `${vue.athlete} arrive`} autour de <strong>{duree(p.central_h)}</strong>, {heureApres(depart, p.central_h).replace(/^(\S+)/, "le $1")} ;
        une course sur deux se joue entre <strong>{duree(p.plan_low_h)}</strong> et <strong>{duree(p.plan_high_h)}</strong>.
      </p>
      <p className="mt-2 text-sm text-brand-muted">
        {nombre(c.length_km, 0)} km · {nombre(c.dplus_m, 0)} m D+ · {nombre(c.dminus_m, 0)} m D− · édité le{" "}
        {jourLisible(vue.genere_le)} · référence {vue.ref}
      </p>
    </div>
  );
}

function Contenu({ reference }) {
  const cle = useSearchParams().get("k") || "";
  const [vue, setVue] = useState(null);
  const [erreur, setErreur] = useState("");

  const recharger = useCallback(async () => {
    try {
      setVue(await lirePage(reference, cle));
      setErreur("");
    } catch (leve) {
      setErreur(leve.message);
    }
  }, [reference, cle]);

  useEffect(() => {
    // La lecture se fait au montage : la page n'a rien à montrer tant que l'API n'a
    // pas répondu, et elle ne met rien en cache — un plan se met à jour au même lien.
    let vivant = true;
    lirePage(reference, cle)
      .then((lu) => vivant && setVue(lu))
      .catch((leve) => vivant && setErreur(leve.message));
    return () => {
      vivant = false;
    };
  }, [reference, cle]);

  if (erreur && !vue) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className={ETIQUETTE}>Locomotion Twin</p>
        <p className="mt-4 text-lecture text-brand-text">{erreur}</p>
      </div>
    );
  }
  if (!vue) {
    return <p className="px-4 py-24 text-center text-sm text-brand-muted">Lecture du plan…</p>;
  }

  const prive = vue.acces === "prive";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
      <Entete vue={vue} />
      <Introduction vue={vue} />

      {prive && vue.fige ? <ApresLaCourse vue={vue} reference={reference} cle={cle} recharger={recharger} /> : null}

      <CadrePartage
        vue={vue}
        reference={reference}
        cle={cle}
        titre={
          vue.fige
            ? "Partagé avec l'assistance · figé au départ, le lien de partage reste ouvert"
            : prive
              ? "Partagé avec ton assistance"
              : `Ce que ${vue.athlete} partage avec toi`
        }
        lienDePartage={prive ? vue.lien_de_partage : ""}
      />

      {prive && !vue.fige ? <ToiSeul vue={vue} reference={reference} cle={cle} recharger={recharger} /> : null}

      {prive && vue.fige ? (
        <section className="flex flex-col gap-3">
          <p className={ETIQUETTE}>Tes documents</p>
          <Documents reference={reference} cle={cle} documents={vue.documents} fige version={vue.version} />
        </section>
      ) : null}

      <footer className="border-t border-brand-hairline pt-4 text-xs leading-relaxed text-brand-muted">
        Cette page n&rsquo;est liée de nulle part et n&rsquo;est pas indexée : seul son lien y mène. Garde-le
        comme tu garderais le PDF.
      </footer>
    </div>
  );
}

export default function PageDuPlan({ reference }) {
  return (
    <Suspense fallback={<p className="px-4 py-24 text-center text-sm text-brand-muted">Lecture du plan…</p>}>
      <Contenu reference={reference} />
    </Suspense>
  );
}
