"""Ingestion des exports RGPD Garmin (« Exporter toutes vos données ») + marcheur générique.

Le fixture ``garmin_export_fixture.zip`` reproduit la structure réelle d'un tel export
(entièrement synthétique, e-mail réservé ``athlete@example.com``) :

* des zips **imbriqués** (UploadedFiles_…_PartN.zip) + des zips-leurres vides (backups) ;
* 14 fichiers ``.fit`` : 6 course (3 trail, 2 ultra, 1 generic), 1 vélo, 1 alpinisme,
  et 6 fichiers de **bruit** (monitoring/réglages) de quelques centaines d'octets ;
* 188 ``.json`` + 3 ``.png`` (profil, social, summarizedActivities…) à **ignorer**.

On vérifie que l'ingestion ne retient QUE la course à pied, en lisant le sport DANS le
fichier (jamais d'après le nom, qui porte de la PII, ni d'après summarizedActivities), et
qu'aucun nom brut ne fuite. Le marcheur, lui, reste générique (testé à part).

L'archive contient deux ``.fit`` volumineux (ultra) : on l'ingère **une seule fois par
mode** via des fixtures de portée module pour garder la suite rapide.
"""

from __future__ import annotations

import zipfile
from collections import Counter
from pathlib import Path

import pytest

from twin_engine.ingest import ingest_path
from twin_engine.ingest.walker import walk_activity_files

FIX = Path(__file__).parent / "fixtures"
GARMIN = FIX / "garmin_export_fixture.zip"


@pytest.fixture(scope="module")
def running_ingest():
    """Ingestion filtrée course-à-pied (parse l'archive une fois pour tout le module)."""
    return ingest_path(GARMIN, running_only=True)


@pytest.fixture(scope="module")
def full_ingest():
    """Ingestion non filtrée (toutes les traces exploitables)."""
    return ingest_path(GARMIN)


def test_garmin_export_keeps_only_running_read_from_file(running_ingest):
    """6 course exactement (3 trail, 2 ultra, 1 generic) ; vélo/alpinisme/bruit exclus."""
    result = running_ingest

    assert len(result.activities) == 6
    assert all(a.is_running for a in result.activities)
    # sport principal = running ; le sous-sport reste fidèle à la source (non aliasé)
    assert Counter(a.sub_sport for a in result.activities) == {"trail": 3, "ultra": 2, "generic": 1}

    # vélo et alpinisme : présents dans l'archive mais jamais retenus
    sports = {a.sport for a in result.activities}
    assert "cycling" not in sports and "mountaineering" not in sports

    # seuls le vélo et l'alpinisme partent en « ignoré » (le bruit < 1 Ko est pré-filtré,
    # donc jamais lu) → 6 retenues + 2 ignorées = 8 fichiers d'activité réellement traités.
    assert len(result.skipped) == 2
    assert len(result.activities) + len(result.skipped) == 8
    assert all(s["reason"].startswith("sport ignoré") for s in result.skipped)


def test_garmin_export_anonymises_every_name(running_ingest):
    """Garde-fou PII : aucun nom brut (e-mail, identifiant) ne survit à l'ingestion."""
    names = [a.source_name for a in running_ingest.activities]
    names += [s["name"] for s in running_ingest.skipped]
    assert names  # non vide
    for n in names:
        assert n.startswith("activity-")
        assert "@" not in n and "example.com" not in n
    # la raison d'exclusion ne nomme que le sport, jamais le fichier
    assert all("@" not in s["reason"] for s in running_ingest.skipped)


def test_garmin_export_full_breakdown_without_filter(full_ingest):
    """Sans filtre : 6 course + 1 vélo + 1 alpinisme ; le bruit reste pré-filtré (0 ignoré)."""
    assert len(full_ingest.activities) == 8
    assert full_ingest.skipped == []
    assert Counter(a.sport for a in full_ingest.activities) == {
        "running": 6,
        "cycling": 1,
        "mountaineering": 1,
    }
    # la propriété .running redonne le même sous-ensemble que le mode running_only
    assert len(full_ingest.running) == 6


# --------------------------------------------------------------------------- #
# Marcheur générique : récursion zip-dans-zip, filtre d'extension et de taille,
# sans aucune connaissance de marque (pas de CSV, pas de sport).
def test_walker_recurses_and_filters_generically(tmp_path):
    good = (FIX / "sample.gpx").read_bytes()      # ~25 Ko, profondément imbriqué
    inner = tmp_path / "inner.zip"
    with zipfile.ZipFile(inner, "w") as zf:
        zf.writestr("deep/run.gpx", good)
        zf.writestr("deep/notes.json", b'{"k": "v"}')      # ignoré : pas une trace
    outer = tmp_path / "outer.zip"
    with zipfile.ZipFile(outer, "w") as zf:
        zf.writestr("image.png", b"\x89PNG" + b"0" * 2000)  # ignoré : extension
        zf.writestr("tiny.fit", b"x" * 400)                 # ignoré : < 1 Ko (bruit)
        zf.writestr("summary.json", b"[]")                  # ignoré : extension
        zf.writestr("UploadedFiles_Part1.zip", inner.read_bytes())

    found = list(walk_activity_files(outer))
    assert [name for name, _ in found] == ["run.gpx"]       # uniquement la trace réelle
    assert found[0][1] == good                              # octets restitués intacts


def test_walker_accepts_bytes_and_path_equivalently():
    data = GARMIN.read_bytes()
    by_bytes = sorted(n for n, _ in walk_activity_files(data))
    by_path = sorted(n for n, _ in walk_activity_files(GARMIN))
    assert by_bytes == by_path
    # 14 .fit dans l'archive, dont 6 de bruit (< 1 Ko) écartés → 8 traces exploitables
    assert len(by_bytes) == 8
