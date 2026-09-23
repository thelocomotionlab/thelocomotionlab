// components/twin/tableau-de-bord/Registre.jsx
//
// LE REGISTRE DE COUVERTURE : chaque plan servi est une promesse falsifiable ; le
// registre consigne où le réel est tombé (récapitulatif §5.6).
//
// Il se calcule côté moteur depuis les plans qui ont un résultat, par niveau servi — un
// plan de base et un plan calibré ne promettent pas la même chose, ils se comptent à
// part. La saisie se fait ici, en ligne ; l'athlète peut aussi saisir depuis sa page.

"use client";

import { useState } from "react";
import { BoutonTexte, Button, ChampCompact } from "@locomotionlab/ui";
import { BadgeEtat } from "@locomotionlab/ui/contenu";

import { NIVEAUX, duree, jourLisible, lireUneDuree, nombre, signe } from "@/lib/twinTableauDeBord.mjs";

import { appeler, lireUnFichier } from "./api";
import Coquille, { ETIQUETTE } from "./Coquille";

function pourcent(part) {
  return part === null || part === undefined ? "—" : `${nombre(part * 100, 0)} %`;
}

function Resume({ titre, chiffres }) {
  return (
    <section className="rounded-lg border border-brand-hairline bg-brand-paper px-6 py-5">
      <p className={ETIQUETTE}>{titre}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {[
          ["Entrées", chiffres.entrees ? `${chiffres.entrees}${chiffres.abandons ? ` dont ${chiffres.abandons} abandon${chiffres.abandons > 1 ? "s" : ""}` : ""}` : "0"],
          ["Erreur moyenne", chiffres.erreur_moyenne === null ? "—" : `${nombre(chiffres.erreur_moyenne, 1)} %`],
          ["Fourchette", pourcent(chiffres.fourchette)],
          ["Bornes", pourcent(chiffres.bornes)],
        ].map(([terme, valeur]) => (
          <div key={terme}>
            <dt className="text-xs text-brand-muted">{terme}</dt>
            <dd className="m-0 mt-0.5 font-heading text-[24px] font-light text-brand-text">{valeur}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Saisie({ ligne, recharger }) {
  const [texte, setTexte] = useState("");
  const [message, setMessage] = useState("");
  const heures = lireUneDuree(texte);
  const saisir = async (corps) => {
    setMessage("");
    try {
      await appeler(`/plans/${encodeURIComponent(ligne.ref)}/result`, { methode: "PUT", corps });
      await recharger();
    } catch (leve) {
      setMessage(leve.message);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ChampCompact
        label={`Temps officiel de ${ligne.athlete}`}
        masquerEtiquette
        className="w-28"
        value={texte}
        placeholder="34h12"
        onChange={(evenement) => setTexte(evenement.target.value)}
      />
      <Button size="sm" variant="secondary" disabled={heures === null} onClick={() => saisir({ officiel_h: heures })}>
        Saisir
      </Button>
      <BoutonTexte ton="discret" className="text-xs" onClick={() => saisir({ abandon: true })}>
        abandon
      </BoutonTexte>
      {message ? <span className="text-xs text-brand-deep-dark">{message}</span> : null}
    </span>
  );
}

const dedans = (oui) => (oui === null || oui === undefined ? "—" : oui ? "dedans" : "dehors");

export default function Registre() {
  const [message, setMessage] = useState("");

  return (
    <Coquille actif="Registre" chemin="/registre">
      {(registre, recharger) => (
        <>
          <div className="flex items-end justify-between gap-8">
            <div>
              <h1 className="font-heading text-[22px] font-bold text-brand-text">Registre de couverture</h1>
              <p className="mt-1 text-sm text-brand-muted">
                Chaque plan servi est une promesse falsifiable ; le registre consigne où le réel est tombé.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setMessage("");
                try {
                  const { url } = await lireUnFichier("/registre/export");
                  const lien = document.createElement("a");
                  lien.href = url;
                  lien.download = "twin-registre-tableau-de-bord.json";
                  lien.click();
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } catch (leve) {
                  setMessage(leve.message);
                }
              }}
            >
              Exporter (format du registre committé)
            </Button>
          </div>
          {message ? <p className="text-sm text-brand-deep-dark">{message}</p> : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Resume titre="Plan de base" chiffres={registre.base} />
            <Resume titre="Plan calibré" chiffres={registre.calibre} />
          </div>

          <section className="overflow-x-auto rounded-lg border border-brand-hairline bg-brand-paper">
            {registre.lignes.length ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-etiquette text-brand-muted">
                    {["Athlète", "Course", "Date", "Niveau servi", "Prédit", "Réel", "Écart", "Fourchette", "Bornes"].map((c) => (
                      <th key={c} className="px-4 py-2.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registre.lignes.map((l) => (
                    <tr key={l.ref} className="border-t border-brand-grid">
                      <td className="px-4 py-2 font-semibold text-brand-text">
                        {l.athlete || "—"}
                        {l.gardee ? <span className="block text-xs font-normal text-brand-muted">plan supprimé</span> : null}
                      </td>
                      <td className="px-4 py-2">{l.course}</td>
                      <td className="px-4 py-2 tabular-nums">{jourLisible(l.date)}</td>
                      <td className="px-4 py-2">
                        <BadgeEtat ton={l.niveau === "calibre" ? "deroule" : "annonce"}>{NIVEAUX[l.niveau] ?? l.niveau}</BadgeEtat>
                      </td>
                      <td className="px-4 py-2 tabular-nums">{duree(l.central_h)}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {l.a_saisir ? (
                          <Saisie ligne={l} recharger={recharger} />
                        ) : l.abandon ? (
                          "abandon"
                        ) : (
                          `${duree(l.officiel_h)}${l.saisi_par === "athlete" ? " · par l'athlète" : ""}`
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{l.err_pct === null ? "—" : `${signe(l.err_pct)} %`}</td>
                      <td className="px-4 py-2">{dedans(l.in_plan)}</td>
                      <td className="px-4 py-2">{dedans(l.in_safety)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-6 py-16 text-center text-sm leading-relaxed text-brand-soft">
                Aucune course courue avec un plan du tableau de bord.
                <br />
                Une course entre ici au départ ; son résultat se saisit ici, ou depuis la page de l&rsquo;athlète.
              </p>
            )}
          </section>

          <p className="text-xs leading-relaxed text-brand-muted">
            Format libre : 34h12, 34:12 ou 34 h 12. L&rsquo;écart, la fourchette et les bornes se
            calculent à la saisie. Fourchette de course : une course sur deux ; bornes de sécurité :
            quatre courses sur cinq. Pour un système bien calibré, la moitié des réels tombent près
            du central : un réel proche du prédit est le comportement attendu, pas la preuve
            d&rsquo;une fourchette trop large. Aucune recalibration sous huit entrées.
          </p>
        </>
      )}
    </Coquille>
  );
}
