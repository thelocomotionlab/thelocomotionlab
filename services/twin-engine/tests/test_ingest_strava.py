"""Ingestion de l'export en masse Strava (« Download your archive », RGPD).

Le fixture ``strava_export_fixture.zip`` décalque un export réel (anonymisé : aucun e-mail,
colonnes PII vidées) :

* ``activities/`` : 6 ``.fit.gz`` + 1 ``.gpx.gz`` (traces gzippées, formats mélangés) ;
* ``activities.csv`` : l'INDEX, en-tête et valeurs **en français** (« Type d'activité »,
  « Nom du fichier », « Course à pied »/« Vélo »/« Natation ») + une 2ᵉ colonne piège « Type » ;
* du bruit à ignorer : ``media/`` (photos jpg/mp4), ``routes/``, et ~40 CSV racine.

Attendu : **exactement 5 activités de course** (4 issues de ``.fit.gz`` auto-classées par leur
sport embarqué, 1 de ``.gpx.gz``), vélo/natation/bruit écartés. Les tests synthétiques prouvent
les vrais livrables : classement d'un ``.gpx`` SANS ``<type>`` via le CSV localisé (fr **et** de),
repérage de la colonne fichier PAR SES VALEURS, et exclusion de ``routes/`` avant lecture.
"""

from __future__ import annotations

import csv
import gzip
import io
import zipfile
from collections import Counter
from pathlib import Path

from twin_engine.ingest import ingest_path

FIX = Path(__file__).parent / "fixtures"
STRAVA = FIX / "strava_export_fixture.zip"


# --------------------------------------------------------------------------- #
# Intégration sur le fixture réel (en-tête localisé français).
def test_strava_export_keeps_exactly_five_running():
    result = ingest_path(STRAVA, running_only=True)
    assert len(result.activities) == 5
    assert all(a.is_running for a in result.activities)
    # 4 course venues de .fit.gz + 1 de .gpx.gz
    assert Counter(a.source_format for a in result.activities) == {"fit": 4, "gpx": 1}
    # vélo et natation : seuls fichiers d'activités non-course → « ignoré : sport »
    assert sorted(s["reason"] for s in result.skipped) == [
        "sport ignoré: cycling",
        "sport ignoré: swimming",
    ]


def test_strava_full_breakdown_excludes_non_running_and_noise():
    """Sans filtre : uniquement les 7 fichiers d'activities/ (media/, routes/, CSV racine hors périmètre)."""
    result = ingest_path(STRAVA)
    assert len(result.activities) == 7
    assert Counter(a.sport for a in result.activities) == {"running": 5, "cycling": 1, "swimming": 1}
    assert len(result.running) == 5
    assert all(a.source_name.startswith("activity-") for a in result.activities)


# --------------------------------------------------------------------------- #
# Livrables robustes, prouvés sur des archives synthétiques minimales.
def _gpx(n: int = 150, *, with_type: bool = False) -> bytes:
    typ = "<type>running</type>" if with_type else ""
    pts = "".join(
        f'<trkpt lat="43.70" lon="{7.26 + i * 0.001:.4f}">'
        f"<ele>{100 + i * 0.1:.1f}</ele><time>2024-01-01T08:{i // 60:02d}:{i % 60:02d}Z</time></trkpt>"
        for i in range(n)
    )
    return (
        '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
        f"<trk>{typ}<trkseg>{pts}</trkseg></trk></gpx>"
    ).encode()


def _strava_zip(tmp_path, name, header, rows, members):
    """Construit un zip type-Strava : activities.csv (header/rows) + membres bruts."""
    buf = io.StringIO()
    csv.writer(buf).writerows([header, *rows])
    z = tmp_path / name
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("activities.csv", buf.getvalue())
        for path, data in members.items():
            zf.writestr(path, data)
    return z


def test_localized_csv_classifies_typeless_gpx_french(tmp_path):
    """Un .gpx SANS <type> récupère « course » depuis un activities.csv français."""
    z = _strava_zip(
        tmp_path, "fr.zip",
        ["ID de l'activité", "Type d'activité", "Nom du fichier"],
        [["1", "Course à pied", "activities/run.gpx"]],
        {"activities/run.gpx": _gpx()},
    )
    result = ingest_path(z, running_only=True)
    assert len(result.activities) == 1 and result.activities[0].is_running


def test_localized_csv_classifies_typeless_gpx_german(tmp_path):
    """Même chose en allemand (en-tête ET valeur traduits : « Laufen »/« Dateiname »)."""
    z = _strava_zip(
        tmp_path, "de.zip",
        ["Aktivitäts-ID", "Aktivitätstyp", "Dateiname"],
        [["1", "Laufen", "activities/lauf.gpx"]],
        {"activities/lauf.gpx": _gpx()},
    )
    result = ingest_path(z, running_only=True)
    assert len(result.activities) == 1 and result.activities[0].is_running


def test_file_column_detected_by_value_not_header(tmp_path):
    """Colonnes aux en-têtes non évocateurs : repérées par le contenu (fichier + course)."""
    z = _strava_zip(
        tmp_path, "opaque.zip",
        ["col_a", "col_b", "col_c"],                    # aucun en-tête ne dit « type » ni « fichier »
        [["Course à pied", "42", "activities/run.gpx"]],
        {"activities/run.gpx": _gpx()},
    )
    result = ingest_path(z, running_only=True)
    assert len(result.activities) == 1 and result.activities[0].is_running


def test_typeless_gpx_without_csv_row_is_not_guessed(tmp_path):
    """Un .gpx sans <type> ET sans ligne CSV correspondante n'est pas deviné → écarté."""
    z = _strava_zip(
        tmp_path, "orphan.zip",
        ["ID de l'activité", "Type d'activité", "Nom du fichier"],
        [["1", "Course à pied", "activities/known.gpx"]],
        {"activities/known.gpx": _gpx(), "activities/orphan.gpx": _gpx()},
    )
    result = ingest_path(z, running_only=True)
    assert len(result.activities) == 1                  # known classé, orphan écarté (sport inconnu)


def test_routes_folder_is_excluded_before_reading(tmp_path):
    """Périmètre activities/ : une trace de course dans routes/ (même avec <type>) est écartée."""
    z = _strava_zip(
        tmp_path, "routes.zip",
        ["ID de l'activité", "Type d'activité", "Nom du fichier"],
        [["1", "Course à pied", "activities/keep.gpx.gz"]],
        {
            "activities/keep.gpx.gz": gzip.compress(_gpx()),
            "routes/tempting.gpx": _gpx(with_type=True),   # course valide, mais hors activities/
            "media/photo.jpg": b"\xff\xd8\xff" + b"0" * 4000,
        },
    )
    result = ingest_path(z, running_only=True)
    assert len(result.activities) == 1                  # seule activities/keep.gpx.gz est retenue
    assert result.activities[0].source_format == "gpx"
