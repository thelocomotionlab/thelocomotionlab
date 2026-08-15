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
