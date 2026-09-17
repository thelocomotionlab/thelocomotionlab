"use client";

// PERSONNALISER SON TABLEAU DE MARCHE, depuis l'annexe du rapport.
//
// La page est prérendue et ne peut rien écrire : ce formulaire travaille dans le navigateur.
// Il recalcule les heures de passage à chaque changement d'arrêt — avec la règle d'arrêts du
// moteur (lib/twinTableauMarche.js), pour que ce qui s'affiche ici soit ce que le prochain
// PDF imprimera — et rend deux choses : le tableau à imprimer tel quel, et le fragment de
// spec à recoller dans le JSON de course pour que le moteur reprenne ces réglages.
//
// Ce qui se règle : le temps d'arrêt et la recommandation de chaque portion, les débits de
// nutrition, et ce que l'assistance doit préparer. Rien n'est deviné : un champ vide garde
// la valeur du rapport.

import { useMemo, useState } from "react";

import { depart, duree, heure, nombre, recalcule } from "@/lib/twinTableauMarche.js";

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";
const CHAMP =
  "w-full rounded-[6px] border border-brand-hairline bg-brand-paper px-2 py-1 " +
  "font-sans text-tableau text-brand-ink outline-none focus:border-brand-accent-ink";
const BOUTON =
  "rounded-[8px] border border-brand-hairline bg-brand-paper px-3.5 py-2 font-sans " +
  "text-meta font-semibold text-brand-deep hover:border-brand-accent-ink";

/** N'imprimer que le tableau : la règle d'impression vit dans app/globals.css. */
function imprimer() {
  const fin = () => {
    document.body.classList.remove("impression-tableau");
    window.removeEventListener("afterprint", fin);
  };
  window.addEventListener("afterprint", fin);
  document.body.classList.add("impression-tableau");
  window.print();
}

/** Minutes → « +20 min » / « −5 min ». */
function ecartMin(minutes) {
  const m = Math.round(minutes);
  return `${m > 0 ? "+" : "−"}${Math.abs(m)} min`;
}

export default function FormulairePlan({ plan, course, assistance }) {
  const segments = useMemo(() => plan?.segments ?? [], [plan]);
  const points = useMemo(() => assistance ?? [], [assistance]);
  const reglesServis = useMemo(() => plan?.reglages ?? [], [plan]);
  const dep = depart(course?.start_time);
  const modele = plan?.stops_model ?? "carved";
  // le temps que le rapport répartit : la prédiction, ou l'objectif en mode cible
  const horlogeMin = 60 * (plan?.anchor_hours ?? plan?.t_clock_h ?? 0);

  // l'état part de ce que le moteur a servi : on personnalise, on ne repart pas de zéro
  const [arrets, setArrets] = useState(() => segments.map((s) => String(s.stop_min ?? 0)));
  const [consignes, setConsignes] = useState(() => segments.map((s) => s.consigne ?? ""));
  const [eau, setEau] = useState(() => String(plan?.nutrition?.water_l_per_h ?? ""));
  const [glucides, setGlucides] = useState(() => String(plan?.nutrition?.carbs_g_per_h ?? ""));
  const [notes, setNotes] = useState(() =>
    Object.fromEntries((assistance ?? []).map((p) => [p.index, p.note ?? ""])),
  );

  // Les réglages ÉCRITS, ceux que le moteur retiendra tels quels : ceux que la spec portait
  // déjà, plus ceux qu'on pose ici. La liste sort entière — recoller un fragment partiel
  // effacerait les réglages qu'on n'a pas touchés.
  const reglages = useMemo(() => {
    const deja = new Map(reglesServis.map((r) => [r.aid_index, r]));
    return segments
      .map((s, i) => {
        const ancien = deja.get(s.index) ?? {};
        const saisi = nombre(arrets[i]);
        const consigne = (consignes[i] ?? "").trim();
        const stop =
          saisi !== null && Math.round(saisi) !== Math.round(s.stop_min ?? 0)
            ? Math.round(saisi)
            : (ancien.stop_min ?? null);
        const dit = consigne !== (s.consigne ?? "").trim() ? consigne : (ancien.consigne ?? "");
        if (stop === null && !dit) return null;
        return { aid_index: s.index, ...(stop === null ? {} : { stop_min: stop }),
                 ...(dit ? { consigne: dit } : {}) };
      })
      .filter(Boolean);
  }, [segments, reglesServis, arrets, consignes]);

  const figes = useMemo(() => {
    const ecrits = new Set(reglages.filter((r) => r.stop_min !== undefined).map((r) => r.aid_index));
    return segments.map((s) => ecrits.has(s.index));
  }, [segments, reglages]);

  const calcul = useMemo(
    () => recalcule({ segments, arrets, figes, modele, horlogeMin }),
    [segments, arrets, figes, modele, horlogeMin],
  );

  const debits = { eau: nombre(eau), glucides: nombre(glucides) };
  const parHeure = (debit) => (debit === null ? null : (debit * calcul.arrivee) / 60);

  /** Le fragment de spec à recoller dans le JSON de course. */
  const spec = useMemo(() => {
    // « crew » déclare AUSSI où l'assistance est autorisée : dès qu'une note change, la liste
    // sort entière, sinon la recoller retirerait les points qu'on n'a pas touchés
    const crew = points.map((p) => ({ aid_index: p.index, note: (notes[p.index] ?? "").trim() }));
    const crewChange = points.some(
      (p) => (notes[p.index] ?? "").trim() !== (p.note ?? "").trim());
    const servi = plan?.nutrition ?? null;
    const nutritionChange =
      debits.eau !== null && debits.glucides !== null &&
      (servi === null || servi.water_l_per_h !== debits.eau ||
       servi.carbs_g_per_h !== debits.glucides);
    const memeQuAvant =
      reglages.length === reglesServis.length &&
      reglages.every((r) => {
        const a = reglesServis.find((x) => x.aid_index === r.aid_index);
        return a && (a.stop_min ?? null) === (r.stop_min ?? null) &&
          (a.consigne ?? "") === (r.consigne ?? "");
      });

    const out = {};
    if (!memeQuAvant) out.reglages = reglages;
    if (crewChange) out.crew = crew;
    if (nutritionChange) {
      out.nutrition = { water_l_per_h: debits.eau, carbs_g_per_h: debits.glucides };
    }
    return out;
  }, [reglages, reglesServis, points, notes, plan, debits.eau, debits.glucides]);

  const vide = Object.keys(spec).length === 0;

  function telecharger() {
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reglages-course.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!segments.length) return null;

  // ce que le moteur fera de ces arrêts : la règle dépend du modèle d'arrêts du rapport
  const consequence =
    Math.round(calcul.ecart) === 0
      ? "C’est le plan du rapport, à la minute près."
      : modele === "spec"
        ? `Tes arrêts pèsent ${ecartMin(calcul.ecart)} par rapport au plan du rapport : ils
           s’ajoutent au mouvement prédit, l’arrivée recule d’autant.`
        : modele === "personal"
          ? `Tes arrêts pèsent ${ecartMin(calcul.ecart)} de plus que ce que tu poses ailleurs :
             ton budget d’arrêts vient de tes courses passées, ce que tu écris ici est retenu
             tel quel et le reste se répartit sur les autres ravitaillements.`
          : `Tes arrêts pèsent ${ecartMin(calcul.ecart)} par rapport au plan du rapport, qui
             répartit le temps prédit : c’est autant de moins en mouvement, donc un peu plus
             vite entre les ravitaillements.`;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={ETIQUETTE}>Eau (L par heure)</span>
          <input
            className={`mt-1 ${CHAMP}`}
            inputMode="decimal"
            placeholder="non déclaré"
            value={eau}
            onChange={(e) => setEau(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={ETIQUETTE}>Glucides (g par heure)</span>
          <input
            className={`mt-1 ${CHAMP}`}
            inputMode="decimal"
            placeholder="non déclaré"
            value={glucides}
            onChange={(e) => setGlucides(e.target.value)}
          />
        </label>
        <div className="block">
          <span className={ETIQUETTE}>Sur toute la course</span>
          <p className="m-0 mt-1 font-sans text-tableau text-brand-ink">
            {debits.eau !== null && debits.glucides !== null
              ? `${parHeure(debits.eau).toFixed(1).replace(".", ",")} L et ${Math.round(
                  parHeure(debits.glucides),
                )} g`
              : "déclare les deux débits pour obtenir les totaux"}
          </p>
        </div>
      </div>

      <div className="zone-impression mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-tableau">
          <thead>
            <tr className="bg-brand-primary text-left">
              {["#", "Ravitaillement", "km", "arrêt (min)", "prévu", "Sur ce segment"].map((c) => (
                <th
                  key={c}
                  className="px-2.5 py-1.5 font-heading text-xxs font-bold uppercase tracking-etiquette text-brand-bg"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calcul.lignes.map((l, i) => (
              <tr key={l.index} className="bg-brand-paper">
                <td className="border-b border-brand-hairline px-2.5 py-1.5 tabular-nums text-brand-ink">
                  {l.index}
                  {l.night ? <span className="ml-1 text-brand-slate">•</span> : null}
                </td>
                <td className="border-b border-brand-hairline px-2.5 py-1.5 text-brand-ink">
                  {l.to}
                </td>
                <td className="border-b border-brand-hairline px-2.5 py-1.5 tabular-nums text-brand-ink">
                  {String(l.km ?? l.off1 ?? "").replace(".", ",")}
                </td>
                <td className="border-b border-brand-hairline px-1.5 py-1">
                  <input
                    className={`${CHAMP} w-[76px] text-center tabular-nums`}
                    inputMode="numeric"
                    aria-label={`Arrêt à ${l.to}`}
                    value={arrets[i]}
                    onChange={(e) => {
                      const v = [...arrets];
                      v[i] = e.target.value;
                      setArrets(v);
                    }}
                  />
                </td>
                <td className="border-b border-brand-hairline px-2.5 py-1.5 font-semibold tabular-nums text-brand-ink">
                  {heure(dep, l.cumul)}
                </td>
                <td className="border-b border-brand-hairline px-1.5 py-1">
                  <input
                    className={CHAMP}
                    aria-label={`Recommandation pour ${l.to}`}
                    placeholder="ce que tu veux lire ici"
                    value={consignes[i]}
                    onChange={(e) => {
                      const v = [...consignes];
                      v[i] = e.target.value;
                      setConsignes(v);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 mt-3 font-sans text-meta leading-snug text-brand-soft">
        Mouvement {duree(calcul.mouvementTotal)} + arrêts {duree(calcul.arretsTotal)} = arrivée{" "}
        <strong className="text-brand-ink">{duree(calcul.arrivee)}</strong>
        {dep ? ` (${heure(dep, calcul.arrivee)})` : ""}. {consequence}
      </p>

      {points.length > 0 && (
        <div className="mt-6">
          <h3 className="m-0 font-heading text-[17px] font-bold text-brand-deep">
            Ce que l’assistance prépare
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {points.map((p) => (
              <label key={p.index} className="block">
                <span className={ETIQUETTE}>
                  {p.name} · km {String(p.km).replace(".", ",")}
                </span>
                <input
                  className={`mt-1 ${CHAMP}`}
                  placeholder="bidons, soupe, frontale…"
                  value={notes[p.index] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [p.index]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className={BOUTON} onClick={imprimer}>
          Imprimer ce tableau
        </button>
        <button type="button" className={BOUTON} onClick={telecharger} disabled={vide}>
          Télécharger mes réglages
        </button>
        <span className="font-sans text-meta text-brand-soft">
          {vide
            ? "Rien de modifié pour l’instant."
            : "À recoller dans le JSON de course, puis relancer le rendu pour un PDF à jour."}
        </span>
      </div>

      {!vide && (
        <pre className="mt-3 overflow-x-auto rounded-[10px] border border-brand-hairline bg-brand-paper p-3 font-mono text-xxs leading-snug text-brand-ink">
          {JSON.stringify(spec, null, 2)}
        </pre>
      )}
    </div>
  );
}
