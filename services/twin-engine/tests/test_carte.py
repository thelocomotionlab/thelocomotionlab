"""La carte de technicité : tranches et géométrie d'une trace, recalage sur OpenStreetMap,
rugosité et occupation du sol lues dans des rasters, géologie sous la trace, et le modèle
appris sur les fenêtres de descente du détecteur, validé hors échantillon.

Tout est synthétique et local : des voies fabriquées, des GeoTIFF écrits dans un dossier
temporaire (géographique, et projeté sans système de coordonnées comme une dalle du RGE
ALTI), une couche GeoJSON, des fenêtres de descente dont la technicité est connue.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from twin_engine.carte import Carte, cle_de_cache, dresser, ecrire_le_cache, lire_le_cache, par_partie  # noqa: E402
from twin_engine.carte import osm as osm_  # noqa: E402
from twin_engine.carte import raster as raster_  # noqa: E402
from twin_engine.carte.geologie import geologie  # noqa: E402
from twin_engine.carte.modele import (Exemples, apprendre, auc, fenetres_du_parcours, probabilites,  # noqa: E402
                                      regions, sources_compatibles, variables_de_fenetre)
from twin_engine.carte.tranches import geometrie, tranches_de  # noqa: E402
from twin_engine.config import load_config  # noqa: E402

CFG = load_config()
LAT0, LON0 = 44.0, 7.0
M_LAT = 6_371_000.0 * math.pi / 180.0          # mètres par degré, sur la sphère des distances
M_LON = M_LAT * math.cos(math.radians(LAT0))


def _nord(longueur_m=1000.0, pente=-0.1, pas=5.0, est_m=0.0):
    """Une trace droite vers le nord, à pente constante."""
    y = np.arange(0.0, longueur_m + pas / 2, pas)
    return LAT0 + y / M_LAT, np.full(y.size, LON0 + est_m / M_LON), 1000.0 + pente * y


def _lacets(n=8, cote_m=100.0, pas=5.0):
    """Des lacets : n branches est-ouest de ``cote_m``, reliées par 20 m vers le nord."""
    xs, ys = [0.0], [0.0]
    for k in range(n):
        sens = 1.0 if k % 2 == 0 else -1.0
        for _ in range(int(cote_m / pas)):
            xs.append(xs[-1] + sens * pas)
            ys.append(ys[-1])
        for _ in range(4):
            xs.append(xs[-1])
            ys.append(ys[-1] + pas)
    x, y = np.asarray(xs), np.asarray(ys)
    return LAT0 + y / M_LAT, LON0 + x / M_LON, 1000.0 - 0.1 * np.arange(x.size) * pas


# --------------------------------------------------------------------------- tranches
def test_the_slices_cut_a_trace_every_fifty_metres_with_its_grade_heading_and_descent():
    lat, lon, alt = _nord(1000.0, -0.1)
    t = tranches_de(lat, lon, alt, CFG)
    assert t.n == 20
    assert np.allclose(np.diff(t.x_m), 50.0, atol=0.5)
    assert np.allclose(t.pente[1:-1], -0.1, atol=0.005)
    assert np.all((t.cap_deg < 1.0) | (t.cap_deg > 359.0))
    assert t.dminus_m[0] == 0.0 and abs(t.dminus_m[-1] - 95.0) < 6.0
    assert np.allclose(t.km, t.x_m / 1000.0)


def test_the_slices_carry_the_official_km_when_given():
    lat, lon, alt = _nord(1000.0)
    x = np.arange(lat.size) * 5.0
    t = tranches_de(lat, lon, alt, CFG, x_m=x, km=x * 1.1 / 1000.0)
    assert np.allclose(t.km, t.x_m * 1.1 / 1000.0)


def test_the_geometry_sees_switchbacks_that_a_straight_line_does_not_have():
    droite = geometrie(tranches_de(*_nord(1500.0), CFG), CFG)
    lacets = geometrie(tranches_de(*_lacets(), CFG), CFG)
    assert droite["lacets_km"].max() == 0.0
    assert lacets["lacets_km"].max() > 0.0
    assert np.median(lacets["virage_deg_100m"]) > np.median(droite["virage_deg_100m"]) + 20.0


# --------------------------------------------------------------------------- OpenStreetMap
def _voie(est_m, *, tags, nord=(-100.0, 1100.0)):
    return {"type": "way", "id": abs(hash((est_m, tuple(sorted(tags.items()))))) % 10**9, "tags": tags,
            "geometry": [{"lat": LAT0 + y / M_LAT, "lon": LON0 + est_m / M_LON} for y in nord]}


def _traversante(nord_m, *, tags, demi=200.0):
    return {"type": "way", "id": int(nord_m * 10) + 7, "tags": tags,
            "geometry": [{"lat": LAT0 + nord_m / M_LAT, "lon": LON0 + x / M_LON} for x in (-demi, demi)]}


def test_a_slice_is_matched_on_the_nearest_way_that_runs_along_the_trace():
    t = tranches_de(*_nord(1000.0), CFG)
    voies = osm_.voies_overpass([
        _voie(10.0, tags={"highway": "path", "sac_scale": "mountain_hiking"}),
        _voie(40.0, tags={"highway": "track"}),
        _traversante(500.0, tags={"highway": "residential"}),
        {"type": "node", "id": 1, "lat": LAT0, "lon": LON0},
        {"type": "way", "id": 2, "tags": {"building": "yes"}, "geometry": _voie(1.0, tags={})["geometry"]},
    ])
    assert len(voies) == 3
    idx, dist = osm_.recaler(t, voies, CFG)
    assert (idx == 0).all()
    assert np.allclose(dist, 10.0, atol=0.5)
    tags = osm_.etiquettes(voies, idx, CFG)
    assert set(tags["sac_scale"]) == {"mountain_hiking"} and set(tags["surface"]) == {None}


def test_a_crossing_way_is_kept_only_when_very_close_and_nothing_runs_along():
    t = tranches_de(*_nord(1000.0), CFG)
    voies = osm_.voies_overpass([_traversante(522.0, tags={"highway": "path"}),
                                 _voie(25.0, tags={"highway": "track"})])
    idx, dist = osm_.recaler(t, voies, CFG)
    pres = np.abs(t.x_m - 522.0) <= 7.0
    assert pres.any() and (idx[pres] == 0).all()
    assert (idx[~pres] == -1).all() and np.isnan(dist[~pres]).all()


def test_the_extract_filter_keeps_only_ways_near_the_traces():
    lat, lon, _ = _nord(1000.0)
    garder = osm_.pres_des_traces([(lat, lon)])
    assert garder([(LAT0 + 0.003, LON0 + 0.004)])
    assert not garder([(LAT0 + 0.5, LON0)])


def test_an_extract_is_read_with_its_tags_and_filtered_near_the_traces(tmp_path):
    pytest.importorskip("osmium")
    noeuds = [(1, LAT0, LON0), (2, LAT0 + 0.005, LON0), (3, LAT0 + 0.5, LON0), (4, LAT0 + 0.505, LON0)]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="test">']
    xml += [f'<node id="{i}" version="1" lat="{la}" lon="{lo}"/>' for i, la, lo in noeuds]
    xml += ['<way id="10" version="1"><nd ref="1"/><nd ref="2"/><tag k="highway" v="path"/>'
            '<tag k="sac_scale" v="mountain_hiking"/></way>',
            '<way id="11" version="1"><nd ref="3"/><nd ref="4"/><tag k="highway" v="track"/></way>',
            '<way id="12" version="1"><nd ref="1"/><nd ref="2"/><tag k="waterway" v="stream"/></way>',
            "</osm>"]
    (tmp_path / "extrait.osm").write_text("\n".join(xml))
    lat, lon, _ = _nord(1000.0)
    voies = osm_.voies_extrait(tmp_path / "extrait.osm", garder=osm_.pres_des_traces([(lat, lon)]))
    assert voies.tags == [{"highway": "path", "sac_scale": "mountain_hiking"}]
    assert len(osm_.voies_extrait(tmp_path / "extrait.osm")) == 2
    assert len(osm_.voies_extrait(tmp_path / "extrait.osm", bbox=(LAT0 + 0.4, LON0 - 0.1, LAT0 + 0.6, LON0 + 0.1))) == 1


def test_ways_round_trip_through_their_json_cache(tmp_path):
    voies = osm_.voies_overpass([_voie(10.0, tags={"highway": "path"})])
    osm_.ecrire_cache(tmp_path / "voies.json", voies)
    relu = osm_.charger_cache(tmp_path / "voies.json")
    assert relu.tags == voies.tags and np.allclose(relu.geometries[0], voies.geometries[0])


# --------------------------------------------------------------------------- rasters
try:
    import rasterio
except ImportError:   # l'extra « carte » n'est pas installé : seules les lectures de raster sautent
    rasterio = None
avec_rasterio = pytest.mark.skipif(rasterio is None, reason="rasterio absent (extra « carte »)")


def test_the_terrain_ruggedness_index_is_the_mean_absolute_difference_to_the_eight_neighbours():
    z = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, 9.0]])
    r = raster_.tri(z)
    assert r[1, 1] == pytest.approx((4 + 3 + 2 + 1 + 1 + 2 + 3 + 4) / 8.0)
    assert np.isnan(r[0, 0])
    # une fenêtre d'une seule ligne (disque coupé au bord d'une tuile) : rien de mesurable
    assert np.isnan(raster_.tri(np.ones((1, 5)))).all()
    assert np.isnan(raster_.pente_des_mailles(np.ones((1, 5)), 30.0, 30.0)).all()


def _geotiff(chemin, valeurs, *, ouest, nord, pas_x, pas_y, crs="EPSG:4326", nodata=None):
    from rasterio.transform import from_origin

    profil = {"driver": "GTiff", "height": valeurs.shape[0], "width": valeurs.shape[1], "count": 1,
              "dtype": "float32", "transform": from_origin(ouest, nord, pas_x, pas_y)}
    if crs:
        profil["crs"] = crs
    if nodata is not None:
        profil["nodata"] = nodata
    with rasterio.open(chemin, "w", **profil) as ds:
        ds.write(valeurs.astype("float32"), 1)


@avec_rasterio
def test_the_ruggedness_is_read_on_a_disc_around_each_slice(tmp_path):
    # MNT géographique à ~10 m : plat au sud, en damier de ±5 m au nord
    pas_deg = 10.0 / M_LAT
    n = 200
    z = np.full((n, n), 500.0)
    damier = (np.add.outer(np.arange(n), np.arange(n)) % 2) * 10.0
    z[: n // 2] += damier[: n // 2]          # lignes du haut = nord
    ouest, nord = LON0 - n / 2 * pas_deg, LAT0 + n * pas_deg
    _geotiff(tmp_path / "mnt.tif", z, ouest=ouest, nord=nord, pas_x=pas_deg, pas_y=pas_deg)
    t = tranches_de(*_nord(1900.0), CFG)
    sources = raster_.Sources(raster_.un_fichier(tmp_path / "mnt.tif"))
    r = raster_.rugosite(t, sources, 30.0)
    sources.fermer()
    sud, nord_ = t.x_m < 800.0, (t.x_m > 1100.0) & (t.x_m < 1800.0)
    assert np.nanmax(r["tri_m"][sud]) < 0.5
    assert np.nanmin(r["tri_m"][nord_]) > 4.0


@avec_rasterio
def test_a_projected_tile_without_a_crs_reads_with_the_default_one(tmp_path):
    from rasterio.warp import transform

    xs, ys = transform("EPSG:4326", "EPSG:2154", [LON0], [LAT0])
    x0, y0 = xs[0] - 500.0, ys[0] + 1500.0
    z = np.tile(np.where(np.arange(1000) % 2 == 0, 0.0, 2.0), (2000, 1))    # rayures de 2 m, 1 m de pas
    dossier = tmp_path / "dalles"
    dossier.mkdir()
    _geotiff(dossier / "dalle.tif", z, ouest=x0, nord=y0, pas_x=1.0, pas_y=1.0, crs=None)
    t = tranches_de(*_nord(1000.0), CFG)
    assert raster_.dalles_locales(dossier)(LAT0, LON0) is None
    sources = raster_.Sources(raster_.dalles_locales(dossier, "EPSG:2154"), "EPSG:2154")
    r = raster_.rugosite(t, sources, 30.0)
    sources.fermer()
    dedans = np.isfinite(r["tri_m"])
    assert dedans.sum() >= t.n - 2
    assert np.allclose(r["tri_m"][dedans], 1.5, atol=0.1)    # 6 voisines sur 8 à 2 m


@avec_rasterio
def test_the_land_cover_gives_the_main_class_and_the_bare_share(tmp_path):
    pas_deg = 10.0 / M_LAT
    n = 200
    sol = np.full((n, n), 10.0)
    sol[: n // 2] = 60.0
    _geotiff(tmp_path / "sol.tif", sol, ouest=LON0 - n / 2 * pas_deg, nord=LAT0 + n * pas_deg,
             pas_x=pas_deg, pas_y=pas_deg, nodata=0.0)
    t = tranches_de(*_nord(1900.0), CFG)
    o = raster_.occupation(t, raster_.Sources(raster_.un_fichier(tmp_path / "sol.tif")), 30.0)
    assert o["occupation"][0] == 10 and o["occupation"][-2] == 60
    assert o["part_sol_nu"][0] == 0.0 and o["part_sol_nu"][-2] == 1.0


@avec_rasterio
def test_an_unreadable_source_leaves_the_slices_empty_and_says_so():
    t = tranches_de(*_nord(500.0), CFG)
    sources = raster_.Sources(lambda lat, lon: "/nulle/part.tif")
    r = raster_.rugosite(t, sources, 30.0)
    assert np.isnan(r["tri_m"]).all() and sources.illisibles == ["/nulle/part.tif"]


def test_the_tile_urls_follow_the_open_data_naming():
    assert raster_.url_copernicus(43.7, 7.2).endswith(
        "Copernicus_DSM_COG_10_N43_00_E007_00_DEM/Copernicus_DSM_COG_10_N43_00_E007_00_DEM.tif")
    assert raster_.url_worldcover(43.7, 7.2).endswith("ESA_WorldCover_10m_2021_v200_N42E006_Map.tif")
    assert "S01" in raster_.url_copernicus(-0.5, -0.5) and "W001" in raster_.url_copernicus(-0.5, -0.5)


# --------------------------------------------------------------------------- géologie
def test_the_geology_is_the_polygon_under_each_slice_holes_excluded(tmp_path):
    def carre(y0, y1, x0=-200.0, x1=200.0):
        return [[LON0 + x / M_LON, LAT0 + y / M_LAT] for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))]

    couche = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"LITHO": "calcaire"},
         "geometry": {"type": "Polygon", "coordinates": [carre(0.0, 500.0), carre(200.0, 300.0, -50.0, 50.0)]}},
        {"type": "Feature", "properties": {"LITHO": "gneiss"},
         "geometry": {"type": "MultiPolygon", "coordinates": [[carre(600.0, 800.0)]]}},
    ]}
    (tmp_path / "geol.geojson").write_text(json.dumps(couche))
    t = tranches_de(*_nord(1000.0), CFG)
    g = geologie(t, tmp_path / "geol.geojson", "LITHO")
    assert g[0] == "calcaire" and g[int(np.argmin(np.abs(t.x_m - 250.0)))] is None
    assert g[int(np.argmin(np.abs(t.x_m - 700.0)))] == "gneiss" and g[-1] is None


# --------------------------------------------------------------------------- la carte
def _carte_simple():
    t = tranches_de(*_nord(1000.0), CFG)
    voies = osm_.voies_overpass([_voie(5.0, tags={"highway": "path", "sac_scale": "hiking"},
                                       nord=(-100.0, 600.0))])
    return dresser(t, CFG, voies=voies)


def test_the_map_measures_its_coverage_and_compares_two_parts():
    c = _carte_simple()
    cov = c.couverture()
    assert cov["virage_deg_100m"]["toute"] == 1.0
    assert 0.5 < cov["recale"]["toute"] < 0.7 and cov["sac_scale"]["toute"] == cov["recale"]["toute"]
    assert c.sources == {"osm": True, "mnt": None, "sol": False, "geologie": None}
    p = par_partie(c, 0.5)
    assert p["toute"]["avant"]["km"] == 0.5 and p["toute"]["avant"]["recale"] == 1.0
    assert p["toute"]["apres"]["sac_scale"]["absente"] == pytest.approx(0.8)
    assert p["descentes"]["avant"]["sac_scale"] == {"hiking": 1.0}


def test_the_coverage_of_the_training_runs_counts_every_slice_and_the_runs_off_the_extracts():
    from tools.carte import _couverture_des_sorties, couverture_des_sorties

    couverte = _carte_simple()
    hors = dresser(tranches_de(*_nord(1000.0, est_m=50_000.0), CFG), CFG, voies=osm_.voies_overpass([]))
    cov, sans_voie = couverture_des_sorties({"a": couverte, "b": hors})
    assert sans_voie == 1 and cov["virage_deg_100m"]["toute"] == 1.0
    assert cov["recale"]["descentes"] == pytest.approx(couverte.couverture()["recale"]["descentes"] / 2,
                                                       abs=0.01)
    assert "Sorties sans aucune voie OSM recalée : 1 sur 2" in "\n".join(
        _couverture_des_sorties({"a": couverte, "b": hors}))
    # sans extrait OSM du tout, il n'y a pas de sortie « hors des extraits » à compter
    assert "Sorties sans" not in "\n".join(_couverture_des_sorties({"b": dresser(hors.tranches, CFG)}))


def test_a_trace_off_the_extracts_is_kept_out_of_learning_and_refused_the_map():
    from datetime import date

    from tools.carte import Activite, exemples_de
    from twin_engine.carte import hors_des_extraits, sans_voie_osm
    from twin_engine.config import override_config

    couverte = _carte_simple()
    hors = dresser(tranches_de(*_nord(1000.0, est_m=50_000.0), CFG), CFG, voies=osm_.voies_overpass([]))
    sans_osm = dresser(couverte.tranches, CFG)
    assert not sans_voie_osm(couverte) and sans_voie_osm(hors) and not sans_voie_osm(sans_osm)
    assert hors_des_extraits(couverte, CFG) is None and hors_des_extraits(sans_osm, CFG) is None
    assert hors_des_extraits(hors, CFG).startswith("trace hors des extraits OSM donnés : 0 %")
    assert hors_des_extraits(couverte, override_config(CFG, "carte.couverture_osm_min=0.9")) is not None

    fenetre = [{"debut_m": 0.0, "fin_m": 250.0, "hache": True, "classe": 1, "dminus_m": 0.0}]
    acts = [Activite("a", date(2026, 5, 1), 1.0, couverte.tranches, fenetre),
            Activite("b", date(2026, 5, 2), 1.0, hors.tranches, fenetre)]
    ex = exemples_de(acts, {"a": couverte, "b": hors})
    assert list(ex.jour.values()) == ["2026-05-01"] and len(ex) == 1


def test_the_map_round_trips_through_its_cache(tmp_path):
    c = _carte_simple()
    cle = cle_de_cache(c.tranches, CFG, ["osm:test"])
    assert cle != cle_de_cache(c.tranches, CFG, ["osm:test", "mnt:copernicus"])
    ecrire_le_cache(tmp_path, cle, c)
    relu = lire_le_cache(tmp_path, cle)
    assert relu.variables["sac_scale"] == c.variables["sac_scale"]
    assert np.allclose(relu.tranches.km, c.tranches.km) and relu.sources == c.sources
    assert lire_le_cache(tmp_path, "absente") is None


def test_a_window_takes_the_mean_of_numbers_and_the_main_label():
    c = _carte_simple()
    v = variables_de_fenetre(c, 400.0, 800.0)
    assert v["sac_scale"] == "absente" and 0.2 < v["recale"] < 0.6
    v = variables_de_fenetre(c, 100.0, 300.0)
    assert v["sac_scale"] == "hiking" and v["recale"] == 1.0
    assert variables_de_fenetre(c, 101.0, 102.0)["sac_scale"] == "hiking"   # tranche la plus proche


# --------------------------------------------------------------------------- le modèle
def _carte_etiquetee(etiquettes, *, lat0=LAT0):
    """Une carte de tranches de 50 m dont chaque tranche porte l'étiquette donnée."""
    n = len(etiquettes)
    y = np.arange(n * 10 + 1) * 5.0
    t = tranches_de(lat0 + y / M_LAT, np.full(y.size, LON0), 1000.0 - 0.15 * y, CFG)
    rng = np.random.default_rng(len(etiquettes))
    return Carte(t, {"sac_scale": list(etiquettes)[: t.n], "tri_m": list(rng.normal(8.0, 2.0, t.n)),
                     "recale": [True] * t.n}, [], {"osm": True, "mnt": "copernicus"})


def _exemples(signal: bool, *, activites=12, fenetres=40, graine=1):
    rng = np.random.default_rng(graine)
    ex = Exemples()
    for a in range(activites):
        lat0 = LAT0 + (a % 3) * 1.0      # trois régions, à ~110 km l'une de l'autre
        tags = rng.choice(["hiking", "demanding_mountain_hiking", None], size=fenetres * 5)
        c = _carte_etiquetee(tags, lat0=lat0)
        fen = []
        for k in range(fenetres):
            v = variables_de_fenetre(c, k * 250.0, k * 250.0 + 249.0)
            p = 0.15
            if signal and v["sac_scale"] == "demanding_mountain_hiking":
                p = 0.75
            fen.append({"debut_m": k * 250.0, "fin_m": k * 250.0 + 249.0, "hache": bool(rng.random() < p),
                        "classe": 1, "dminus_m": 100.0 * k, "nuit": None})
        ex.ajouter(f"a{a:03d}", fen, c)
    return ex


def test_the_model_finds_a_label_that_makes_descents_choppy_out_of_sample():
    m = apprendre(_exemples(True), CFG, sources={"osm": True, "mnt": "copernicus"})
    assert m["signal"] is True and m["n_regions"] == 3
    v = m["validation"]
    assert v["activites"]["perte_carte"] < v["activites"]["perte_controles"]
    assert v["regions"]["perte_carte"] < v["regions"]["perte_controles"]
    assert v["activites"]["auc_carte"] > v["activites"]["auc_controles"] + 0.1
    coefs = dict(zip(m["colonnes"], m["coefficients"]))
    assert coefs["sac_scale=demanding_mountain_hiking"] > coefs["sac_scale=hiking"] + 1.0
    assert v["activites"]["z"] >= 2.0 and v["regions"]["z"] >= 2.0
    assert "centre" not in json.dumps(m) and '"lat' not in json.dumps(m)


def test_without_a_link_between_the_map_and_choppy_descents_the_model_says_no_signal():
    m = apprendre(_exemples(False, graine=3), CFG)
    assert m["signal"] is False
    assert m["validation"]["activites"]["gain_relatif"] <= 0.01


def test_too_few_labelled_windows_give_no_model_and_the_reason():
    m = apprendre(_exemples(True, activites=1, fenetres=20), CFG)
    assert m["signal"] is False and "coefficients" not in m and "fenêtres hachées" in m["raison"]


def test_the_regions_join_activities_close_to_one_another():
    r = regions({"a": (44.0, 7.0), "b": (44.2, 7.0), "c": (44.4, 7.0), "d": (45.5, 7.0)}, 30.0)
    assert r["a"] == r["b"] == r["c"] != r["d"]


def test_the_auc_handles_ties():
    assert auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert auc(np.array([0, 1, 0, 1]), np.array([0.5, 0.5, 0.5, 0.5])) == 0.5
    assert auc(np.array([1, 1]), np.array([0.1, 0.2])) is None


def test_the_model_applies_to_the_descents_of_a_course_map_only():
    m = apprendre(_exemples(True), CFG, sources={"osm": True, "mnt": "copernicus"})
    tags = ["demanding_mountain_hiking"] * 40 + ["hiking"] * 40
    c = _carte_etiquetee(tags)
    assert sources_compatibles(m, c) == []
    assert sources_compatibles(m, Carte(c.tranches, c.variables, [], {"osm": True, "mnt": "dalles:rge"})) == ["mnt"]
    f = fenetres_du_parcours(c, CFG)
    assert f["descente"].all()
    p = probabilites(c, m, CFG, frais=True)
    assert np.nanmean(p["p"][:30]) > np.nanmean(p["p"][-30:]) + 0.2
    plat = Carte(tranches_de(*_nord(1000.0, 0.0), CFG), {"recale": [True] * 20}, [], {})
    assert np.isnan(probabilites(plat, m, CFG)["p"]).all()


def test_the_examples_round_trip_through_json():
    ex = _exemples(True, activites=2, fenetres=5)
    relu = Exemples.depuis_json(json.loads(json.dumps(ex.to_json())))
    assert relu.hache == ex.hache and relu.lignes == ex.lignes and relu.centre == ex.centre


# --------------------------------------------------------------------------- l'outil
def _overpass_le_long_de_la_sortie(chemin: Path) -> None:
    """Deux voies sur la ligne de la sortie synthétique (vers l'est) : un sentier « hiking »
    sur ses 6 premiers km, « demanding_mountain_hiking » au-delà."""
    from test_descentes import LAT0 as LAT_S
    from test_descentes import LON0 as LON_S

    def lon(m):
        return LON_S + m / (111_320.0 * math.cos(math.radians(LAT_S)))

    def voie(i, de, a, sac):
        return {"type": "way", "id": i, "tags": {"highway": "path", "sac_scale": sac},
                "geometry": [{"lat": LAT_S, "lon": lon(x)} for x in np.arange(de, a + 1.0, 100.0)]}

    chemin.write_text(json.dumps({"elements": [voie(1, -100.0, 6000.0, "hiking"),
                                               voie(2, 6000.0, 12200.0, "demanding_mountain_hiking")]}))


def test_the_tool_sets_the_choppy_sections_of_a_race_file_against_the_map(tmp_path, capsys):
    from datetime import datetime, timezone

    from test_descentes import _gpx, _sortie
    from tools.carte import main

    course = tmp_path / "course.gpx"
    course.write_bytes(_gpx(_sortie(reps=8, hachee_apres=4, jour=datetime(2026, 6, 1, tzinfo=timezone.utc))))
    _overpass_le_long_de_la_sortie(tmp_path / "osm.json")
    args = ["activite", "--activite", str(course), "--osm", str(tmp_path / "osm.json"),
            "--cache", str(tmp_path / "cache"), "--coupure-km", "6"]
    assert main([*args, "--json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["hachees"] > 0 and len(out["troncons_haches"]) == 4       # une descente hachée par répétition
    assert all(tr["carte"]["sac_scale"] == "demanding_mountain_hiking" for tr in out["troncons_haches"])
    contraste = out["hachees_contre_courables"]["toutes les fenêtres"]["variables"]["sac_scale"]["modalites"]
    assert contraste["demanding_mountain_hiking"][0] == 1.0 and contraste["hiking"][1] > 0.9
    assert out["sources"]["osm"] and "ODbL" in out["attributions"][0]
    assert list((tmp_path / "cache" / "cartes").glob("*.json"))
    assert main(args) == 0
    assert "Tronçons hachés" in capsys.readouterr().out


def test_the_tool_learns_a_model_from_an_archive_and_applies_it_to_a_course(tmp_path, capsys):
    from datetime import datetime, timezone

    from test_descentes import _gpx, _sortie
    from tools.carte import main

    archive = tmp_path / "archive"
    archive.mkdir()
    for j, h in ((1, 2), (2, 4), (3, 6), (4, 3)):
        (archive / f"s{j}.gpx").write_bytes(_gpx(_sortie(reps=8, hachee_apres=h,
                                                          jour=datetime(2026, 5, j, tzinfo=timezone.utc))))
    (archive / "apres.gpx").write_bytes(_gpx(_sortie(reps=8, hachee_apres=1,
                                                      jour=datetime(2026, 7, 1, tzinfo=timezone.utc))))
    _overpass_le_long_de_la_sortie(tmp_path / "osm.json")
    reglages = ["--set", "carte.modele_min_fenetres=5", "--cache", str(tmp_path / "cache"),
                "--osm", str(tmp_path / "osm.json")]
    assert main(["modele", "--archive", str(archive), "--until", "2026-06-30",
                 "--out", str(tmp_path / "modele.json"), *reglages]) == 0
    sortie = capsys.readouterr().out
    assert "Modèle de la carte — 4 activités" in sortie
    assert "## Couverture des sorties" in sortie and "Sorties sans aucune voie OSM recalée : 0 sur 4" in sortie
    modele = json.loads((tmp_path / "modele.json").read_text())
    assert modele["n_activites"] == 4 and modele["until"] == "2026-06-30"
    assert '"lat' not in json.dumps(modele) and "centre" not in json.dumps(modele)
    assert (tmp_path / "cache" / "exemples.json").exists()

    course = tmp_path / "parcours.gpx"
    course.write_bytes(_gpx(_sortie(reps=8, jour=datetime(2026, 8, 1, tzinfo=timezone.utc))))
    assert main(["parcours", "--course", str(course), "--coupure-km", "6", "--modele",
                 str(tmp_path / "modele.json"), "--json", *reglages]) == 0
    out = json.loads(capsys.readouterr().out)
    # km officiel du parcours sans carnet = distance 3D : la coupure tombe un peu avant 6 km à plat
    assert out["parties"]["descentes"]["apres"]["sac_scale"]["demanding_mountain_hiking"] > 0.95
    tech = out["technicite"]["parties"]
    assert set(tech) == {"toute la trace", "avant le km 6", "après le km 6"}
    assert 0.0 <= tech["après le km 6"]["p_frais"] <= 1.0
    if rasterio is not None:
        _geotiff(tmp_path / "mnt.tif", np.zeros((50, 50)), ouest=6.9, nord=44.1, pas_x=0.004, pas_y=0.004)
        assert main(["parcours", "--course", str(course), "--modele", str(tmp_path / "modele.json"),
                     "--mnt", str(tmp_path / "mnt.tif"), *reglages]) == 2      # pas le même MNT que le modèle
        assert "sources différentes de la carte (mnt)" in capsys.readouterr().err
