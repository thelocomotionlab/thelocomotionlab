// components/twin/tableau-de-bord/Bibliotheque.jsx
//
// LA BIBLIOTHÈQUE DES COURSES : une course se décrit une fois ; ses athlètes s'y
// inscrivent, son édition suivante se duplique.
//
// Distance et D+ sont ceux calculés depuis la trace, jamais ceux qu'on a tapés.

"use client";

import Link from "next/link";
import { useState } from "react";
import { BoutonTexte, Button, Field } from "@locomotionlab/ui";
import { BadgeEtat, Tableau } from "@locomotionlab/ui/contenu";

import { departLisible, nombre } from "@/lib/twinTableauDeBord.mjs";
import { composerLeDepart } from "@/lib/twinCourse.mjs";

import { appeler } from "./api";
import Coquille, { ETIQUETTE, lienVers } from "./Coquille";

const LIEN = "font-semibold text-brand-text underline decoration-brand-hairline underline-offset-4 hover:decoration-brand-deep";

function allerA(adresse) {
  window.location.assign(adresse);
}

/** « Nouvelle course » : le nom, l'édition, la date — la trace vient ensuite. */
function NouvelleCourse({ surAnnuler }) {
  const [nom, setNom] = useState("");
  const [edition, setEdition] = useState(String(new Date().getFullYear()));
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const creer = async (charge) => {
    setEnvoi(true);
    setMessage("");
    try {
      const { id } = await appeler("/courses", { methode: "POST", corps: charge });
      allerA(lienVers("courses", { id, etape: "trace" }));
    } catch (leve) {
      setMessage(leve.message);
      setEnvoi(false);
    }
  };

  return (
    <section className="rounded-lg border border-brand-hairline bg-brand-paper px-6 py-5">
      <p className={ETIQUETTE}>Nouvelle course</p>
      <form
        className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          void creer({
            nom: nom.trim(),
            edition: edition ? Number(edition) : null,
            depart_le: composerLeDepart({ date, heure: "", fuseau: "+02:00" }),
          });
        }}
      >
        <Field label="Nom" name="nom" value={nom} required onChange={(e) => setNom(e.target.value)} />
        <Field
          label="Édition"
          name="edition"
          type="number"
          value={edition}
          onChange={(e) => setEdition(e.target.value)}
        />
        <Field label="Date de départ" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={envoi} disabled={!nom.trim()}>
            Créer
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={surAnnuler}>
            Annuler
          </Button>
        </div>
      </form>
      <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-brand-soft">
        <span>ou un carnet de route du CLI, ravitaillements compris :</span>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm"
          onChange={async (evenement) => {
            const fichier = evenement.target.files?.[0];
            if (!fichier) return;
            try {
              const race_spec = JSON.parse(await fichier.text());
              await creer({ race_spec, edition: edition ? Number(edition) : null });
            } catch (leve) {
              setMessage(leve instanceof SyntaxError ? "Ce fichier n'est pas un JSON lisible." : leve.message);
            }
          }}
        />
      </label>
      {message ? <p className="mt-3 text-sm text-brand-deep-dark">{message}</p> : null}
      <p className="mt-3 text-xs text-brand-muted">
        Demandés à la création ; la trace, les ravitaillements et l&rsquo;horloge se règlent
        ensuite dans l&rsquo;éditeur. Le fuseau par défaut est celui de Paris en été : il se
        change à l&rsquo;étape Horloge.
      </p>
    </section>
  );
}

function Actions({ course, recharger }) {
  const [message, setMessage] = useState("");
  const [aConfirmer, setAConfirmer] = useState(false);
  const suivante = course.edition ? course.edition + 1 : null;

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center justify-end gap-3 text-sm">
        <Link href={lienVers("courses", { id: course.id })} className={LIEN}>
          Ouvrir
        </Link>
        <BoutonTexte
          onClick={async () => {
            setMessage("");
            try {
              const { id } = await appeler(`/courses/${encodeURIComponent(course.id)}/duplicate`, {
                methode: "POST",
                corps: suivante ? { edition: suivante } : {},
              });
              allerA(lienVers("courses", { id, etape: "horloge" }));
            } catch (leve) {
              setMessage(leve.message);
            }
          }}
        >
          {suivante ? `Dupliquer en ${suivante}` : "Dupliquer"}
        </BoutonTexte>
        {course.athletes ? null : aConfirmer ? (
          <span className="flex items-center gap-2">
            <BoutonTexte
              ton="alerte"
              onClick={async () => {
                try {
                  await appeler(`/courses/${encodeURIComponent(course.id)}`, { methode: "DELETE" });
                  await recharger();
                } catch (leve) {
                  setMessage(leve.message);
                  setAConfirmer(false);
                }
              }}
            >
              Supprimer, définitivement
            </BoutonTexte>
            <BoutonTexte ton="discret" onClick={() => setAConfirmer(false)}>
              non
            </BoutonTexte>
          </span>
        ) : (
          <BoutonTexte ton="discret" onClick={() => setAConfirmer(true)}>
            Supprimer
          </BoutonTexte>
        )}
      </span>
      {message ? <span className="text-xs text-brand-deep-dark">{message}</span> : null}
    </span>
  );
}

export default function Bibliotheque() {
  const [creation, setCreation] = useState(false);

  return (
    <Coquille actif="Courses" chemin="/courses">
      {({ courses }, recharger) => (
        <>
          <div className="flex items-end justify-between gap-8">
            <div>
              <h1 className="font-heading text-[22px] font-bold text-brand-text">Courses</h1>
              <p className="mt-1 text-sm text-brand-muted">
                Une course se décrit une fois ; ses athlètes s&rsquo;y inscrivent, son édition
                suivante se duplique.
              </p>
            </div>
            {creation ? null : (
              <Button size="sm" onClick={() => setCreation(true)}>
                Nouvelle course
              </Button>
            )}
          </div>

          {creation ? <NouvelleCourse surAnnuler={() => setCreation(false)} /> : null}

          <section className="rounded-lg border border-brand-hairline bg-brand-paper px-5 py-2">
            {courses.length ? (
              <Tableau
                colonnes={["Course", "Édition", "Départ", "Distance", "D+", "Ravitaillements", "Inscrits", ""]}
                cles={courses.map((c) => c.id)}
                lignes={courses.map((c) => [
                  <span key="nom" className="flex flex-col items-start gap-1">
                    <Link href={lienVers("courses", { id: c.id })} className={LIEN}>
                      {c.nom || "Sans nom"}
                    </Link>
                    <BadgeEtat ton={c.statut === "publiee" ? "deroule" : "annonce"}>
                      {c.statut === "publiee" ? "publiée" : "brouillon"}
                    </BadgeEtat>
                  </span>,
                  c.edition ?? "",
                  departLisible(c.depart_le) || "",
                  c.geometrie?.distance_km ? nombre(c.geometrie.distance_km, 1, "km") : "—",
                  c.geometrie?.dplus_m ? nombre(c.geometrie.dplus_m, 0, "m") : "—",
                  // le départ n'est pas un ravitaillement : on compte ce que l'athlète croise
                  c.ravitaillements?.length ? String(c.ravitaillements.length - 1) : "—",
                  c.athletes ? `${c.athletes} athlète${c.athletes > 1 ? "s" : ""}` : "—",
                  <Actions key="actions" course={c} recharger={recharger} />,
                ])}
              />
            ) : (
              <p className="px-1 py-16 text-center text-sm leading-relaxed text-brand-soft">
                Aucune course.
                <br />
                « Nouvelle course » ouvre l&rsquo;éditeur : une trace GPX, ses
                ravitaillements, sa date.
              </p>
            )}
          </section>

          <p className="text-xs text-brand-muted">
            Distance et D+ sont ceux calculés depuis la trace. Une course qui porte un plan
            ne se supprime pas.
          </p>
        </>
      )}
    </Coquille>
  );
}
