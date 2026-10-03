"""Ce que la page de l'athlète reçoit, selon la clé qu'elle présente (récapitulatif §5.8).

Tout vient de l'``annexe.json`` de la version PUBLIÉE — le fichier que le moteur écrit à
côté du PDF, avec les mêmes chiffres que lui. La page n'en recalcule aucun.

**La clé de partage** est celle que l'athlète donne à son assistance : elle ouvre ce
qu'il faut pour l'attendre au bon endroit à la bonne heure — le plan de passage, la nuit,
les points d'assistance et leurs notes, le profil. Pas la calibration sur ses courses
passées, pas le verdict, pas ses demandes : une assistance n'a pas à lire le dossier.

**La clé privée** ouvre tout, plus ce qui n'existe que pour lui : ses amendements, ses
demandes et leurs réponses, son résultat, et le lien de partage à copier.
"""

from __future__ import annotations

from datetime import datetime

from .cycle import a_un_resultat, depart_du_plan, est_parti, statut_lu

# Ce que la clé de partage lit de l'annexe, et rien d'autre.
_COURSE_PARTAGEE = ("name", "length_km", "dplus_m", "dminus_m", "start_time", "n_segments",
                    "segments", "profil")
_PLAN_PARTAGE = ("segments", "nuit", "parties", "crew", "nutrition", "stops_policy",
                 "anchor", "t_clock_h", "t_move_h", "t_stops_h", "safety_lo_clock",
                 "safety_hi_clock", "window_tolerance_pct", "sun", "start_time")
_PREDICTION_PARTAGEE = ("central_h", "central", "plan_low_h", "plan_high_h",
                        "interval_low_h", "interval_high_h")
_FIGURES_PARTAGEES = ("profil", "pacing")


def _garder(source: dict | None, cles) -> dict:
    source = source or {}
    return {cle: source[cle] for cle in cles if cle in source}


def vue_commune(plan: dict, course: dict | None, annexe: dict, *, documents: list[str],
                maintenant: datetime | None = None) -> dict:
    depart = depart_du_plan(plan, course)
    return {
        "ref": plan["ref"],
        "athlete": annexe.get("athlete") or "",
        "statut": statut_lu(plan, course, maintenant),
        "depart_le": depart.isoformat() if depart else "",
        "fige": est_parti(plan, course, maintenant),
        "version": plan.get("version_publiee") or 0,
        "genere_le": annexe.get("genere_le") or "",
        "course": _garder(annexe.get("course"), _COURSE_PARTAGEE),
        "prediction": _garder(annexe.get("prediction"), _PREDICTION_PARTAGEE),
        "plan": _garder(annexe.get("plan"), _PLAN_PARTAGE),
        "assistance": list(annexe.get("assistance") or []),
        "arrivee": annexe.get("arrivee"),
        "target": annexe.get("target"),
        "ventilation": annexe.get("ventilation"),
        "figures": _garder(annexe.get("figures"), _FIGURES_PARTAGEES),
        # Ceux que la version publiée porte vraiment : pas de calendrier sans heure de
        # départ, pas de trace sans coordonnées.
        "documents": documents,
    }


def vue_de_partage(plan: dict, course: dict | None, annexe: dict, *, documents: list[str],
                   maintenant: datetime | None = None) -> dict:
    return {**vue_commune(plan, course, annexe, documents=documents, maintenant=maintenant),
            "acces": "partage"}


def vue_privee(plan: dict, course: dict | None, annexe: dict, *, documents: list[str],
               demandes: list[dict], lien_de_partage: str,
               maintenant: datetime | None = None) -> dict:
    commune = vue_commune(plan, course, annexe, documents=documents, maintenant=maintenant)
    resultat = plan.get("resultat") or {}
    return {
        **commune,
        "acces": "prive",
        # Le niveau servi se lit dans le verdict : il reste au dossier, pas au lien de partage.
        "niveau": (plan.get("prediction") or {}).get("niveau") or "",
        # L'annexe entière : méthode, calibration course par course, validation, textes,
        # glossaire, références, toutes les figures. C'est son dossier.
        "annexe": annexe,
        "amendements": plan.get("amendements") or {},
        "resultat": resultat if a_un_resultat(plan) else None,
        "demandes": [
            {k: d.get(k) for k in ("id", "quoi", "pourquoi", "recue_le", "statut", "reponse",
                                   "repondue_le")}
            for d in sorted(demandes, key=lambda d: d.get("recue_le") or "", reverse=True)
        ],
        "lien_de_partage": lien_de_partage,
        "peut_amender": not commune["fige"],
        "peut_saisir_le_resultat": commune["fige"] and resultat.get("saisi_par") != "labo",
    }


__all__ = ["vue_commune", "vue_de_partage", "vue_privee"]
