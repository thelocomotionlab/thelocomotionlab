// components/twin/plan/ToiSeul.jsx
//
// « TOI SEUL » : ce que la clé privée ouvre, et que le lien de partage ne montre pas.
//
// Le tableau de marche avec ses arrêts à régler, ce que l'assistance prépare, les débits,
// une demande au laboratoire, le jumeau et les courses passées. Les amendements sont de
// vrais champs : « Refaire mes documents » régénère le rapport, la feuille et les fiches
// dans la version publiée. Aucune durée n'est promise — on dit ce qui se passe, pas
// combien de temps ça prend.

"use client";

import { useCallback, useState } from "react";
import { BoutonTexte, Button, ChampCompact, Field } from "@locomotionlab/ui";

import { departLisible, duree, jourLisible, nombre } from "@/lib/twinTableauDeBord.mjs";
import { amendementsDuFormulaire } from "@/lib/twinPlan.mjs";
import useJob from "@/components/twin/useJob";

import { amender, demander, lireLAmendement } from "./api";
import { ETIQUETTE, TitreDeSection } from "./CadrePartage";

function allure(minutesParKm) {
  if (!minutesParKm) return "—";
  const m = Math.floor(minutesParKm);
  const s = Math.round((minutesParKm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Ce que la page montrait à l'ouverture, en chaînes — le point de comparaison. */
function valeursAffichees(vue) {
  const segments = vue.plan?.segments ?? [];
  const arrets = {};
  segments.slice(0, -1).forEach((s) => {
    arrets[s.index] = s.stop_min === null || s.stop_min === undefined ? "" : String(Math.round(s.stop_min));
  });
  const notes = Object.fromEntries((vue.plan?.crew ?? []).map((c) => [c.aid_index, c.note ?? ""]));
  const n = vue.plan?.nutrition ?? {};
  return {
    arrets,
    notes,
    nutrition: {
      eau_l_h: n.water_l_per_h ?? "",
      glucides_g_h: n.carbs_g_per_h ?? "",
    },
  };
}

function Demande({ reference, cle, demandes }) {
  const [ouvert, setOuvert] = useState(false);
  const [quoi, setQuoi] = useState("");
  const [pourquoi, setPourquoi] = useState("");
  const [envoyee, setEnvoyee] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {demandes.length ? (
        <ul className="flex list-none flex-col gap-3 p-0 text-sm">
          {demandes.map((d) => (
            <li key={d.id} className="rounded-lg border border-brand-hairline px-4 py-3">
              <p className="text-brand-text">« {d.quoi} »</p>
              <p className="mt-1 text-xs text-brand-muted">
                envoyée le {jourLisible(d.recue_le)}
                {d.statut === "repondue" ? ` · répondue le ${jourLisible(d.repondue_le)}` : " · en attente de réponse"}
              </p>
              {d.reponse ? <p className="mt-2 text-sm text-brand-soft">{d.reponse}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {envoyee ? (
        <p className="text-sm text-brand-soft" role="status">
          Demande envoyée. Elle est dans la file du laboratoire : « {envoyee} ». Tu reçois la réponse par email.
        </p>
      ) : ouvert ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (evenement) => {
            evenement.preventDefault();
            setMessage("");
            try {
              await demander(reference, cle, { quoi, pourquoi });
              setEnvoyee(quoi);
              setOuvert(false);
            } catch (leve) {
              setMessage(leve.message);
            }
          }}
        >
          <Field label="Quoi" name="quoi" value={quoi} required maxLength={200} onChange={(e) => setQuoi(e.target.value)} />
          <Field as="textarea" rows={4} label="Pourquoi" name="pourquoi" value={pourquoi} onChange={(e) => setPourquoi(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!quoi.trim()}>
              Envoyer au laboratoire
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
          <p className="text-xs text-brand-muted">
            La demande entre dans la file du laboratoire ; tu reçois la réponse par email.
          </p>
          {message ? <p className="text-sm text-brand-deep-dark">{message}</p> : null}
        </form>
      ) : (
        <p className="text-sm text-brand-soft">
          Ta cible et le parcours sont fixés par le laboratoire.{" "}
          <BoutonTexte onClick={() => setOuvert(true)}>Demander une autre modification</BoutonTexte>
        </p>
      )}
    </div>
  );
}

export default function ToiSeul({ vue, reference, cle, recharger }) {
  const affiche = valeursAffichees(vue);
  const [saisi, setSaisi] = useState(affiche);
  const [modifie, setModifie] = useState(false);
  const [jobId, setJobId] = useState("");
  const [etat, setEtat] = useState(""); // "", "refait", message d'erreur
  const fige = vue.fige;
  const segments = vue.plan?.segments ?? [];
  const nomsDesPostes = Object.fromEntries((vue.assistance ?? []).map((a) => [a.index, a.name]));
  const postes = (vue.plan?.crew ?? []).map((c) => ({ ...c, nom: nomsDesPostes[c.aid_index] ?? `ravitaillement ${c.aid_index}` }));
  const annexe = vue.annexe ?? {};
  const jumeau = annexe.jumeau ?? {};
  const textes = annexe.textes ?? {};
  const p = vue.prediction ?? {};

  const lire = useCallback((id) => lireLAmendement(reference, cle, id), [reference, cle]);
  const job = useJob(
    jobId,
    useCallback(
      (fini) => {
        setJobId("");
        if (fini.statut === "fini") {
          setEtat("refait");
          setModifie(false);
          void recharger();
        } else {
          setEtat(fini.erreur || "Les documents n'ont pas pu se refaire.");
        }
      },
      [recharger],
    ),
    lire,
  );

  const changer = (champ, cleChamp, valeur) => {
    setSaisi((s) => ({ ...s, [champ]: { ...s[champ], [cleChamp]: valeur } }));
    setModifie(true);
    setEtat("");
  };

  const champDArret = (s, unite) => (
    <ChampCompact
      label={`Arrêt à ${s.to}, en minutes`}
      masquerEtiquette
      enTableau
      unite={unite}
      type="number"
      min="0"
      max="180"
      inputMode="numeric"
      value={saisi.arrets[s.index] ?? ""}
      disabled={fige}
      onChange={(e) => changer("arrets", s.index, e.target.value)}
    />
  );
  const estOuvert = (s) => postes.some((c) => c.aid_index === s.index);

  const refaire = async () => {
    setEtat("");
    try {
      const { job_id: id } = await amender(
        reference,
        cle,
        amendementsDuFormulaire(affiche, saisi, vue.amendements ?? {}),
      );
      setJobId(id);
    } catch (leve) {
      setEtat(leve.message);
    }
  };

  return (
    <section className="flex flex-col gap-10 rounded-xl border border-brand-deep px-5 py-6 sm:px-8 sm:py-8">
      <div>
        <p className={ETIQUETTE}>Toi seul</p>
        <p className="mt-1 text-sm text-brand-soft">Ce qui suit n&rsquo;est pas au lien de partage.</p>
        {fige ? null : (
          <p className="mt-3 text-sm leading-relaxed text-brand-text">
            Tu peux amender jusqu&rsquo;au départ, {departLisible(vue.depart_le).replace(" · ", " à ")}. Ensuite,
            les documents se figent.
          </p>
        )}
      </div>

      <div>
        <TitreDeSection sous={vue.plan?.stops_policy?.sentence ? `${vue.plan.stops_policy.sentence}. Tes arrêts sont à toi : changes-en un, puis refais tes documents.` : ""}>
          Le tableau de marche, et tes arrêts
        </TitreDeSection>
        <div className="mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-etiquette text-brand-muted">
                <th className="px-2 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Vers</th>
                <th className="px-2 py-2 text-right font-semibold">km</th>
                <th className="hidden px-2 py-2 text-right font-semibold md:table-cell">D+</th>
                <th className="hidden px-2 py-2 text-right font-semibold md:table-cell">D−</th>
                <th className="hidden px-2 py-2 text-right font-semibold md:table-cell">Allure</th>
                <th className="px-2 py-2 text-right font-semibold">{duree(p.plan_low_h)}</th>
                <th className="px-2 py-2 text-right font-semibold text-brand-text">{duree(p.central_h)}</th>
                <th className="px-2 py-2 text-right font-semibold">{duree(p.plan_high_h)}</th>
                <th className="px-2 py-2 text-right font-semibold">Arrêt</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s, i) => {
                const dernier = i === segments.length - 1;
                return (
                  <tr key={s.index} className={`border-t border-brand-grid border-l-4 ${estOuvert(s) ? "border-l-brand-accent" : "border-l-transparent"}`}>
                    <td className="whitespace-nowrap px-2 py-1.5 text-brand-muted">
                      {s.night ? <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-text align-middle" title="segment de nuit" /> : null}
                      {s.index}
                    </td>
                    <td className="px-2 py-1.5 text-brand-text">
                      {s.to}
                      {s.consigne ? <span className="block text-xs text-brand-muted">{s.consigne}</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{nombre(s.off1, 1)}</td>
                    <td className="hidden px-2 py-1.5 text-right tabular-nums text-brand-soft md:table-cell">{nombre(s.dplus_m)}</td>
                    <td className="hidden px-2 py-1.5 text-right tabular-nums text-brand-soft md:table-cell">{nombre(s.dminus_m)}</td>
                    <td className="hidden px-2 py-1.5 text-right tabular-nums text-brand-soft md:table-cell">{allure(s.pace_min_km)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-brand-soft">{s.arr_lo_clock || "—"}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-brand-text">{s.arr_clock || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-brand-soft">{s.arr_hi_clock || "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {dernier ? <span className="text-xs text-brand-muted">arrivée</span> : champDArret(s)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 sm:hidden">
          <p className="text-xs text-brand-muted">
            Arrivées en {duree(p.plan_low_h)} · <span className="font-semibold text-brand-text">{duree(p.central_h)}</span> ·{" "}
            {duree(p.plan_high_h)}
          </p>
          <ol className="mt-2 flex list-none flex-col gap-2 p-0">
            {segments.map((s, i) => {
              const dernier = i === segments.length - 1;
              return (
                <li
                  key={s.index}
                  className={`rounded-lg border border-brand-hairline border-l-4 bg-brand-paper px-3 py-2.5 ${
                    estOuvert(s) ? "border-l-brand-accent" : ""
                  }`}
                >
                  <p className="m-0 flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-brand-text">
                      <span className="whitespace-nowrap text-brand-muted">
                        {s.night ? <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-text align-middle" title="segment de nuit" /> : null}
                        {s.index}
                      </span>{" "}
                      {s.to}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-brand-muted">km {nombre(s.off1, 1)}</span>
                  </p>
                  {s.consigne ? <p className="m-0 mt-0.5 text-xs text-brand-muted">{s.consigne}</p> : null}
                  <div className="mt-2 grid grid-cols-3 gap-2 whitespace-nowrap text-sm tabular-nums">
                    <span className="text-brand-soft">{s.arr_lo_clock || "—"}</span>
                    <span className="text-center font-semibold text-brand-text">{s.arr_clock || "—"}</span>
                    <span className="text-right text-brand-soft">{s.arr_hi_clock || "—"}</span>
                  </div>
                  {dernier ? null : (
                    <div className="mt-2 flex items-center justify-between gap-3 border-t border-brand-grid pt-2 text-xs text-brand-muted">
                      <span>Ton arrêt ici</span>
                      {champDArret(s, "min")}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-brand-muted">
          Les trois colonnes sont titrées par leur heure d&rsquo;arrivée : repère tôt celle qui te correspond et
          suis-la. Entre la première et la dernière, une course sur deux. Filet ambre : ravitaillement ouvert à ton
          assistance ; point d&rsquo;encre : segment de nuit.
        </p>
      </div>

      <div>
        <TitreDeSection sous="Une ligne par poste ouvert. Elle s'imprime sur la fiche du poste et dans la colonne « à prévoir ».">
          Ce que ton assistance prépare, et où
        </TitreDeSection>
        <div className="mt-4 flex flex-col gap-3">
          {postes.length ? (
            postes.map((c) => (
              <Field
                key={c.aid_index}
                label={c.nom}
                name={`note-${c.aid_index}`}
                value={saisi.notes[c.aid_index] ?? ""}
                disabled={fige}
                placeholder="frontale, veste chaude, bidons…"
                onChange={(e) => changer("notes", c.aid_index, e.target.value)}
              />
            ))
          ) : (
            <p className="text-sm text-brand-muted">La course ne déclare aucun poste d&rsquo;assistance.</p>
          )}
        </div>
      </div>

      <div>
        <TitreDeSection sous="Tes débits par heure de course. Sans eux, les colonnes eau et ravito de la feuille restent vides.">
          Ce que tu bois et manges
        </TitreDeSection>
        <div className="mt-4 grid max-w-md grid-cols-2 gap-4">
          <Field
            label="l d'eau par heure"
            name="eau"
            type="number"
            step="0.1"
            min="0"
            max="3"
            value={saisi.nutrition.eau_l_h ?? ""}
            disabled={fige}
            onChange={(e) => changer("nutrition", "eau_l_h", e.target.value)}
          />
          <Field
            label="g de glucides par heure"
            name="glucides"
            type="number"
            step="5"
            min="0"
            max="200"
            value={saisi.nutrition.glucides_g_h ?? ""}
            disabled={fige}
            onChange={(e) => changer("nutrition", "glucides_g_h", e.target.value)}
          />
        </div>
      </div>

      <div>
        <TitreDeSection>Une autre modification</TitreDeSection>
        <div className="mt-4">
          <Demande reference={reference} cle={cle} demandes={vue.demandes ?? []} />
        </div>
      </div>

      <div>
        <TitreDeSection>Ton jumeau</TitreDeSection>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            [nombre(jumeau.vc_kmh, 1, "km/h"), textes.vc || "Ta vitesse critique : celle que tu tiens des heures sans que la fatigue s'emballe."],
            [jumeau.endurance_E ? `E = ${nombre(jumeau.endurance_E, 2)}` : "—", textes.endurance || "Ton endurance : la baisse de ton allure quand la course s'allonge."],
            [nombre(jumeau.durability_pct, 0, "%"), textes.durabilite || "Ta durabilité : ce que tu perds après plusieurs heures, à effort cardiaque égal."],
          ].map(([valeur, texte]) => (
            <div key={texte}>
              <dt className="font-heading text-[26px] font-light text-brand-text">{valeur}</dt>
              <dd className="m-0 mt-1 text-sm leading-relaxed text-brand-soft">{texte}</dd>
            </div>
          ))}
        </dl>
      </div>

      {textes.honnetete || textes.validation ? (
        <div>
          <TitreDeSection>Tes courses passées</TitreDeSection>
          {textes.honnetete ? <p className="mt-4 text-sm leading-relaxed text-brand-text">{textes.honnetete}</p> : null}
          {textes.validation ? <p className="mt-2 text-sm leading-relaxed text-brand-soft">{textes.validation}</p> : null}
        </div>
      ) : null}

      {!fige && (modifie || jobId || etat) ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-full border border-brand-hairline bg-brand-paper px-5 py-3 shadow-card" role="status">
          <p className="m-0 flex-1 text-sm text-brand-text">
            {jobId
              ? job?.avancement
                ? `Tes documents se refont : ${job.avancement}.`
                : "Tes documents se refont."
              : etat === "refait"
                ? `Documents refaits, à jour de tes réglages. La version ${vue.version} reste la même.`
                : etat || "Des réglages ont changé : rapport, feuille et fiches se refont avec eux."}
          </p>
          {modifie && !jobId ? (
            <Button size="sm" onClick={refaire}>
              Refaire mes documents
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

