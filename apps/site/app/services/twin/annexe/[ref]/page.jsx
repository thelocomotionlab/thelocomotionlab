// app/services/twin/annexe/[ref]/page.jsx
//
// L'ANNEXE D'UN RAPPORT LOCOMOTION TWIN : tout ce que le PDF ne montre pas.
// Une page par référence, prérendue depuis `public/twin-annexes/<ref>.json`
// (lib/twinAnnexes.mjs) — le fichier `annexe.json` écrit par le moteur.
//
// La référence est le secret : `noindex`, hors navigation, hors plan de site,
// hors recherche. Page fonctionnelle, pas une page de contenu.
import { notFound } from "next/navigation";

import { REF_AUCUNE_ANNEXE, annexeRefParams, getAnnexe } from "@/lib/twinAnnexes.mjs";

import FormulairePlan from "./FormulairePlan";

export const dynamicParams = false;

export function generateStaticParams() {
  return annexeRefParams();
}

export async function generateMetadata({ params }) {
  const { ref } = await params;
  const annexe = ref === REF_AUCUNE_ANNEXE ? null : getAnnexe(ref);
  return {
    title: annexe ? `Annexe – ${annexe.course?.name ?? "rapport Twin"}` : "Annexe de rapport Twin",
    robots: { index: false, follow: false },
  };
}

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";
const LECTURE = "font-sans text-lecture font-lecture leading-lecture [text-wrap:pretty]";

/** Nombre à la française, ou un tiret quand la donnée manque. */
function n(valeur, decimales = 0, unite = "") {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return "—";
  const s = Number(valeur).toFixed(decimales).replace(".", ",");
  return unite ? `${s} ${unite}` : s;
}

/** Heures décimales → « 32 h 26 ». */
function duree(heures) {
  if (heures === null || heures === undefined) return "—";
  const h = Math.floor(heures);
  const m = Math.round((heures - h) * 60);
  return m === 60 ? `${h + 1} h 00` : `${h} h ${String(m).padStart(2, "0")}`;
}

function Section({ titre, enfants, children }) {
  return (
    <section className="mt-12">
      <h2 className="m-0 font-heading text-[22px] font-bold leading-tight text-brand-deep">
        {titre}
      </h2>
      <div className="mt-1.5 h-[3px] w-10 rounded-full bg-brand-accent" aria-hidden="true" />
      <div className="mt-4">{children ?? enfants}</div>
    </section>
  );
}

function Chiffres({ lignes }) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-[18px] gap-y-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      {lignes
        .filter(([, valeur]) => valeur !== null && valeur !== undefined && valeur !== "")
        .map(([libelle, valeur]) => (
          <div key={libelle} className="contents">
            <dt className={`${ETIQUETTE} sm:pt-1`}>{libelle}</dt>
            <dd className={`m-0 ${LECTURE}`}>{valeur}</dd>
          </div>
        ))}
    </dl>
  );
}

function Tableau({ colonnes, lignes }) {
  if (!lignes.length) return null;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-tableau">
        <thead>
          <tr className="bg-brand-primary text-left">
            {colonnes.map((c) => (
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
          {lignes.map((ligne, i) => (
            <tr key={i} className={i % 2 ? "bg-brand-sensations" : "bg-brand-paper"}>
              {ligne.map((cellule, j) => (
                <td
                  key={j}
                  className="border-b border-brand-hairline px-2.5 py-1.5 align-top font-sans tabular-nums text-brand-ink"
                >
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Figure({ src, legende }) {
  if (!src) return null;
  return (
    <figure className="m-0 mt-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- image embarquée dans l'annexe (data:) */}
      <img src={src} alt={legende} className="w-full rounded-[10px] border border-brand-hairline" />
      <figcaption className="mt-2 font-sans text-meta leading-snug text-brand-soft">
        {legende}
      </figcaption>
    </figure>
  );
}

export default async function AnnexePage({ params }) {
  const { ref } = await params;
  const a = ref === REF_AUCUNE_ANNEXE ? null : getAnnexe(ref);
  if (!a) notFound();

  const c = a.course ?? {};
  const p = a.prediction ?? {};
  const j = a.jumeau ?? {};
  const cal = a.calibration ?? {};
  const val = a.validation;
  const plan = a.plan ?? {};
  const t = a.textes ?? {};
  const figures = a.figures ?? {};

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <article className="mx-auto mt-4 max-w-[860px] pb-16">
        <header>
          <div className={ETIQUETTE}>
            Annexe du rapport {a.ref} · {a.version}
          </div>
          <h1 className="mt-3 font-heading text-[30px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-slate-dark md:text-[38px]">
            {c.name}
          </h1>
          <p className={`m-0 mt-3 max-w-[46ch] text-xl font-light leading-snug text-brand-deep-dark ${LECTURE}`}>
            {a.athlete} · {duree(p.central_h)}
          </p>
          <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
          <p className={`m-0 mt-5 max-w-[40em] text-brand-soft ${LECTURE}`}>
            Cette page détaille ce que le rapport résume. Elle ne contient aucune donnée brute
            d&rsquo;activité : des agrégats, des phrases et les figures du rapport. Son adresse
            n&rsquo;est pas publiée — elle ne vaut que pour ce rapport.
          </p>
        </header>

        <Section titre="La suffisance des données">
          {a.verdict?.sellable === false ? (
            <p className={`m-0 max-w-[40em] text-brand-ink ${LECTURE}`}>
              Ce rapport n’est pas vendu en l’état.
            </p>
          ) : null}
          <ul className={`mt-3 max-w-[40em] list-disc pl-5 text-brand-soft ${LECTURE}`}>
            {(a.verdict?.reasons ?? []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Tableau
            colonnes={["Critère", "Niveau", "Valeur", "Détail"]}
            lignes={(a.verdict?.criteria ?? []).map((crit) => [
              crit.name,
              crit.level ?? "non évalué",
              crit.value ?? "—",
              crit.detail,
            ])}
          />
          {a.verdict?.domain ? (
            <p className={`m-0 mt-3 max-w-[40em] text-brand-soft ${LECTURE}`}>
              Garde du domaine : ce parcours de {n(a.verdict.domain.deq_km, 1, "km")} équivalents
              demande environ {n(a.verdict.domain.expected_hours, 1, "h")} à{" "}
              {n(a.verdict.domain.v_ref_kmh, 1, "km/h")}, le seuil étant de{" "}
              {n(a.verdict.domain.threshold_hours, 1, "h")}.
            </p>
          ) : null}
        </Section>

        <Section titre="Le parcours">
          <Chiffres
            lignes={[
              ["Distance", n(c.length_km, 1, "km")],
              ["Dénivelé", `${n(c.dplus_m, 0, "m")} D+ / ${n(c.dminus_m, 0, "m")} D−`],
              ["Distance équivalente à plat", n(c.deq_km, 1, "km")],
              ["Pente moyenne en montée", n(c.pentes?.up_pct, 1, "%")],
              ["Pente moyenne en descente", n(Math.abs(c.pentes?.down_pct), 1, "%")],
              [
                "Part de la distance",
                c.pentes
                  ? `${n(c.pentes.part_up_pct, 0, "%")} en montée, ${n(c.pentes.part_down_pct, 0, "%")} en descente`
                  : null,
              ],
            ]}
          />
          {(c.montees ?? []).length > 0 || (c.descentes ?? []).length > 0 ? (
            <Tableau
              colonnes={["sens", "du km", "au km", "longueur", "dénivelé", "pente"]}
              lignes={[
                ...(c.montees ?? []).map((m) => ["montée", m]),
                ...(c.descentes ?? []).map((m) => ["descente", m]),
              ]
                .sort((a, b) => a[1].from_km - b[1].from_km)
                .map(([sens, m]) => [
                  sens,
                  n(m.from_km, 0),
                  n(m.to_km, 0),
                  n(m.length_km, 1, "km"),
                  n(m.denivele_m, 0, "m"),
                  n(Math.abs(m.grade_pct), 1, "%"),
                ])}
            />
          ) : null}
        </Section>

        <Section titre="La prédiction">
          <Chiffres
            lignes={[
              ["Temps central", duree(p.central_h)],
              [
                "Fourchette de course",
                p.plan_low_h ? `${duree(p.plan_low_h)} – ${duree(p.plan_high_h)} (${p.plan_band_pct} %)` : null,
              ],
              [
                "Bornes de sécurité",
                `${duree(p.interval_low_h)} – ${duree(p.interval_high_h)} (${p.interval_pct} %)`,
              ],
              ["Source des bandes", p.interval_source],
              ["Régime", p.regime_label],
              ["Vitesse ajustée moyenne", n(p.v_kmh, 2, "km/h")],
              ["Part de la vitesse critique", p.vc_fraction ? n(p.vc_fraction * 100, 0, "%") : null],
              ["Dispersion σ", n(p.sigma_kmh, 2, "km/h")],
              ["Écart-type relatif", p.sd_rel ? n(p.sd_rel * 100, 1, "%") : null],
              ["Facteur d’échelle κ", p.scale_kappa ? `${n(p.scale_kappa, 2)} (ν ${n(p.scale_dof, 1)})` : null],
              ["Mouvement / arrêts", p.moving_hours ? `${duree(p.moving_hours)} / ${duree(p.stops_hours)}` : null],
              ["Part de nuit", p.night_share_target ? n(p.night_share_target * 100, 0, "%") : null],
            ]}
          />
          {t.largeur ? <p className={`m-0 mt-4 max-w-[40em] text-brand-ink ${LECTURE}`}>{t.largeur}</p> : null}
          <Figure src={figures.cumul} legende="Temps de passage cumulé et incertitude." />
        </Section>

        <Section titre="Ton jumeau">
          {t.profil ? <p className={`m-0 max-w-[40em] text-brand-ink ${LECTURE}`}>{t.profil}</p> : null}
          <div className="mt-4">
            <Chiffres
              lignes={[
                ["Vitesse critique", j.vc_kmh ? `${n(j.vc_kmh, 2, "km/h")} ± ${n(j.vc_sd_kmh, 2)}` : "non affichée"],
                ["Réserve D′", j.dprime_m ? n(j.dprime_m, 0, "m") : null],
                ["Exposant d’endurance", j.endurance_E ? `E = ${n(j.endurance_E, 3)} (α = ${n(j.alpha, 3)})` : null],
                ["Durabilité", j.durability_pct !== null ? n(j.durability_pct, 1, "% de découplage") : "non chiffrée"],
                ["Efficacité-durée", j.alpha_eff ? n(j.alpha_eff, 3) : null],
                ["Queue de la courbe record", j.alpha_tail ? n(j.alpha_tail, 3) : null],
                [
                  "Coût de pente",
                  j.slope_kappa
                    ? `personnel : montée ×${n(j.slope_kappa[0], 2)}, descente ×${n(j.slope_kappa[1], 2)}`
                    : "loi de Minetti",
                ],
                ["Activités exploitées", `${j.n_activities} (dont ${j.n_ultras} vrais ultras, ${j.n_ultras_hr} avec FC)`],
              ]}
            />
          </div>
          {[t.vc, t.endurance, t.durabilite].filter(Boolean).map((phrase) => (
            <p key={phrase} className={`m-0 mt-4 max-w-[40em] text-brand-ink ${LECTURE}`}>
              {phrase}
            </p>
          ))}
          <Figure src={figures.record} legende="Courbe record ajustée et vitesse critique." />
        </Section>

        <Section titre="La calibration">
          <Chiffres
            lignes={[
              ["Régime", `${cal.regime} (lien ${cal.link})`],
              ["Vrais ultras", `${cal.n_genuine} (n effectif ${n(cal.n_eff, 2)})`],
              ["Coefficients β", cal.beta ? cal.beta.map((b) => n(b, 4)).join(" · ") : null],
              ["Écart-type résiduel", n(cal.sigma_kmh, 3, "km/h")],
              [
                "Prior sur la pente en durée",
                cal.duration_prior
                  ? `${n(cal.duration_prior.b, 3)} (λ ${cal.duration_prior.lambda}, source ${cal.duration_prior.origin})`
                  : null,
              ],
              [
                "Queue de l’enveloppe",
                cal.tail_alpha ? `${n(cal.tail_alpha, 3)} au-delà de ${n(cal.tail_from_h, 0, "h")} (${cal.tail_source})` : null,
              ],
              ["Ultras recalés sur ton niveau actuel", cal.level_n_anchored || null],
              [
                "Modèle d’arrêts",
                cal.stops_rate_min_per_h
                  ? `${cal.stops_model} · ${n(cal.stops_rate_min_per_h, 1, "min par heure de mouvement")} (${cal.stops_rate_origin})`
                  : cal.stops_model,
              ],
              ["Coefficient de nuit", cal.night_coef ? n(cal.night_coef, 4) : null],
            ]}
          />
          <Tableau
            colonnes={["Date", "Durée", "Vitesse ajustée", "Distance", "D+/km", "FC", "Arrêts", "Nuit"]}
            lignes={(cal.ultras ?? []).map((u) => [
              u.date ?? "—",
              duree(u.elapsed_hours ?? u.hours),
              n(u.vga_kmh, 2, "km/h"),
              n(u.dist_km, 1, "km"),
              n(u.dplus_per_km, 0, "m"),
              u.avg_hr ? n(u.avg_hr, 0) : "—",
              u.stops_h !== null && u.stops_h !== undefined ? duree(u.stops_h) : "—",
              u.night_share !== null && u.night_share !== undefined ? n(u.night_share * 100, 0, "%") : "—",
            ])}
          />
          {(cal.notes ?? []).length ? (
            <ul className={`mt-4 max-w-[40em] list-disc pl-5 text-brand-soft ${LECTURE}`}>
              {cal.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </Section>

        {a.pente?.servie || a.pente?.cout_personnel ? (
          <Section titre="La pente au-delà de six heures">
            {[a.pente.servie, a.pente.cout_personnel].filter(Boolean).map((phrase) => (
              <p key={phrase} className={`m-0 mt-2 max-w-[40em] text-brand-ink ${LECTURE}`}>
                {phrase}
              </p>
            ))}
          </Section>
        ) : null}

        <Section titre="La validation croisée">
          {val ? (
            <>
              <Chiffres
                lignes={[
                  ["Erreur moyenne", `${n(val.mae_pct, 1, "%")} sur ${val.n} ultras`],
                  ["Erreur quadratique", n(val.rmse_pct, 1, "%")],
                  [
                    "Interpolation / extrapolation",
                    val.mae_interpolation_pct !== null
                      ? `${n(val.mae_interpolation_pct, 1, "%")} (${val.n_interpolation}) / ${
                          val.mae_extrapolation_pct !== null ? n(val.mae_extrapolation_pct, 1, "%") : "—"
                        } (${val.n_extrapolation})`
                      : null,
                  ],
                ]}
              />
              <Tableau
                colonnes={["Date", "Temps réel", "Prédit sans lui", "Écart"]}
                lignes={(val.points ?? []).map((pt) => [
                  pt.date ?? "—",
                  duree(pt.reel_h),
                  duree(pt.predit_h),
                  `${pt.erreur_pct > 0 ? "+" : ""}${n(pt.erreur_pct, 1, "%")}`,
                ])}
              />
              {t.validation ? (
                <p className={`m-0 mt-4 max-w-[40em] text-brand-ink ${LECTURE}`}>{t.validation}</p>
              ) : null}
              <Figure src={figures.validation} legende="Chaque ultra passé, prédit sans lui-même." />
            </>
          ) : (
            <p className={`m-0 max-w-[40em] text-brand-ink ${LECTURE}`}>
              Moins de trois vrais ultras : la validation croisée n&rsquo;est pas calculable, et la
              prédiction repose sur une extrapolation.
            </p>
          )}
        </Section>

        <Section titre="Personnaliser ton tableau">
          <p className={`m-0 ${LECTURE}`}>
            Le temps que tu comptes passer à chaque ravitaillement, ce que tu veux lire sur
            chaque portion, tes débits de boisson et de sucre, ce que ton assistance prépare :
            règle-les ici. Les heures de passage se recalculent à mesure. Tu peux imprimer le
            tableau tel quel, ou récupérer tes réglages pour que le moteur les reprenne au
            prochain rendu du PDF.
          </p>
          <FormulairePlan plan={a.plan} course={a.course} assistance={a.assistance} />
        </Section>

        <Section titre="Le plan complet">
          <Chiffres
            lignes={[
              ["Ancre", plan.anchor === "target" ? `objectif (${duree(plan.anchor_hours)})` : "prédiction"],
              ["Mouvement / arrêts / horloge", `${duree(plan.t_move_h)} / ${duree(plan.t_stops_h)} / ${duree(plan.t_clock_h)}`],
              ["Arrêts", plan.stops_policy?.sentence],
              [
                "Taux d’arrêt du plan",
                plan.stops
                  ? `${n(plan.stops.rate_min_per_h, 0, "min par heure de mouvement")}${
                      plan.stops.measured ? ` (mesuré sur ${plan.stops.n} de tes ultras)` : ""
                    }`
                  : null,
              ],
              [
                "Nuit",
                plan.nuit?.sections?.length
                  ? plan.nuit.sections
                      .map((s) => `km ${s.from_km} → ${s.to_km}`)
                      .join(" ; ") + ` — ${plan.nuit.heures} (${plan.nuit.part_pct} %)`
                  : null,
              ],
              ["Dérive", `−${plan.fade_pct} % du début à la fin (${plan.fade_source_used})`],
              ["Preuve de la dérive", plan.fade_evidence],
              ["Soleil", plan.sun?.sunrise ? `lever ${plan.sun.sunrise}, coucher ${plan.sun.sunset}` : null],
            ]}
          />
          <Tableau
            colonnes={["#", "Vers", "km", "D+", "Deq", "v. ajustée", "Allure", "Arrivée", "Fenêtre", "Consigne"]}
            lignes={(plan.segments ?? []).map((s) => [
              s.index,
              s.to,
              n(s.off1, 1),
              n(s.dplus_m, 0),
              n(s.deq_km, 1),
              n(s.v_ga_kmh, 2),
              n(s.pace_min_km, 2),
              s.arr_clock ?? duree(s.cum_clock_h),
              s.arr_lo_clock ? `${s.arr_lo_clock} – ${s.arr_hi_clock}` : `${duree(s.lo_h)} – ${duree(s.hi_h)}`,
              s.consigne,
            ])}
          />
          <Figure src={figures.pacing} legende="Vitesse ajustée cible et allure réelle par segment." />
        </Section>

        <Section titre="L’assistance">
          <Tableau
            colonnes={["Point", "km", "Au plus tôt", "Central", "Au plus tard", "Arrêt"]}
            lignes={[...(a.assistance ?? []), ...(a.arrivee ? [a.arrivee] : [])].map((pt) => [
              pt.is_finish ? "Arrivée" : pt.name,
              n(pt.km, 1),
              pt.earliest_clock,
              pt.central_clock,
              pt.latest_clock,
              pt.is_finish ? "—" : n(pt.stop_min, 0, "min"),
            ])}
          />
          <p className={`m-0 mt-3 max-w-[40em] text-brand-soft ${LECTURE}`}>
            Aux points d&rsquo;assistance, les bornes sont la fourchette de course ; pour
            l&rsquo;arrivée, ce sont les bornes de sécurité — de la logistique, pas un objectif.
          </p>
        </Section>

        <Section titre="Ce que ce rapport ne sait pas">
          <p className={`m-0 max-w-[40em] text-brand-ink ${LECTURE}`}>{t.honnetete}</p>
          <ul className={`mt-4 max-w-[40em] list-disc pl-5 text-brand-soft ${LECTURE}`}>
            {(t.limites ?? []).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <h3 className={`mt-6 ${ETIQUETTE}`}>Ce que le plan suppose</h3>
          <ul className={`mt-2 max-w-[40em] list-disc pl-5 text-brand-soft ${LECTURE}`}>
            {(t.hypotheses ?? []).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Section>

        {(t.strategie ?? []).length ? (
          <Section titre="Stratégie de course">
            <dl className="m-0">
              {t.strategie.map((item) => (
                <div key={item.titre} className="mt-3">
                  <dt className="m-0 font-heading text-[15px] font-semibold text-brand-slate-dark">
                    {item.titre}
                  </dt>
                  <dd className={`m-0 mt-1 max-w-[40em] text-brand-ink ${LECTURE}`}>{item.corps}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        <Section titre="Glossaire">
          <dl className="m-0 grid grid-cols-1 gap-x-[18px] gap-y-3 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            {(a.glossaire ?? []).map((g) => (
              <div key={g.terme} className="contents">
                <dt className={`${ETIQUETTE} sm:pt-1`}>{g.terme}</dt>
                <dd className={`m-0 ${LECTURE}`}>{g.definition}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section titre="Références">
          <ol className={`m-0 list-decimal pl-5 text-brand-soft ${LECTURE}`}>
            {(a.references ?? []).map((r) => (
              <li key={r.key} className="mt-1">
                {r.author}
                {r.author ? ", " : ""}
                <em>{r.title}</em>
                {r.where ? `, ${r.where}` : ""}
                {r.year ? `, ${r.year}` : ""}
                {r.doi ? (
                  <>
                    {" "}
                    <a href={`https://doi.org/${r.doi}`} className="text-brand-slate-dark">
                      doi:{r.doi}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>

        <p className="mt-12 font-mono text-meta text-brand-faint">
          Annexe générée le {a.genere_le} · moteur {a.version} · référence {a.ref}
        </p>
      </article>
    </div>
  );
}
