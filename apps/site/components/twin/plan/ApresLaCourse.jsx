// components/twin/plan/ApresLaCourse.jsx
//
// APRÈS LA COURSE : le temps de l'athlète, contre ce que le plan annonçait.
//
// Le temps officiel se saisit en heures et minutes, comme sur le classement. Une fois
// saisi, la page montre le prédit, le réel, l'écart, et où le réel se place dans la
// fourchette annoncée. C'est l'entrée du registre du laboratoire, sous pseudonyme.

"use client";

import { useState } from "react";
import { Button, Field } from "@locomotionlab/ui";

import { duree, lireUneDuree, nombre, signe } from "@/lib/twinTableauDeBord.mjs";
import { heureApres, placeDuReel } from "@/lib/twinPlan.mjs";

import { saisirLeResultat } from "./api";
import { ETIQUETTE, TitreDeSection } from "./CadrePartage";

/** La règle : toute sa largeur, ce sont les bornes ; la bande, la fourchette ; le trait
 *  sombre, le prédit ; le trait terracotta, le réel. */
function Regle({ bornes, fourchette, predit, reel }) {
  const [b1, b2] = bornes;
  const x = (h) => `${Math.max(0, Math.min(100, ((h - b1) / (b2 - b1 || 1)) * 100))}%`;
  return (
    <div>
      <div className="relative h-8 rounded-md bg-brand-grid" aria-hidden="true">
        <span
          className="absolute inset-y-0 bg-brand-primary/40"
          style={{ left: x(fourchette[0]), width: `calc(${x(fourchette[1])} - ${x(fourchette[0])})` }}
        />
        <span className="absolute inset-y-0 w-0.5 bg-brand-text" style={{ left: x(predit) }} />
        {reel !== null ? <span className="absolute -inset-y-1 w-1 rounded bg-brand-deep" style={{ left: x(reel) }} /> : null}
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-brand-muted">
        <span>{duree(b1)}</span>
        <span className="hidden sm:inline">{duree(fourchette[0])}</span>
        <span>{duree(predit)}</span>
        <span className="hidden sm:inline">{duree(fourchette[1])}</span>
        <span>{duree(b2)}</span>
      </div>
    </div>
  );
}

export default function ApresLaCourse({ vue, reference, cle, recharger }) {
  const [texte, setTexte] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const p = vue.prediction ?? {};
  const resultat = vue.resultat;
  const reel = resultat?.abandon ? null : (resultat?.officiel_h ?? null);
  const depart = vue.plan?.start_time || vue.depart_le;
  const fourchette = [p.plan_low_h ?? p.interval_low_h, p.plan_high_h ?? p.interval_high_h];
  const bornes = [p.interval_low_h, p.interval_high_h];

  const saisir = async (corps) => {
    setEnvoi(true);
    setMessage("");
    try {
      await saisirLeResultat(reference, cle, corps);
      await recharger();
      setTexte("");
    } catch (leve) {
      setMessage(leve.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-brand-deep px-5 py-6 sm:px-8 sm:py-8">
      <div>
        <p className={ETIQUETTE}>Toi seul</p>
        <p className="mt-1 text-sm text-brand-soft">Ton temps rejoint le registre du laboratoire, sous pseudonyme.</p>
      </div>

      {vue.peut_saisir_le_resultat ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(evenement) => {
            evenement.preventDefault();
            const heures = lireUneDuree(texte);
            if (heures !== null) void saisir({ officiel_h: heures });
          }}
        >
          <Field
            label="Ton temps officiel"
            name="temps"
            placeholder="34h12"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            error={texte && lireUneDuree(texte) === null ? "Heures et minutes, comme sur le classement : 34h12 ou 34:12." : ""}
            className="sm:w-64"
          />
          <Button type="submit" size="sm" loading={envoi} disabled={lireUneDuree(texte) === null}>
            {resultat ? "Corriger" : "Enregistrer"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={envoi} onClick={() => saisir({ abandon: true })}>
            J&rsquo;ai abandonné
          </Button>
        </form>
      ) : resultat?.saisi_par === "labo" ? (
        <p className="text-sm text-brand-muted">Le temps a été saisi par le laboratoire depuis le classement officiel.</p>
      ) : null}
      {message ? <p className="text-sm text-brand-deep-dark">{message}</p> : null}

      {resultat ? (
        resultat.abandon ? (
          <p className="text-sm leading-relaxed text-brand-text">
            Abandon enregistré. Il compte au registre comme tel : il ne se glisse dans aucune moyenne.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className={ETIQUETTE}>Prédit</p>
                <p className="mt-1 font-heading text-[26px] font-light text-brand-text">{duree(p.central_h)}</p>
                <p className="text-xs text-brand-muted">{heureApres(depart, p.central_h)}</p>
              </div>
              <div>
                <p className={ETIQUETTE}>Réel</p>
                <p className="mt-1 font-heading text-[26px] font-light text-brand-deep">{duree(reel)}</p>
                <p className="text-xs text-brand-muted">{heureApres(depart, reel)}</p>
              </div>
              <div>
                <p className={ETIQUETTE}>Écart</p>
                <p className="mt-1 font-heading text-[26px] font-light text-brand-text">
                  {reel >= p.central_h ? "+" : "−"}
                  {duree(Math.abs(reel - p.central_h))}
                </p>
                <p className="text-xs text-brand-muted">
                  {signe((100 * (reel - p.central_h)) / p.central_h)} % du temps prédit
                </p>
              </div>
            </div>
            {bornes[0] !== undefined && bornes[0] !== null ? (
              <Regle bornes={bornes} fourchette={fourchette} predit={p.central_h} reel={reel} />
            ) : null}
            <p className="text-sm leading-relaxed text-brand-soft">
              Ton temps est <strong className="text-brand-text">{placeDuReel(reel, fourchette, bornes)}</strong>. Bande
              bleu-vert : la fourchette de course ; toute la règle : les bornes de sécurité ; trait sombre : le prédit ;
              trait terracotta : toi.
            </p>
            <p className="text-sm leading-relaxed text-brand-text">
              Merci. Ton temps affine les fourchettes des prochains plans, le tien compris. Ton jumeau est déjà là :
              pour la prochaine course, rien à redéposer.
            </p>
          </>
        )
      ) : (
        <p className="text-sm text-brand-soft">
          Une fois saisi : le prédit contre le réel, l&rsquo;écart, et où ton résultat se place dans la fourchette
          annoncée ({nombre(p.plan_low_h, 1)} – {nombre(p.plan_high_h, 1)} h).
        </p>
      )}

      <div className="border-t border-brand-grid pt-5">
        <TitreDeSection>Amendements fermés</TitreDeSection>
        <p className="mt-3 text-sm leading-relaxed text-brand-soft">
          Arrêts, assistance et débits se sont fermés au départ. Ils restent lisibles dans les documents, tels que tu les
          avais réglés.
        </p>
      </div>
    </section>
  );
}
