"""Config : env > twin.config.json > défauts, et coercion des tuples."""

from __future__ import annotations

import json

from twin_engine.config import load_config


def test_defaults_from_shipped_json():
    cfg = load_config()
    # constantes fixes (twin-theory §8/§12)
    assert cfg.course.grade_clip == 0.45
    assert cfg.twin.f_cap == 3.0
    assert len(cfg.twin.record_durations_s) == 27
    # JSON ne connaît que les listes → on doit récupérer des tuples
    assert isinstance(cfg.twin.vc_window_s, tuple)
    assert cfg.twin.vc_window_s == (600, 5400)
    assert cfg.calibration.genuine_min_hours == 10.0
    assert cfg.prediction.mc_seed == 1


def test_env_overrides_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    cfg = load_config()
    assert str(cfg.data_dir) == str(tmp_path / "data")


def test_missing_keys_fall_back_to_defaults(tmp_path, monkeypatch):
    partial = tmp_path / "twin.config.json"
    partial.write_text(json.dumps({"course": {"grade_clip": 0.3}}), encoding="utf-8")
    monkeypatch.setenv("TWIN_CONFIG_PATH", str(partial))
    cfg = load_config()
    assert cfg.course.grade_clip == 0.3          # surchargé
    assert cfg.course.smooth_window_m == 150.0    # défaut conservé
    assert cfg.twin.f_cap == 3.0                  # bloc absent → défauts
