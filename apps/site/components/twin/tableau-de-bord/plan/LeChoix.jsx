// components/twin/tableau-de-bord/plan/LeChoix.jsx
//
// LA COLONNE « LE CHOIX » de l'écran Plan : la course, le mode, la cible, la politique
// d'arrêts, les notes des postes d'assistance, la nutrition — puis « Lancer ».
//
// Rien ici ne calcule : les chiffres de la politique d'arrêts viennent du moteur
// (`politique_standard`, `arrets_mesures`), qui les lit dans sa configuration et dans
// l'archive de l'athlète.

"use client";

import { Button, Choix, Segments } from "@locomotionlab/ui";

import { NIVEAUX, duree, lireUneDuree, nombre } from "@/lib/twinTableauDeBord.mjs";
import { cibleDeLaFenetre, fenetreDeLaCible } from "@/lib/twinPlan.mjs";

import { ETIQUETTE } from "../Coquille";
import { Case, ChampCourt } from "../editeur/commun";

function minutesEnHeures(minutes) {
  return minutes === null || minutes === undefined ? "—" : duree(minutes / 60);
}

const enClair = (heures) => duree(heures).replace(/\s/g, "");

/** La fenêtre que l'écran montre, lue sur ce qu'il tient : `null` tant qu'elle est incomplète. */
export function fenetreDeLEcran(ecran) {
  return cibleDeLaFenetre(lireUneDuree(ecran.debut), lireUneDuree(ecran.fin));
}

/** Les réglages tels que l'écran les tient : des chaînes, tant qu'on tape. Une fenêtre
 *  jamais choisie se montre telle que le moteur la servirait (`fenetreDefautPct`). */
export function reglagesDeLEcran(reglages, fenetreDefautPct = null) {
  const r = reglages ?? {};
  const fenetre = r.cible_h ? fenetreDeLaCible(r.cible_h, r.tolerance_pct ?? fenetreDefautPct) : null;
  return {
    mode: r.mode || "prediction",
    debut: fenetre ? enClair(fenetre.debut_h) : "",
    fin: fenetre ? enClair(fenetre.fin_h) : "",
    politique_arrets: r.politique_arrets || "standard",
    notes: Object.fromEntries((r.assistance ?? []).map((a) => [a.index, a.note])),
    eau: r.nutrition?.eau_l_h ?? "",
    glucides: r.nutrition?.glucides_g_h ?? "",
  };
}

/** Et ce qui part au moteur. */
export function reglagesPourLeMoteur(ecran) {
  const vers = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));
  const fenetre = ecran.mode === "objectif" ? fenetreDeLEcran(ecran) : null;
  return {
    mode: ecran.mode,
    cible_h: fenetre ? fenetre.cible_h : null,
    tolerance_pct: fenetre ? Math.round(fenetre.tolerance_pct * 10_000) / 10_000 : null,
    politique_arrets: ecran.politique_arrets,
    assistance: Object.entries(ecran.notes)
      .filter(([, note]) => note && note.trim())
      .map(([index, note]) => ({ index: Number(index), note: note.trim() })),
    nutrition: { eau_l_h: vers(ecran.eau), glucides_g_h: vers(ecran.glucides) },
  };
}

export default function LeChoix({
  athlete,
  courses,
  courseId,
  surCourse,
  course,
  ecran,
  changer,
  politique,
  mesure,
  surLancer,
  lancement,
  fige,
}) {
  const postes = (course?.ravitaillements ?? []).filter((r) => r.assistance);
  const fenetre = fenetreDeLEcran(ecran);
  const cibleIllisible = ecran.mode === "objectif" && fenetre === null;

  return (
    <aside className="flex flex-col gap-6 border-r border-brand-hairline bg-brand-paper px-6 py-7">
      <p className={ETIQUETTE}>Le choix</p>

      <div className="text-sm">
        <p className="text-brand-muted">Athlète</p>
        <p className="mt-0.5 font-semibold text-brand-text">
          {athlete?.pseudo || athlete?.prenom || "—"}
          <span className="ml-1 font-normal text-brand-muted">
            · {NIVEAUX[athlete?.niveau?.nom] ?? "niveau à venir"}
          </span>
        </p>
      </div>

      {surCourse ? (
        <Choix
          label="Course"
          valeur={courseId}
          surChange={surCourse}
          invite="Choisis une course…"
          options={courses.map((c) => ({
            valeur: c.id,
            libelle: `${c.nom}${c.edition ? ` · ${c.edition}` : ""}${c.gpx?.nom ? "" : " (sans trace)"}`,
            desactivee: !c.gpx?.nom,
          }))}
        />
      ) : (
        <div className="text-sm">
          <p className="text-brand-muted">Course</p>
          <p className="mt-0.5 font-semibold text-brand-text">
            {course?.nom || "—"}
            {course?.edition ? ` · ${course.edition}` : ""}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-brand-muted">Mode</span>
        <Segments
          etiquette="Mode du plan"
          valeur={ecran.mode}
          surChange={(mode) => changer({ mode })}
          options={[
            { valeur: "prediction", libelle: "Prédiction" },
            { valeur: "objectif", libelle: "Objectif" },
          ]}
        />
        <p className="text-xs leading-relaxed text-brand-muted">
          {ecran.mode === "prediction"
            ? "Le plan suit le jumeau ; la cible n'est qu'un repère."
            : "Le plan se cale sur la fenêtre ; le rapport dit ce qu'elle exige du jumeau."}
        </p>
        {ecran.mode === "objectif" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ChampCourt
                label="Arrivée, au plus tôt"
                type="text"
                placeholder="29h00"
                value={ecran.debut}
                onChange={(v) => changer({ debut: v })}
              />
              <ChampCourt
                label="au plus tard"
                type="text"
                placeholder="31h00"
                value={ecran.fin}
                onChange={(v) => changer({ fin: v })}
              />
            </div>
            <p className={`text-xs leading-relaxed ${cibleIllisible ? "text-brand-deep-dark" : "text-brand-muted"}`}>
              {fenetre
                ? `Le plan se cale sur ${duree(fenetre.cible_h)} ; la fenêtre, ±${nombre(fenetre.tolerance_pct, 1)} % du temps cumulé, s'étale le long du parcours.`
                : "Le mode objectif demande une fenêtre : 29h00 et 31h00, 29:00 et 31:00, ou 29 et 31."}
            </p>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-brand-muted">Politique d&rsquo;arrêts</span>
        <Case
          label="Celle du moteur"
          radio
          name="politique"
          checked={ecran.politique_arrets === "standard"}
          onChange={() => changer({ politique_arrets: "standard" })}
          aide={
            politique
              ? `${nombre(politique.par_point_min)} min par point de passage, ${nombre(politique.par_point_min + politique.bases_en_plus_min)} aux ${politique.bases} bases · ${politique.points} points · ${minutesEnHeures(politique.total_min)} retranchées du temps prédit.`
              : ""
          }
        />
        <Case
          label="Le taux mesuré de l'athlète"
          radio
          name="politique"
          checked={ecran.politique_arrets === "mesuree"}
          onChange={() => changer({ politique_arrets: "mesuree" })}
          aide={
            mesure
              ? `${nombre(mesure.minutes_par_heure, 0)} min par heure de mouvement${
                  mesure.origine === "ultras" ? ` sur ${mesure.n} ultra${mesure.n > 1 ? "s" : ""}` : ", valeur commune faute d'ultras mesurés"
                }.${
                  mesure.total_min !== null && mesure.total_min !== undefined
                    ? ` Sur cette course : ${minutesEnHeures(mesure.total_min)} d'arrêts${
                        politique
                          ? `, soit ${minutesEnHeures(Math.abs(mesure.total_min - politique.total_min))} de ${mesure.total_min >= politique.total_min ? "plus" : "moins"} que la politique`
                          : ""
                      }.`
                    : ""
                }`
              : "Le taux se lit dans la calibration de l'athlète."
          }
        />
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-brand-muted">
          Assistance possible · {postes.length} poste{postes.length > 1 ? "s" : ""}
        </span>
        {postes.map((r) => (
          <ChampCourt
            key={r.index}
            label={r.nom}
            type="text"
            value={ecran.notes[r.index] ?? ""}
            placeholder="ce que l'assistance prépare"
            onChange={(v) => changer({ notes: { ...ecran.notes, [r.index]: v } })}
          />
        ))}
        {postes.length ? null : <p className="text-xs text-brand-muted">La course ne déclare aucun poste d&rsquo;assistance.</p>}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-brand-muted">Nutrition déclarée</span>
        <div className="grid grid-cols-2 gap-3">
          <ChampCourt label="Eau" unite="l/h" step="0.1" value={ecran.eau} onChange={(v) => changer({ eau: v })} />
          <ChampCourt label="Glucides" unite="g/h" step="5" value={ecran.glucides} onChange={(v) => changer({ glucides: v })} />
        </div>
        <p className="text-xs leading-relaxed text-brand-muted">
          Sans les deux, les colonnes eau et ravito de la feuille sortent vides.
        </p>
      </div>

      <Button onClick={surLancer} loading={lancement} disabled={!courseId || cibleIllisible || fige}>
        Lancer
      </Button>
      {fige ? <p className="text-xs text-brand-muted">La course est partie : le plan est figé.</p> : null}
    </aside>
  );
}
