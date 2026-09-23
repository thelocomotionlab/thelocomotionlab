// components/twin/tableau-de-bord/plan/PublierEnvoyer.jsx
//
// LA COLONNE DE DROITE de l'écran Plan : publier, envoyer, revenir à une version,
// répondre aux demandes, saisir le résultat.
//
// Deux gestes distincts, dans cet ordre : « Publier » ouvre la page de l'athlète à ses
// deux liens et n'envoie rien ; « Envoyer » part par email, le PDF joint. Rien ne part
// sans ce second clic.

"use client";

import { useState } from "react";
import { BoutonTexte, Button, Field } from "@locomotionlab/ui";
import { BadgeEtat } from "@locomotionlab/ui/contenu";

import { departLisible, duree, jourLisible, lireUneDuree } from "@/lib/twinTableauDeBord.mjs";

import { appeler } from "../api";
import { ETIQUETTE, lienVers } from "../Coquille";

/** Le mot d'accompagnement, prêt à être relu. `{lien}` et `{lien_partage}` sont
 *  remplacés par le moteur au moment d'envoyer. */
export function emailParDefaut({ prenom, course }) {
  return {
    objet: `Ton plan de course — ${course}`,
    corps: [
      `Salut ${prenom || ""},`.replace(" ,", ","),
      "",
      "Ton plan est prêt. En pièce jointe, le PDF : le rapport, la feuille de marche à découper et les fiches d'assistance. Ta page, à garder sur ton téléphone la veille du départ :",
      "",
      "{lien}",
      "",
      "Tu peux y régler tes arrêts, ce que ton assistance prépare, et refaire tes documents. Le reste se demande depuis la page.",
      "",
      "Le lien à donner à ton assistance, qui ne montre que ce qui la concerne :",
      "",
      "{lien_partage}",
      "",
      "Bonne course.",
    ].join("\n"),
  };
}

function Copier({ texte, libelle }) {
  const [copie, setCopie] = useState(false);
  return (
    <BoutonTexte
      className="text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setCopie(true);
          setTimeout(() => setCopie(false), 2000);
        } catch {
          /* le presse-papiers refusé : le lien reste lisible juste au-dessus */
        }
      }}
    >
      {copie ? "copié" : libelle}
    </BoutonTexte>
  );
}

function Section({ titre, children }) {
  return (
    <section className="flex flex-col gap-3 border-t border-brand-grid pt-5 first:border-t-0 first:pt-0">
      <p className={ETIQUETTE}>{titre}</p>
      {children}
    </section>
  );
}

function Demande({ demande, recharger }) {
  const [reponse, setReponse] = useState("");
  const [message, setMessage] = useState("");
  if (demande.statut !== "ouverte") {
    return (
      <li className="text-sm">
        <p className="text-brand-text">« {demande.quoi} »</p>
        <p className="text-xs text-brand-muted">Répondue le {jourLisible(demande.repondue_le)} : {demande.reponse}</p>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 text-sm">
      <p className="text-brand-text">« {demande.quoi} »</p>
      {demande.pourquoi ? <p className="text-xs text-brand-soft">{demande.pourquoi}</p> : null}
      <Field
        as="textarea"
        rows={3}
        label="Ta réponse"
        name={`reponse-${demande.id}`}
        value={reponse}
        onChange={(e) => setReponse(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!reponse.trim()}
        onClick={async () => {
          setMessage("");
          try {
            await appeler(`/requests/${encodeURIComponent(demande.id)}/answer`, {
              methode: "POST",
              corps: { reponse },
            });
            await recharger();
          } catch (leve) {
            setMessage(leve.message);
          }
        }}
      >
        Répondre par email
      </Button>
      {message ? <p className="text-xs text-brand-deep-dark">{message}</p> : null}
    </li>
  );
}

export default function PublierEnvoyer({ vue, recharger, surJob }) {
  const { plan, athlete, course, versions, liens, demandes, fige } = vue;
  const ref = plan.ref;
  const defaut = emailParDefaut({ prenom: athlete?.prenom || athlete?.pseudo, course: course?.nom || "ta course" });
  const [objet, setObjet] = useState(defaut.objet);
  const [corps, setCorps] = useState(defaut.corps);
  const [message, setMessage] = useState("");
  const [occupe, setOccupe] = useState("");
  const [temps, setTemps] = useState("");
  const [aSupprimer, setASupprimer] = useState(false);

  const geste = async (quoi, chemin, options = {}) => {
    setOccupe(quoi);
    setMessage("");
    try {
      const vu = await appeler(chemin, { methode: "POST", ...options });
      if (vu?.job_id) surJob(vu.job_id);
      await recharger();
      return vu;
    } catch (leve) {
      setMessage(leve.message);
      return null;
    } finally {
      setOccupe("");
    }
  };

  const dejaPubliee = plan.version_publiee && plan.version_publiee === plan.version;
  const resultat = plan.resultat ?? {};

  return (
    <aside className="flex flex-col gap-6 border-l border-brand-hairline bg-brand-paper px-6 py-7">
      <Section titre="1 · Publier">
        <Button
          size="sm"
          onClick={() => geste("publier", `/plans/${encodeURIComponent(ref)}/publish`)}
          loading={occupe === "publier"}
          disabled={!plan.version || dejaPubliee || fige}
        >
          {dejaPubliee ? `Version ${plan.version} publiée` : `Publier la version ${plan.version || "—"}`}
        </Button>
        <p className="text-xs leading-relaxed text-brand-muted">
          Ouvre la page de l&rsquo;athlète à son lien. Rien ne part encore.
          {plan.publie_le ? ` Dernière publication le ${jourLisible(plan.publie_le)}.` : ""}
        </p>
        {liens?.prive ? (
          <div className="flex flex-col gap-2 text-xs">
            <div>
              <p className="text-brand-muted">Lien privé — l&rsquo;athlète</p>
              <p className="break-all font-mono text-brand-text">{liens.prive}</p>
              <Copier texte={liens.prive} libelle="copier le lien privé" />
            </div>
            <div>
              <p className="text-brand-muted">Lien de partage — son assistance</p>
              <p className="break-all font-mono text-brand-text">{liens.partage}</p>
              <Copier texte={liens.partage} libelle="copier le lien de partage" />
            </div>
          </div>
        ) : null}
      </Section>

      <Section titre="2 · Envoyer">
        <p className="text-sm">
          <span className="text-brand-muted">À </span>
          <span className="text-brand-text">{athlete?.email || "— pas d'adresse"}</span>
        </p>
        <Field label="Objet" name="objet" value={objet} onChange={(e) => setObjet(e.target.value)} />
        <Field as="textarea" rows={10} label="Message" name="corps" value={corps} onChange={(e) => setCorps(e.target.value)} />
        <p className="text-xs leading-relaxed text-brand-muted">
          Joint : le PDF (rapport, feuille, fiches). {"{lien}"} devient l&rsquo;adresse de la page
          de l&rsquo;athlète ; {"{lien_partage}"}, celle de son assistance.
        </p>
        <Button
          size="sm"
          variant="secondary"
          loading={occupe === "envoyer"}
          disabled={!plan.version_publiee || !athlete?.email}
          onClick={() => geste("envoyer", `/plans/${encodeURIComponent(ref)}/send`, { corps: { objet, corps } })}
        >
          {plan.version_publiee ? (plan.envoye_le ? "Renvoyer" : "Envoyer") : "Envoyer · après publication"}
        </Button>
        {plan.envoye_le ? <p className="text-xs text-brand-muted">Envoyé le {departLisible(plan.envoye_le)}.</p> : null}
      </Section>

      {message ? <p className="text-sm text-brand-deep-dark">{message}</p> : null}

      {fige || plan.statut === "resultat" ? (
        <Section titre="Résultat">
          <p className="text-sm text-brand-soft">
            {resultat.abandon
              ? `Abandon${resultat.saisi_par === "athlete" ? ", saisi par l'athlète" : ""}.`
              : resultat.officiel_h
                ? `${duree(resultat.officiel_h)}${resultat.saisi_par === "athlete" ? ", saisi par l'athlète" : ""}.`
                : "À saisir depuis le classement officiel."}
          </p>
          <Field
            label="Temps officiel"
            name="temps"
            placeholder="34h12"
            value={temps}
            onChange={(e) => setTemps(e.target.value)}
            error={temps && lireUneDuree(temps) === null ? "Format : 34h12, 34:12 ou 34 h 12." : ""}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={lireUneDuree(temps) === null}
              onClick={async () => {
                setMessage("");
                try {
                  await appeler(`/plans/${encodeURIComponent(ref)}/result`, {
                    methode: "PUT",
                    corps: { officiel_h: lireUneDuree(temps) },
                  });
                  setTemps("");
                  await recharger();
                } catch (leve) {
                  setMessage(leve.message);
                }
              }}
            >
              Saisir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await appeler(`/plans/${encodeURIComponent(ref)}/result`, { methode: "PUT", corps: { abandon: true } });
                  await recharger();
                } catch (leve) {
                  setMessage(leve.message);
                }
              }}
            >
              Abandon
            </Button>
          </div>
        </Section>
      ) : null}

      <Section titre="Versions">
        {versions?.length ? (
          <ul className="flex list-none flex-col gap-2 p-0 text-sm">
            {[...versions].reverse().map((v) => (
              <li key={v.n} className="flex flex-wrap items-center gap-2">
                <span className="text-brand-text">
                  Version {v.n} · {jourLisible(v.cree_le)} · {v.origine === "import" ? "importée" : "générée"}
                </span>
                {v.n === plan.version ? <BadgeEtat ton="annonce">courante</BadgeEtat> : null}
                {v.n === plan.version_publiee ? <BadgeEtat ton="deroule">publiée</BadgeEtat> : null}
                {v.n !== plan.version ? (
                  <BoutonTexte
                    className="text-xs"
                    onClick={() => geste("restaurer", `/plans/${encodeURIComponent(ref)}/restore/${v.n}`)}
                  >
                    Restaurer
                  </BoutonTexte>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-muted">Aucune version encore.</p>
        )}
        <p className="text-xs leading-relaxed text-brand-muted">
          Chaque relance crée une version ; on revient à une version antérieure d&rsquo;un clic, ses
          documents avec. La page de l&rsquo;athlète suit la version publiée.
        </p>
      </Section>

      {demandes?.length ? (
        <Section titre="Demandes de l'athlète">
          <ul className="flex list-none flex-col gap-4 p-0">
            {demandes.map((d) => (
              <Demande key={d.id} demande={d} recharger={recharger} />
            ))}
          </ul>
        </Section>
      ) : null}

      <Section titre="Supprimer ce plan">
        {aSupprimer ? (
          <>
            <p className="text-sm text-brand-text">
              Ses versions, sa page et ses demandes disparaissent ; les deux liens cessent de répondre. Définitif.
              S&rsquo;il a été couru, son entrée reste au registre.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await appeler(`/plans/${encodeURIComponent(ref)}`, { methode: "DELETE" });
                    window.location.assign(lienVers("athletes", { id: plan.athlete_id }));
                  } catch (leve) {
                    setMessage(leve.message);
                    setASupprimer(false);
                  }
                }}
              >
                Supprimer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setASupprimer(false)}>
                Annuler
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setASupprimer(true)}>
            Supprimer ce plan
          </Button>
        )}
      </Section>
    </aside>
  );
}
