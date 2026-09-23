// components/twin/tableau-de-bord/editeur/Editeur.jsx
//
// L'ÉDITEUR DE COURSE : trois étapes — la trace, les ravitaillements, l'horloge et le
// terrain. Le rail pose, l'inspecteur règle ce qui est choisi.
//
// Chaque changement s'enregistre tout seul, un instant après la dernière frappe : c'est
// l'objet ENTIER qui part (récapitulatif §5.3), pour qu'un enregistrement perdu ne laisse
// jamais une course à moitié d'une version et à moitié de l'autre. « Enregistrer » fait
// sortir la course du brouillon ; les plans existants gardent leur version.

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Etapes } from "@locomotionlab/ui";
import { BadgeEtat } from "@locomotionlab/ui/contenu";

import { appeler } from "../api";
import { ETIQUETTE, lienVers } from "../Coquille";
import { BandeauAnnuler } from "./commun";
import EtapeHorloge from "./EtapeHorloge";
import EtapeRavitaillements from "./EtapeRavitaillements";
import EtapeTrace from "./EtapeTrace";

export const ETAPES = [
  { cle: "trace", titre: "Trace" },
  { cle: "ravitaillements", titre: "Ravitaillements" },
  { cle: "horloge", titre: "Horloge et terrain" },
];

const DELAI_MS = 800;

// Ce que le serveur calcule et que l'écran ne fait que montrer : après un
// enregistrement, seuls ces champs-là sont repris de la réponse. Ce que Valentin a
// tapé pendant que la requête voyageait ne se fait pas écraser.
const CALCULES = ["geometrie", "soleil", "lat", "lon", "gpx", "statut", "slug"];

function changerDEtape(etape) {
  const url = new URL(window.location.href);
  url.searchParams.set("etape", etape);
  window.history.replaceState(null, "", url);
}

export default function Editeur({ initiale, etapeInitiale }) {
  const [course, setCourse] = useState(initiale);
  const [trace, setTrace] = useState(null);
  const [etape, setEtape] = useState(
    ETAPES.some((e) => e.cle === etapeInitiale) ? etapeInitiale : "trace",
  );
  const [etat, setEtat] = useState("enregistre"); // modifie | enregistrement | enregistre | erreur
  const [message, setMessage] = useState("");
  const [bandeau, setBandeau] = useState(null);
  const courante = useRef(course);
  const minuteur = useRef(null);
  const ravitaillementsEnregistres = useRef(JSON.stringify(initiale.ravitaillements));

  useEffect(() => {
    courante.current = course;
  }, [course]);

  const relireLaTrace = useCallback(async () => {
    // Sans GPX posé, il n'y a rien à relire : la trace reste vide.
    if (!courante.current.gpx?.nom) return;
    try {
      setTrace(await appeler(`/courses/${encodeURIComponent(courante.current.id)}/trace`));
    } catch {
      setTrace(null);
    }
  }, []);

  useEffect(() => {
    void relireLaTrace();
  }, [relireLaTrace]);

  const enregistrer = useCallback(async () => {
    clearTimeout(minuteur.current);
    const envoyee = courante.current;
    setEtat("enregistrement");
    try {
      const vu = await appeler(`/courses/${encodeURIComponent(envoyee.id)}`, {
        methode: "PUT",
        corps: envoyee,
      });
      setCourse((c) => ({ ...c, ...Object.fromEntries(CALCULES.map((k) => [k, vu[k]])) }));
      setEtat(courante.current === envoyee ? "enregistre" : "modifie");
      setMessage("");
      // Les ravitaillements recalent la distance : le profil et les segments suivent.
      const ravitos = JSON.stringify(envoyee.ravitaillements);
      if (ravitos !== ravitaillementsEnregistres.current) {
        ravitaillementsEnregistres.current = ravitos;
        await relireLaTrace();
      }
      return true;
    } catch (leve) {
      setEtat("erreur");
      setMessage(leve.message);
      return false;
    }
  }, [relireLaTrace]);

  /** Un changement : il s'applique tout de suite à l'écran, et part un instant après. */
  const modifier = useCallback(
    (patch) => {
      setCourse((c) => {
        const suivante = { ...c, ...(typeof patch === "function" ? patch(c) : patch) };
        courante.current = suivante;
        return suivante;
      });
      setEtat("modifie");
      clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => void enregistrer(), DELAI_MS);
    },
    [enregistrer],
  );

  // Quitter la page avec un changement en route : on le dit, plutôt que de le perdre.
  useEffect(() => {
    const avant = (evenement) => {
      if (etat === "modifie" || etat === "enregistrement") evenement.preventDefault();
    };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [etat]);

  const publier = async () => {
    if (!(await enregistrer())) return;
    try {
      const vu = await appeler(`/courses/${encodeURIComponent(course.id)}/publish`, { methode: "POST" });
      setCourse((c) => ({ ...c, statut: vu.statut }));
      setMessage("Course publiée dans la bibliothèque. Les plans existants gardent leur version.");
    } catch (leve) {
      setMessage(leve.message);
    }
  };

  const traceRecue = async (vu) => {
    // La pose d'une trace réécrit la géométrie, la position et le soleil côté serveur.
    const fraiche = await appeler(`/courses/${encodeURIComponent(course.id)}`);
    setCourse((c) => ({ ...c, ...Object.fromEntries(CALCULES.map((k) => [k, fraiche[k]])) }));
    courante.current = { ...courante.current, gpx: fraiche.gpx };
    setTrace({ ...vu, nom: fraiche.gpx?.nom });
  };

  const props = {
    course,
    trace,
    modifier,
    surTrace: traceRecue,
    annoncer: (texte, annuler) => setBandeau({ message: texte, annuler }),
  };

  return (
    <div className="-mx-8 -my-7 flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-brand-hairline bg-brand-paper px-8 py-3">
        <p className="text-sm text-brand-muted">
          <Link href={lienVers("courses")} className="hover:text-brand-text">
            Courses
          </Link>{" "}
          › <span className="font-semibold text-brand-text">{course.nom || "Sans nom"}</span>
          {course.edition ? ` · ${course.edition}` : ""}
        </p>
        <BadgeEtat ton={course.statut === "publiee" ? "deroule" : "annonce"}>
          {course.statut === "publiee" ? "publiée" : "brouillon"}
        </BadgeEtat>
        <span className="ml-auto text-sm text-brand-muted" aria-live="polite">
          {etat === "enregistrement"
            ? "Enregistrement…"
            : etat === "modifie"
              ? "Modifié"
              : etat === "erreur"
                ? ""
                : course.statut === "publiee"
                  ? "Enregistré"
                  : "Brouillon enregistré"}
        </span>
        <Button size="sm" onClick={publier} disabled={etat === "enregistrement"}>
          Enregistrer
        </Button>
      </div>
      {message ? (
        <p
          className={`border-b border-brand-hairline px-8 py-2 text-sm ${
            etat === "erreur" ? "text-brand-deep-dark" : "text-brand-soft"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_300px]">
        <div className="flex flex-col gap-1 border-r border-brand-hairline bg-brand-paper px-4 py-6">
          <Etapes
            etiquette="Étapes de l'éditeur"
            etapes={ETAPES}
            active={etape}
            surChoix={(cle) => {
              setEtape(cle);
              changerDEtape(cle);
            }}
          />
          <div className="mt-6 border-t border-brand-grid pt-5">
            <p className={ETIQUETTE}>Le rail pose ; l&rsquo;inspecteur règle ce qui est choisi.</p>
          </div>
          {etape === "trace" ? <EtapeTrace.Rail {...props} /> : null}
          {etape === "ravitaillements" ? <EtapeRavitaillements.Rail {...props} /> : null}
          {etape === "horloge" ? <EtapeHorloge.Rail {...props} /> : null}
        </div>

        {etape === "trace" ? <EtapeTrace {...props} /> : null}
        {etape === "ravitaillements" ? <EtapeRavitaillements {...props} /> : null}
        {etape === "horloge" ? <EtapeHorloge {...props} /> : null}
      </div>

      <BandeauAnnuler
        message={bandeau?.message}
        surAnnuler={() => {
          bandeau?.annuler?.();
          setBandeau(null);
        }}
        surFermer={() => setBandeau(null)}
      />
    </div>
  );
}
