"""Banc d'essai rétrospectif (tools/backtest + tools/registre) : fonctions pures + plomberie.

Le banc complet tourne sur les archives réelles (chez Valentin) ; ici on verrouille le
parsing, la fusion idempotente du registre, le score de Winkler, les quantiles groupés,
et un bout-en-bout minimal sur la fixture GPX (prédiction impossible → consignée, pas
d'erreur — le refus du moteur est une information).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # racine twin-engine → tools/

from tools.backtest import main as backtest_main  # noqa: E402
from tools.backtest import merge_registre, parse_time_h  # noqa: E402
from tools.registre import conformal_order_quantile, pooled_scores, summarize, winkler  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_parse_time_h_formats():
    assert parse_time_h("26:30:00") == pytest.approx(26.5)
    assert parse_time_h("26:30") == pytest.approx(26.5)
    assert parse_time_h("26h30") == pytest.approx(26.5)
    assert parse_time_h("26h") == pytest.approx(26.0)
    assert parse_time_h(25.82) == pytest.approx(25.82)
    assert parse_time_h("9:05:30") == pytest.approx(9 + 5 / 60 + 30 / 3600)
    assert parse_time_h(None) is None and parse_time_h("") is None
    with pytest.raises(ValueError):
        parse_time_h("vingt-six heures")


def test_winkler_rewards_narrow_and_punishes_misses():
    # couvert : score = largeur ; sorti de d : + (2/α)·d — un intervalle étroit qui rate
    # PERD face à un large qui couvre (c'est tout l'intérêt du score propre)
    assert winkler(24.0, 28.0, 26.0, 0.2) == pytest.approx(4.0)
    assert winkler(24.0, 28.0, 29.0, 0.2) == pytest.approx(4.0 + 10.0 * 1.0)
    assert winkler(24.0, 28.0, 23.0, 0.5) == pytest.approx(4.0 + 4.0 * 1.0)
    narrow_missing = winkler(25.5, 26.5, 28.0, 0.2)
    wide_covering = winkler(20.0, 30.0, 28.0, 0.2)
    assert wide_covering < narrow_missing


def test_conformal_order_quantile_matches_split_rule():
    scores = np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])   # n = 9
    # ⌈(n+1)·q⌉ : q80 → 8e valeur ; q50 → 5e ; borné à n
    assert conformal_order_quantile(scores, 0.8) == pytest.approx(0.8)
    assert conformal_order_quantile(scores, 0.5) == pytest.approx(0.5)
    assert conformal_order_quantile(np.array([1.0]), 0.8) == pytest.approx(1.0)
    assert conformal_order_quantile(np.array([]), 0.8) is None


def _entry(athlete, race, err_pct, sd_rel=0.10, lo=20.0, hi=30.0, actual=25.0, dev=False):
    return {
        "athlete": athlete, "dev_set": dev, "race": race, "date": "2025-06-01",
        "dnf": False, "official_time_h": actual,
        "prediction": {"central_h": actual * (1 + err_pct / 100.0),
                       "plan_low_h": lo + 2, "plan_high_h": hi - 2,
                       "safety_low_h": lo, "safety_high_h": hi,
                       "err_pct": err_pct, "sd_rel": sd_rel,
                       "in_plan": lo + 2 <= actual <= hi - 2,
                       "in_safety": lo <= actual <= hi},
    }


def test_merge_registre_is_idempotent_on_key():
    reg = {"entries": []}
    e1 = {k: v for k, v in _entry("A", "Course X", 5.0).items()
          if k not in ("athlete", "dev_set")}
    merge_registre(reg, "A", False, [e1])
    merge_registre(reg, "A", False, [dict(e1, official_time_h=26.0)])   # même clé → mise à jour
    merge_registre(reg, "A", False, [dict(e1, race="Course Y")])        # autre clé → ajout
    assert len(reg["entries"]) == 2
    assert reg["entries"][0]["official_time_h"] == 26.0


def test_merge_registre_preserves_manual_curation():
    """Une quarantaine (ou toute annotation manuelle) SURVIT à la re-fusion — cas réel :
    la re-fusion Rapace avait fait re-rentrer dans les stats une course quarantainée
    pour parcours inutilisable (protocole : jamais de disparition silencieuse)."""
    reg = {"entries": []}
    e1 = {k: v for k, v in _entry("A", "Course X", 5.0).items()
          if k not in ("athlete", "dev_set")}
    merge_registre(reg, "A", False, [e1])
    reg["entries"][0]["quarantine"] = "parcours inutilisable (test)"    # curation manuelle
    merge_registre(reg, "A", False, [dict(e1, official_time_h=26.0)])   # re-fusion machine
    assert reg["entries"][0]["official_time_h"] == 26.0                 # màj machine appliquée
    assert reg["entries"][0]["quarantine"] == "parcours inutilisable (test)"


def test_summarize_coverage_bias_and_pooled_grouping():
    entries = [
        _entry("A", "r1", +4.0), _entry("A", "r2", -6.0),
        _entry("B", "r3", +20.0, actual=24.0),          # 24 ∈ [22,28] plan, [20,30] safety
        {"athlete": "C", "dev_set": False, "race": "dnf", "date": "d", "dnf": True,
         "official_time_h": None, "prediction": None},
    ]
    entries[2]["below_domain"] = True                    # ex. un 50 km sous le seuil ultra
    s = summarize(entries)
    assert s["n_finished"] == 3 and s["n_dnf"] == 1
    assert s["bias_pct"] == pytest.approx((4 - 6 + 20) / 3, abs=0.01)
    # le hors-domaine est compté À PART, la MAE « dans le domaine » l'exclut
    assert s["below_domain"] == {"n": 1, "mae_pct": 20.0}
    assert s["mae_in_domain_pct"] == pytest.approx(5.0)
    assert s["plan"]["coverage_pct"] == pytest.approx(100.0)
    assert s["safety"]["coverage_pct"] == pytest.approx(100.0)
    flat, per_ath = pooled_scores(entries)
    assert sorted(per_ath) == ["A", "B"] and len(per_ath["A"]) == 2
    assert flat.max() == pytest.approx(0.20 / 0.10)      # 20 % d'erreur / sd_rel 0,10


def test_quarantine_excluded_and_sellable_split_and_fallback_norm():
    """Une entrée en quarantaine sort de TOUTES les stats (mais reste comptée) ; la synthèse
    sépare ce qui aurait été VENDU (🟢/🟠) du refusé (🔴) ; les entrées sans β-covariance
    (blend/vc_e) entrent dans la fenêtre groupée via le repli σ/v."""
    ok = _entry("A", "vendue", +6.0)
    ok["model"] = {"verdict": "🟠", "sigma_kmh": 0.45}
    ok["course"] = {"deq_km": 100.0}
    refused = _entry("A", "refusee", +40.0)
    refused["model"] = {"verdict": "🔴", "sigma_kmh": 0.8}
    refused["course"] = {"deq_km": 100.0}
    poubelle = _entry("B", "corrompue", +300.0)
    poubelle["quarantine"] = "trace aplatie"
    s = summarize([ok, refused, poubelle])
    assert s["n_quarantine"] == 1 and s["n_finished"] == 2      # la quarantaine ne compte plus
    assert s["vendable"]["n"] == 1 and s["vendable"]["mae_pct"] == 6.0
    assert s["refuse"]["n"] == 1 and s["refuse"]["mae_pct"] == 40.0
    assert s["mae_pct"] == pytest.approx(23.0)                  # (6+40)/2 — sans la quarantaine
    # repli σ/v : ok/refused n'ont PAS de sd_rel stocké → normalisés quand même
    ok["prediction"]["sd_rel"] = None
    refused["prediction"]["sd_rel"] = None
    flat, per_ath = pooled_scores([ok, refused, poubelle])
    assert len(flat) == 2 and "B" not in per_ath                # quarantaine exclue du pool
    v = 100.0 / ok["prediction"]["central_h"]                   # σ/v = sd_rel de repli
    assert min(flat) == pytest.approx(0.06 / (0.45 / v))


def test_backtest_end_to_end_records_refusal(tmp_path, monkeypatch, capsys):
    """Bout-en-bout minimal : une « archive » d'une seule activité (fixture GPX) → le moteur
    refuse de prédire (🔴) ; l'entrée est consignée avec la coupure appliquée, sans crash,
    et la relance est idempotente."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(201):
        x = 12000.0 * i / 200
        ele = 1200.0 * (x / 6000.0) if x <= 6000 else 1200.0 * (2 - x / 6000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    (tmp_path / "course.gpx").write_bytes(
        ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
         f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode())
    (tmp_path / "archive.gpx").write_bytes((FIX / "sample.gpx").read_bytes())
    manifest = {
        "athlete": "Testeur", "archive": "archive.gpx",
        "races": [{"name": "Course passée", "date": "2030-01-02",
                   "official_time": "10:00:00", "gpx": "course.gpx"}],
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    registre = tmp_path / "registre.json"

    for _ in range(2):   # idempotence : deux passages → une seule entrée
        rc = backtest_main([str(tmp_path / "manifest.json"), "--registre", str(registre)])
        assert rc == 0
        capsys.readouterr()
    data = json.loads(registre.read_text(encoding="utf-8"))
    assert len(data["entries"]) == 1
    e = data["entries"][0]
    assert e["athlete"] == "Testeur" and e["until"] == "2030-01-01"
    assert e["prediction"] is None                       # refus consigné, pas d'invention
    assert e["model"]["verdict"] == "🔴"
    assert e["below_domain"] is False                    # cible 10 h = pile au seuil du domaine


def test_diag_archive_xray_counts_and_long_efforts(tmp_path, capsys):
    """Radiographie d'archive : mêmes parseurs que le produit — par année/format, sports,
    rejets motivés, liste des efforts longs (l'outil qui tranche « course absente de
    l'archive vs course écartée »)."""
    from tools.diag_archive import main as diag_main

    d = tmp_path / "archive"
    d.mkdir()
    for f in ("sample.fit", "sample.tcx", "sample.gpx"):
        (d / f).write_bytes((FIX / f).read_bytes())
    (d / "notes.txt").write_bytes(b"pas une activite")

    rc = diag_main([str(d), "--min-hours", "0.01"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "Fichiers dans l'archive : 4" in out and ".txt" in out
    assert "PARSÉES : 3" in out
    # le .txt n'est ni parsé ni « rejeté » (le marcheur l'ignore en silence) → signalé
    assert "1 fichier(s) ni parsé(s) ni rejeté(s)" in out
    assert "Efforts ≥ 0 h (3)" in out          # les 3 fixtures dépassent 36 s
    assert "running" in out


def test_diag_archive_audits_genuine_filter(tmp_path, capsys):
    """L'audit « vrais ultras » dit POURQUOI un effort ≥ 10 h serait retenu, écarté
    (critère chiffré) ou carrément invisible (sport non running) — le trou
    d'observabilité du cas Rapace/Saintélyon."""
    import numpy as np

    from twin_engine.ingest.canonical import CanonicalActivity
    from tools.diag_archive import _genuine_audit
    from twin_engine.config import load_config

    cfg = load_config()
    n = 10 * 3600 + 1800                       # 10 h 30
    t = list(range(0, n, 10))                  # échantillons 0,1 Hz (interpolés à 1 Hz)
    dist = [1.9 * s for s in t]                # 6,84 km/h à plat → vga ≥ 5,5

    run = CanonicalActivity.from_samples(
        timestamps=t, dist_m=dist, speed_ms=[1.9] * len(t), alt_m=[500.0] * len(t),
        sport="running", source_format="fit", source_name="ultra",
    )
    assert "VRAI ULTRA retenu" in _genuine_audit(run, cfg)
    assert "n/a (pas de FC)" in _genuine_audit(run, cfg)

    slow = CanonicalActivity.from_samples(
        timestamps=t, dist_m=[1.2 * s for s in t], speed_ms=[1.2] * len(t),
        alt_m=[500.0] * len(t), sport="running", source_format="fit", source_name="rando",
    )
    out = _genuine_audit(slow, cfg)
    assert "ÉCARTÉ" in out and "vga" in out     # 4,3 km/h < 5,5

    ghost = CanonicalActivity.from_samples(
        timestamps=t, dist_m=dist, speed_ms=[1.9] * len(t), alt_m=[500.0] * len(t),
        sport=None, source_format="gpx", source_name="mystere",
    )
    assert "INVISIBLE du moteur" in _genuine_audit(ghost, cfg)


# --------------------------------------------------------------------------- #
# Cache d'archive : UN décodage, N coupures — et des résultats IDENTIQUES au chemin direct.
def _activity_gpx(day: str, *, minutes: int, v_ms: float, climb_m: float = 40.0) -> bytes:
    """Une activité datée, à 1 Hz, avec altitude et FC (donc exploitable par la courbe record)."""
    import math as _m

    n = minutes * 60
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = v_ms * i
        ele = 100.0 + climb_m * (i / n if i <= n / 2 else (n - i) / n) * 2
        dlon = x / (111_320.0 * _m.cos(_m.radians(lat0)))
        hh, mm, ss = 8 + i // 3600, (i % 3600) // 60, i % 60
        rows.append(
            f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele>'
            f'<time>{day}T{hh:02d}:{mm:02d}:{ss:02d}Z</time><extensions>'
            f'<gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr>'
            f'</gpxtpx:TrackPointExtension></extensions></trkpt>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" '
        'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'
        f'<trk><type>running</type><trkseg>{"".join(rows)}</trkseg></trk></gpx>'
    ).encode()


def _archive(tmp_path):
    d = tmp_path / "archives"
    d.mkdir()
    for i, (day, minutes, v) in enumerate([
        ("2025-03-15", 40, 3.1), ("2025-06-10", 70, 2.9), ("2025-09-02", 55, 3.0),
        ("2026-01-20", 90, 2.8), ("2026-04-05", 45, 3.2),
    ]):
        (d / f"act{i}.gpx").write_bytes(_activity_gpx(day, minutes=minutes, v_ms=v))
    return d


def _course_gpx():
    import math as _m

    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(201):
        x = 10000.0 * i / 200
        ele = 1000.0 * (x / 5000.0) if x <= 5000 else 1000.0 * (2 - x / 5000.0)
        dlon = x / (111_320.0 * _m.cos(_m.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


@pytest.mark.parametrize("cutoff", ["2025-12-31", "2026-06-01", "2025-05-01"])
def test_archive_cache_matches_the_direct_path(tmp_path, cutoff):
    """LE test du cache : décoder une fois puis filtrer doit être indiscernable de décoder
    l'archive coupée. Même arithmétique, même ordre — donc mêmes départages à égalité."""
    from datetime import date as _date

    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec, build_course
    from twin_engine.pipeline import run_preview

    from tools.backtest import ArchiveCache

    cfg = load_config()
    archive, gpx = _archive(tmp_path), _course_gpx()
    race = RaceSpec(name="T")
    until = _date.fromisoformat(cutoff)

    direct = run_preview(training_path=archive, course_gpx=gpx, race=race, cfg=cfg,
                         purge_source=False, until=until)
    cached = ArchiveCache(archive, cfg).preview_at(build_course(gpx, race, cfg), until)

    assert cached.to_dict() == direct.to_dict()


def test_archive_cache_decodes_only_once(tmp_path, monkeypatch):
    """Le gain est là ou il n'est pas : N coupures ne doivent coûter qu'UN décodage."""
    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec, build_course
    from twin_engine.twin import record as record_mod

    from tools.backtest import ArchiveCache

    cfg = load_config()
    calls = {"n": 0}
    real = record_mod.process_activity

    def _counting(act, c):
        calls["n"] += 1
        return real(act, c)

    monkeypatch.setattr(record_mod, "process_activity", _counting)

    cache = ArchiveCache(_archive(tmp_path), cfg)
    after_load = calls["n"]
    assert after_load == 5                      # une passe sur les 5 activités

    course = build_course(_course_gpx(), RaceSpec(name="T"), cfg)
    from datetime import date as _date

    for day in ("2025-12-31", "2026-06-01", "2025-05-01"):
        cache.preview_at(course, _date.fromisoformat(day))
    assert calls["n"] == after_load             # ... et plus AUCUN décodage ensuite


# --------------------------------------------------------------------------- #
# Balayage de la demi-vie de récence (tools/ab_recency) — l'instrument du biais de progression.
def _manifest(tmp_path):
    """Un manifeste minimal pointant sur l'archive et la trace synthétiques."""
    archive = _archive(tmp_path)
    (tmp_path / "trace.gpx").write_bytes(_course_gpx())
    man = tmp_path / "manifest-test.json"
    man.write_text(json.dumps({
        "athlete": "Test", "archive": archive.name, "dev_set": False,
        "races": [
            {"name": "Course A", "date": "2026-03-01", "official_time": "12:00:00",
             "gpx": "trace.gpx"},
            {"name": "Course B", "date": "2025-08-01", "official_time": "13:30:00",
             "gpx": "trace.gpx"},
        ],
    }), encoding="utf-8")
    return man


def test_ab_recency_sweeps_without_redecoding(tmp_path, monkeypatch, capsys):
    """Le balayage doit coûter UN décodage par athlète, pas un par variante."""
    from twin_engine.config import load_config
    from twin_engine.twin import record as record_mod

    from tools.ab_recency import evaluate, report

    calls = {"n": 0}
    real = record_mod.process_activity

    def _counting(act, c):
        calls["n"] += 1
        return real(act, c)

    monkeypatch.setattr(record_mod, "process_activity", _counting)

    grid = (90.0, 365.0, 730.0)
    rows = evaluate([_manifest(tmp_path)], grid, load_config())

    assert calls["n"] == 5                      # 5 activités décodées, UNE fois
    assert len(rows) == 2 * len(grid)           # 2 courses × 3 variantes
    assert {r["halflife"] for r in rows} == set(grid)
    report(rows, grid)                          # le rendu ne doit pas exploser
    out = capsys.readouterr().out
    assert "cas FRAIS" in out and "←défaut" in out


def test_ab_recency_only_touches_calibration(tmp_path):
    """Garde-fou du cache : la demi-vie ne doit RIEN changer en amont du jumeau.

    Si une variante modifiait les agrégats par activité, réutiliser un décodage unique
    serait faux — c'est l'hypothèse sur laquelle repose tout l'outil.
    """
    from dataclasses import fields

    from twin_engine.config import load_config

    from tools.ab_recency import _cfg_with_halflife

    cfg = load_config()
    variante = _cfg_with_halflife(cfg, 90.0)
    for f in fields(cfg):
        if f.name != "calibration":
            assert getattr(variante, f.name) == getattr(cfg, f.name), f"{f.name} modifié"
    assert variante.calibration.recency_halflife_days == 90.0


# --------------------------------------------------------------------------- #
# Frontière finesse/calibration (tools/registre --frontiere).
def _entree(err_pct, demi_largeur_pct, *, verdict="🟢", central=20.0, dev=False):
    """Une entrée de registre synthétique : erreur du central et largeur de bande choisies."""
    actual = central / (1 + err_pct / 100.0)
    demi = central * demi_largeur_pct / 100.0
    return {
        "athlete": "T", "race": f"C{err_pct}", "date": "2026-01-01", "dev_set": dev,
        "dnf": False, "official_time_h": actual,
        "model": {"verdict": verdict},
        "prediction": {
            "central_h": central,
            "safety_low_h": central - demi, "safety_high_h": central + demi,
            "plan_low_h": central - demi / 2, "plan_high_h": central + demi / 2,
            "err_pct": err_pct,
        },
    }


def test_frontiere_widens_and_scores():
    from tools.registre import frontiere

    # bande beaucoup trop étroite (±1 %) face à des erreurs de ±10 % : élargir doit payer
    entries = [_entree(e, 1.0) for e in (-10, -5, 0, 5, 10)]
    rows = frontiere(entries, alpha=0.2, band="safety")
    widths = [r["width_rel_pct"] for r in rows]
    assert widths == sorted(widths)                       # la largeur croît avec k
    covs = [r["coverage_pct"] for r in rows]
    assert covs == sorted(covs)                           # la couverture aussi
    best = min(rows, key=lambda r: r["winkler_rel"])
    assert best["k"] > 1.0                                # ... et l'optimum est à ÉLARGIR


def test_frontiere_detects_room_to_tighten():
    """Bande absurdement large face à des erreurs minuscules : le score doit dire « resserre »."""
    from tools.registre import frontiere

    entries = [_entree(e, 40.0) for e in (-1, -0.5, 0, 0.5, 1)]
    best = min(frontiere(entries, alpha=0.2, band="safety"),
               key=lambda r: r["winkler_rel"])
    assert best["k"] < 1.0


def test_frontiere_ignores_refused_cases_by_default():
    """La question est « jusqu'où resserrer ce que je VENDS » : les 🔴 n'en font pas partie."""
    from tools.registre import frontiere

    entries = [_entree(e, 5.0) for e in (-3, 0, 3)]
    entries.append(_entree(300.0, 5.0, verdict="🔴"))     # refus catastrophique
    vendus = frontiere(entries, alpha=0.2, band="safety")
    tous = frontiere(entries, alpha=0.2, band="safety", sellable_only=False)
    assert vendus[0]["n"] == 3 and tous[0]["n"] == 4
    # le refus, s'il comptait, ferait exploser le score à toute largeur
    assert min(r["winkler_rel"] for r in vendus) < min(r["winkler_rel"] for r in tous)


def test_frontiere_survives_an_empty_set():
    from tools.registre import frontiere

    assert frontiere([], alpha=0.2, band="safety") == []
    assert frontiere([_entree(0, 5.0, verdict="🔴")], alpha=0.2, band="safety") == []


def test_ab_recency_reports_the_hidden_cost_of_a_short_halflife(tmp_path, capsys):
    """Une demi-vie courte réduit N_eff : le tableau doit le montrer, sinon on choisit à
    l'aveugle une valeur qui corrige le biais en dégradant le régime."""
    from twin_engine.config import load_config

    from tools.ab_recency import evaluate, report

    grid = (30.0, 365.0, 3650.0)
    rows = evaluate([_manifest(tmp_path)], grid, load_config())
    report(rows, grid)
    out = capsys.readouterr().out
    assert "N_eff" in out and "régr." in out and "Winkler" in out

    def _neff(hl):
        vals = [r["n_eff"] for r in rows if r["halflife"] == hl]
        return sum(vals) / len(vals)

    # 30 j écrase le passé, 3650 j garde tout : N_eff doit croître avec la demi-vie
    assert _neff(30.0) <= _neff(365.0) <= _neff(3650.0)


def test_ab_recency_honours_the_quarantine(tmp_path):
    """Le balayage part des manifestes, qui ignorent la curation : sans filtre il re-scorerait
    une entrée écartée pour données d'entrée fausses."""
    from twin_engine.config import load_config

    from tools.ab_recency import evaluate, quarantined

    man = _manifest(tmp_path)
    cfg = load_config()
    grid = (365.0,)
    complet = evaluate([man], grid, cfg)
    filtre = evaluate([man], grid, cfg, exclude={("Test", "Course A", "2026-03-01")})
    assert len(complet) == 2 and len(filtre) == 1
    assert {r["race"] for r in filtre} == {"Course B"}

    # la liste se lit dans le registre committé, pas dans le manifeste
    reg = tmp_path / "registre.json"
    reg.write_text(json.dumps({"entries": [
        {"athlete": "Test", "race": "Course A", "date": "2026-03-01", "quarantine": "motif"},
        {"athlete": "Test", "race": "Course B", "date": "2025-08-01"},
    ]}), encoding="utf-8")
    assert quarantined(reg) == {("Test", "Course A", "2026-03-01")}


def test_summarize_counts_refusal_motives_and_false_negatives():
    """Un 🔴 sans motif est un mur : on voit que la vente est bloquée, jamais par quoi.
    Et un refus alors que le central était juste est un client perdu pour rien."""
    from tools.registre import summarize

    def _e(err, verdict, blocking=None):
        return {"athlete": "T", "race": f"C{err}", "date": "2026-01-01", "dnf": False,
                "official_time_h": 20.0,
                "model": {"verdict": verdict, "blocking": blocking or []},
                "prediction": {"central_h": 20 * (1 + err / 100), "err_pct": err,
                               "safety_low_h": 18.0, "safety_high_h": 22.0,
                               "plan_low_h": 19.0, "plan_high_h": 21.0}}

    s = summarize([
        _e(2.0, "🟢"),
        _e(4.0, "🔴", ["Domaine de calibration"]),
        _e(90.0, "🔴", ["Domaine de calibration", "Courses exploitables"]),
        _e(-8.0, "🔴", ["Fraîcheur des données"]),
    ])
    motifs = dict(s["blocking"])
    assert motifs["Domaine de calibration"] == 2
    assert motifs["Fraîcheur des données"] == 1
    # deux refus à ±15 % d'erreur (+4 % et −8 %) : faux négatifs potentiels
    assert s["refuses_pourtant_justes"] == 2


# --------------------------------------------------------------------------- #
# Phase 0 du chantier v2 : tableau de référence, avant/après, diag_ultras, passages
# --------------------------------------------------------------------------- #
def _sold(e, verdict="🟠"):
    e["model"] = {"verdict": verdict}
    return e


def test_athlete_rows_and_tableau_split_sold_refused():
    """Le tableau de référence : par athlète et total, vendus/refusés, Winkler RELATIF et
    largeur relative MÉDIANE — les colonnes de DIAGNOSTIC §10.0."""
    from tools.registre import REFUSED, athlete_rows, tableau_markdown

    entries = [_sold(_entry("A", "r1", +4.0)), _sold(_entry("A", "r2", -6.0)),
               _entry("B", "r3", +20.0, actual=24.0)]
    entries[2]["model"] = {"verdict": "🔴", "blocking": ["Domaine de calibration"]}

    rows = athlete_rows(entries)
    assert [r["athlete"] for r in rows] == ["A", "TOTAL"]
    tot = rows[-1]
    assert tot["n"] == 2 and tot["mae_pct"] == pytest.approx(5.0) and tot["bias_pct"] == pytest.approx(-1.0)
    assert tot["plan_coverage_pct"] == 100.0 and tot["safety_coverage_pct"] == 100.0
    # couvert → Winkler = largeur / réel ; largeur relative = largeur / central (26 et 23,5)
    assert tot["plan_winkler_rel"] == pytest.approx(6 / 25) and tot["safety_winkler_rel"] == pytest.approx(10 / 25)
    assert tot["plan_width_rel_med_pct"] == pytest.approx(np.median([600 / 26, 600 / 23.5]))
    assert tot["safety_width_rel_med_pct"] == pytest.approx(np.median([1000 / 26, 1000 / 23.5]))

    ref = athlete_rows(entries, verdicts=REFUSED)
    assert ref[0]["athlete"] == "B" and ref[0]["blocking"] == [("Domaine de calibration", 1)]
    md = tableau_markdown(entries)
    assert "VENDUS" in md and "REFUSÉS" in md
    assert "| A | 2 |" in md and "Domaine de calibration ×1" in md


def test_compare_markdown_reports_deltas_and_verdict_flips():
    """Avant → après : deltas par athlète sur les vendus, et chaque bascule de verdict
    nommée — la pièce des règles d'adoption (MAE vendue, Winkler, largeur)."""
    from tools.registre import compare_markdown

    before = [_sold(_entry("A", "r1", +4.0)), _sold(_entry("A", "r2", -6.0))]
    after = [_sold(_entry("A", "r1", +2.0)), _entry("A", "r2", -6.0),
             _sold(_entry("A", "r3", +1.0), "🟢")]
    after[1]["model"] = {"verdict": "🔴", "blocking": ["x"]}
    md = compare_markdown(before, after)
    assert "| TOTAL | 2 → 2 (+0) | 5.0 → 1.5 (-3.5)" in md
    assert "4.0 → 2.0 (-2.0)" in md
    assert "r2 (2025-06-01) : 🟠 → 🔴 (devient REFUSÉE)" in md
    assert "r3 (2025-06-01) : apparue" in md
    assert "aucun" not in md.split("Changements de verdict")[-1]


def _activity_gpx_along(day: str, start_hms: str, lat, lon, step_s: int = 10) -> bytes:
    """Activité GPX synthétique (course) : positions données, un point toutes les step_s."""
    from datetime import datetime as _dt, timedelta as _td

    t0 = _dt.fromisoformat(f"{day}T{start_hms}+00:00")
    rows = []
    for i, (la, lo) in enumerate(zip(lat, lon)):
        when = (t0 + _td(seconds=i * step_s)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append(f'<trkpt lat="{la:.7f}" lon="{lo:.7f}"><ele>100.0</ele><time>{when}</time></trkpt>')
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><type>running</type><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _eastward(minutes: int, v_ms: float, pause: tuple[int, int] | None, step_s: int = 10):
    """Positions vers l'est à v_ms, avec un plateau (début s, durée s) — à Nice."""
    lat0, lon0 = 43.70, 7.26
    lat, lon, x = [], [], 0.0
    for i in range(minutes * 60 // step_s + 1):
        t = i * step_s
        moving = not (pause and pause[0] <= t < pause[0] + pause[1])
        if i and moving:
            x += v_ms * step_s
        lat.append(lat0)
        lon.append(lon0 + x / (111_320.0 * math.cos(math.radians(lat0))))
    return lat, lon


def test_diag_ultras_measures_stops_night_and_official_gap(tmp_path, capsys):
    """H2 et C2 mesurés : arrêts (plateau de distance), part de nuit (test du plan), écart
    montre − officiel via le manifeste, statut « vrai ultra » motivé."""
    from tools.diag_ultras import main as diag_main, render_markdown, scan_archive
    from twin_engine.config import load_config

    d = tmp_path / "archive"
    d.mkdir()
    lat, lon = _eastward(40, 3.0, pause=(1200, 300))          # nuit : 21:30 UTC à Nice
    (d / "nuit.gpx").write_bytes(_activity_gpx_along("2026-06-20", "21:30:00", lat, lon))
    lat, lon = _eastward(40, 3.0, pause=None)                 # jour : 10:00 UTC
    (d / "jour.gpx").write_bytes(_activity_gpx_along("2026-06-21", "10:00:00", lat, lon))
    manifest = {"athlete": "T", "archive": "archive",
                "races": [{"name": "Nuit", "date": "2026-06-20", "official_time": "0:42:00"}]}

    res = scan_archive(d, load_config(), min_hours=0.5, min_stop_s=60, manifest=manifest)
    rows = {r["date"]: r for r in res["rows"]}
    assert set(rows) == {"2026-06-20", "2026-06-21"}
    nuit, jour = rows["2026-06-20"], rows["2026-06-21"]
    assert nuit["night_pct"] == pytest.approx(100.0) and nuit["night_moving_pct"] == pytest.approx(100.0)
    assert jour["night_pct"] == 0.0 and jour["n_stops"] == 0
    assert nuit["n_stops"] == 1 and nuit["n_stops_5min"] == 1
    assert nuit["stopped_min_per_h"] == pytest.approx(7.5, abs=0.5)     # 5 min sur 40 min
    assert nuit["longest_stop_min"] == pytest.approx(5.0, abs=0.1)
    assert nuit["genuine"] is False and any("durée" in r for r in nuit["reasons"])
    assert nuit["race"] == "Nuit" and nuit["official_h"] == pytest.approx(0.7)
    assert nuit["watch_gap_min"] == pytest.approx(-2.0, abs=0.5)        # montre 40 min, officiel 42
    agg = res["aggregates"]
    assert agg["n_long"] == 2 and agg["n_genuine"] == 0 and agg["n_races_matched"] == 1
    assert agg["stopped_pct_wmean_genuine"] is None                     # aucun vrai ultra → pas de moyenne inventée
    md = render_markdown(res)
    assert "H2" in md and "C2" in md and "| 2026-06-20 | Nuit |" in md

    out_json = tmp_path / "diag.json"
    rc = diag_main([str(d), "--min-hours", "0.5", "--json", str(out_json)])
    assert rc == 0 and json.loads(out_json.read_text(encoding="utf-8"))["aggregates"]["n_long"] == 2
    capsys.readouterr()


def test_target_night_uses_the_real_plan(tmp_path):
    """La part de nuit de la cible vient du plan réel (fade, arrêts, horloge) : un départ
    après le coucher du soleil est de nuit de bout en bout, un départ matinal ne l'est pas."""
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    from tools.diag_ultras import target_night
    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec

    tzinfo = _tz(_td(hours=2))

    def _race(hour):
        return RaceSpec("T", (0.0, 5.0, 10.0), ("d", "s", "a"),
                        start_time=_dt(2026, 9, 25, hour, 0, tzinfo=tzinfo),
                        lat=43.703, lon=7.266, tz_offset_h=2.0)

    night = target_night(_course_gpx(), _race(20), 3.0, load_config())
    assert night["night_moving_pct"] == pytest.approx(100.0)
    assert night["night_span_km"] == (0.0, 10.0) and len(night["segments"]) == 2
    day = target_night(_course_gpx(), _race(8), 3.0, load_config())
    assert day["night_moving_pct"] == 0.0 and day["night_span_km"] is None
    assert day["t_clock_h"] == pytest.approx(3.0)
    with pytest.raises(ValueError):
        target_night(_course_gpx(), RaceSpec("sans logistique"), 3.0, load_config())


def _along_course(course, v_ms: float, pause: tuple[float, float] | None, step_s: int = 1):
    """Trajectoire 1 Hz qui SUIT la trace du parcours à v_ms (horizontal), avec un plateau."""
    total_x = float(course.x_m[-1])
    t, x, lat, lon = [], [], [], []
    cur, s = 0.0, 0
    while cur <= total_x:
        moving = not (pause and pause[0] <= s < pause[0] + pause[1])
        if s and moving:
            cur += v_ms * step_s
        t.append(float(s))
        x.append(min(cur, total_x))
        lat.append(float(np.interp(min(cur, total_x), course.x_m, course.lat_grid)))
        lon.append(float(np.interp(min(cur, total_x), course.x_m, course.lon_grid)))
        s += step_s
        if cur >= total_x:
            break
    return np.array(t), np.array(x), np.array(lat), np.array(lon)


def test_match_checkpoints_radius_monotone_and_fallbacks():
    """Passages par proximité : trouvés dans l'ordre à la bonne seconde (arrêt compris),
    « introuvable » sans position, jamais un point inventé."""
    from tools.passages import match_checkpoints, passages_for_activity
    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec, build_course

    course = build_course(_course_gpx(), RaceSpec("T", (0.0, 5.0, 10.0), ("d", "s", "a")),
                          load_config())
    cps = course.checkpoint_coords()
    t, x, lat, lon = _along_course(course, 2.0, pause=(2500, 600))
    hits = match_checkpoints(t, x, lat, lon, cps, radius_m=50)
    assert [h["method"] for h in hits] == ["radius"] * 3
    assert hits[0]["t_s"] == 0.0
    assert hits[1]["t_s"] == pytest.approx(2500, abs=30)     # sommet à 5 km : 2500 s à 2 m/s
    assert hits[2]["t_s"] == pytest.approx(5600, abs=30)     # + 600 s d'arrêt au sommet
    nan = np.full(t.size, np.nan)
    assert [h["method"] for h in match_checkpoints(t, x, nan, nan, cps)] == ["introuvable"] * 3
    # distance de montre incohérente avec le km du point → pas de faux passage
    assert match_checkpoints(t, x + 50_000.0, lat, lon, cps)[1]["method"] == "introuvable"

    pas = passages_for_activity(t, x, lat, lon, course, radius_m=50, official_h=5600 / 3600)
    assert pas["n_found"] == 3 and [c["name"] for c in pas["checkpoints"]] == ["d", "s", "a"]
    assert pas["checkpoints"][1]["t_h"] == pytest.approx(2500 / 3600, abs=0.01)
    assert abs(pas["finish_gap_min"]) < 0.6


def test_passages_end_to_end_writes_and_survives_the_bench_merge(tmp_path, capsys):
    """De l'archive au registre : l'activité du jour de course est retrouvée, ses passages
    consignés sous la clé de l'entrée, et la re-fusion du banc les préserve."""
    from tools.backtest import merge_registre
    from tools.passages import main as passages_main
    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec, build_course

    course_gpx = _course_gpx()
    course = build_course(course_gpx, RaceSpec(name="Course passée"), load_config())   # GPX-only
    t, x, lat, lon = _along_course(course, 2.0, pause=(2500, 600), step_s=10)
    d = tmp_path / "archives"
    d.mkdir()
    (d / "race.gpx").write_bytes(_activity_gpx_along("2030-05-01", "08:00:00", lat, lon))
    (d / "other.gpx").write_bytes(_activity_gpx_along("2030-05-01", "18:00:00", lat[:20], lon[:20]))
    (tmp_path / "course.gpx").write_bytes(course_gpx)
    manifest = {"athlete": "Testeur", "archive": "archives",
                "races": [{"name": "Course passée", "date": "2030-05-01",
                           "official_time": "1:33:20", "gpx": "course.gpx"}]}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    registre = tmp_path / "registre.json"

    rc = passages_main([str(tmp_path / "manifest.json"), "--registre", str(registre),
                        "--radius-m", "60"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "Testeur · Course passée" in out and "| 10.0 |" in out
    data = json.loads(registre.read_text(encoding="utf-8"))
    e = data["entries"][0]
    assert (e["athlete"], e["race"], e["date"]) == ("Testeur", "Course passée", "2030-05-01")
    pas = e["passages"]
    assert pas["activity_date"] == "2030-05-01" and pas["n_found"] == len(course.segments) + 1
    assert pas["checkpoints"][-1]["t_h"] == pytest.approx(5600 / 3600, abs=0.02)
    assert abs(pas["finish_gap_min"]) < 1.5

    # la re-fusion du banc (ligne machine sans « passages ») ne les efface pas
    merge_registre(data, "Testeur", False,
                   [{"race": "Course passée", "date": "2030-05-01", "prediction": None}])
    assert data["entries"][0]["passages"]["n_found"] == pas["n_found"]
    assert len(data["entries"]) == 1


def test_backtest_skips_a_missing_archive_and_continues(tmp_path, monkeypatch, capsys):
    """Une archive introuvable est signalée (avec ce qui existe autour) et SAUTÉE : les
    autres manifestes tournent, le registre est écrit, le code de retour le dit."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    (tmp_path / "course.gpx").write_bytes(_course_gpx())
    (tmp_path / "archive.gpx").write_bytes((FIX / "sample.gpx").read_bytes())
    (tmp_path / "cas").mkdir()
    (tmp_path / "cas" / "export.zip").write_bytes(b"pas une archive")
    ok = {"athlete": "Présent", "archive": "archive.gpx",
          "races": [{"name": "Course", "date": "2030-01-02", "official_time": "10:00:00",
                     "gpx": "course.gpx"}]}
    ko = dict(ok, athlete="Absent", archive="cas/perdu.zip")
    (tmp_path / "ok.json").write_text(json.dumps(ok), encoding="utf-8")
    (tmp_path / "ko.json").write_text(json.dumps(ko), encoding="utf-8")
    registre = tmp_path / "registre.json"

    rc = backtest_main([str(tmp_path / "ko.json"), str(tmp_path / "ok.json"),
                        "--registre", str(registre)])
    err = capsys.readouterr().err
    assert rc == 1
    assert "Absent : ARCHIVE INTROUVABLE" in err and "export.zip" in err
    data = json.loads(registre.read_text(encoding="utf-8"))
    assert [e["athlete"] for e in data["entries"]] == ["Présent"]


def test_banc_one_pass_matches_the_separate_tools(tmp_path, monkeypatch, capsys):
    """Un seul décodage pour le banc, la radiographie et les passages — et exactement les
    mêmes résultats que tools/backtest, tools/diag_ultras et tools/passages lancés à part."""
    from tools.banc import main as banc_main
    from tools.diag_ultras import scan_archive
    from tools.passages import main as passages_main
    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec, build_course

    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    cfg = load_config()
    course_gpx = _course_gpx()
    course = build_course(course_gpx, RaceSpec(name="Course passée"), cfg)
    t, x, lat, lon = _along_course(course, 2.0, pause=(2500, 600), step_s=10)
    d = tmp_path / "archives"
    d.mkdir()
    (d / "race.gpx").write_bytes(_activity_gpx_along("2030-05-01", "08:00:00", lat, lon))
    lat2, lon2 = _eastward(40, 3.0, pause=(1200, 300))
    (d / "nuit.gpx").write_bytes(_activity_gpx_along("2030-04-20", "21:30:00", lat2, lon2))
    (tmp_path / "course.gpx").write_bytes(course_gpx)
    manifest = {"athlete": "Testeur", "archive": "archives",
                "races": [{"name": "Course passée", "date": "2030-05-01",
                           "official_time": "1:33:20", "gpx": "course.gpx"}]}
    mp = tmp_path / "manifest.json"
    mp.write_text(json.dumps(manifest), encoding="utf-8")
    out = tmp_path / "out"

    reg_one = tmp_path / "reg-one.json"
    rc = banc_main([str(mp), "--registre", str(reg_one), "--out", str(out), "--radius-m", "60",
                    "--min-hours", "0.5", "--avant", str(tmp_path / "inexistant.json")])
    assert rc == 0
    reg_sep = tmp_path / "reg-sep.json"
    assert backtest_main([str(mp), "--registre", str(reg_sep)]) == 0
    assert passages_main([str(mp), "--registre", str(reg_sep), "--radius-m", "60"]) == 0
    capsys.readouterr()

    one = json.loads(reg_one.read_text(encoding="utf-8"))["entries"]
    sep = json.loads(reg_sep.read_text(encoding="utf-8"))["entries"]
    assert one == sep and one[0]["passages"]["n_found"] == len(course.segments) + 1
    diag_one = json.loads((out / "diag-testeur.json").read_text(encoding="utf-8"))
    diag_sep = json.loads(json.dumps(
        scan_archive(d, cfg, min_hours=0.5, min_stop_s=60, manifest=manifest)))
    assert diag_one["rows"] == diag_sep["rows"] and diag_one["aggregates"] == diag_sep["aggregates"]
    names = {p.name for p in out.iterdir()}
    assert {"backtest.md", "tableau.md", "diag-testeur.md", "passages-testeur.md"} <= names
    assert "compare.md" not in names                       # pas de registre « avant » → pas de compare
    assert "Course passée" in (out / "backtest.md").read_text(encoding="utf-8")


def test_banc_variants_replay_on_one_decode_and_refuse_twin_overrides(tmp_path, monkeypatch, capsys):
    """--variant : mêmes agrégats décodés, calibration/prédiction rejouées sous surcharge ;
    sorties par variante ; un bloc twin/course surchargé est refusé (il faudrait re-décoder)."""
    from tools.banc import main as banc_main, parse_variants
    from twin_engine.config import load_config

    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    cfg = load_config()
    with pytest.raises(ValueError):
        parse_variants(["dedup:twin.dedup_activities=off"], cfg)
    with pytest.raises(ValueError):
        parse_variants(["A:calibration.link=log", "A:calibration.link=log"], cfg)
    v = parse_variants(["A2:calibration.link=log", "A3:prediction.interval_source=studentized_scale"], cfg)
    assert v["A2"].calibration.link == "log" and v["A3"].prediction.interval_source == "studentized_scale"

    archive, gpx = _archive(tmp_path), _course_gpx()
    (tmp_path / "course.gpx").write_bytes(gpx)
    manifest = {"athlete": "Testeur", "archive": "archives",
                "races": [{"name": "Course passée", "date": "2026-04-10",
                           "official_time": "2:00:00", "gpx": "course.gpx"}]}
    mp = tmp_path / "manifest.json"
    mp.write_text(json.dumps(manifest), encoding="utf-8")
    out = tmp_path / "out"
    rc = banc_main([str(mp), "--registre", str(tmp_path / "reg.json"), "--out", str(out),
                    "--no-diag", "--no-passages", "--avant", str(tmp_path / "nope.json"),
                    "--variant", "A2:calibration.link=log"])
    capsys.readouterr()
    assert rc == 0
    names = {p.name for p in out.iterdir()}
    assert {"registre-A2.json", "backtest-A2.md", "tableau-A2.md", "compare-A2.md"} <= names
    base = json.loads((tmp_path / "reg.json").read_text(encoding="utf-8"))["entries"]
    var = json.loads((out / "registre-A2.json").read_text(encoding="utf-8"))["entries"]
    assert len(base) == len(var) == 1 and var[0]["model"].get("link") == "log"
