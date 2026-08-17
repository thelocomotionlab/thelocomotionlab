// components/outils/CarrouselAtelier.jsx
//
// L'ATELIER CARROUSEL : une trace + des cartes → un lot d'images à publier.
//
// TOUT SE PASSE DANS LE NAVIGATEUR, comme l'habillage de photo : ni la trace ni
// les photos ne quittent l'appareil, il n'y a donc rien à stocker et rien à
// purger. C'est aussi ce qui permet d'ouvrir l'outil sur le téléphone, au
// bivouac, sans réseau — sauf pour le fond de carte, qui dégrade proprement.
//
// CE QUE L'OUTIL N'EST PAS : un Canva. On ne pose pas n'importe quoi n'importe
// où. On remplit DES GABARITS, ce qui garantit que deux carrousels publiés à
// six mois d'écart se ressemblent. La personnalisation porte sur ce qui change
// d'une aventure à l'autre — les textes, le découpage, les couleurs des
// journées, le cadrage, la position des étiquettes — pas sur la mise en page.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageUp, Loader2, Map as MapIcon, Plus, Route, Trash2 } from "lucide-react";

import {
  FORMATS,
  GABARITS,
  PALETTE_JOURS,
  THEMES,
  chargerFond,
  dessinerCartePartage,
  dureeCourte,
  vueDeLaCarte,
} from "@/lib/carrouselCartes";
import {
  coupuresDepuisWaypoints,
  coupuresRegulieres,
  decouperTrace,
  etiquetteParDefaut,
  traceDepuisGpx,
  traceDepuisTrackJson,
} from "@/lib/carrouselTrace";
import { chargerImage } from "@/lib/imageFile";
import { chargerMarqueTeintee } from "@/lib/marque";
import { liveConfig } from "@/lib/liveConfig";

const CHAMP =
  "w-full rounded-xl border border-brand-field bg-brand-paper px-3 py-2 font-heading text-[15px] text-brand-text focus:border-brand-primary-dark focus:outline-none";
const BOUTON_PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-deep px-5 py-2.5 font-heading text-[14px] font-medium text-brand-bg transition-colors hover:bg-brand-deep-dark disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
const BOUTON_SECOND =
  "inline-flex items-center justify-center gap-2 rounded-full border border-brand-primary/45 bg-brand-primary/12 px-4 py-2 font-heading text-[14px] font-medium text-brand-primary-dark transition-colors hover:border-brand-primary-dark hover:bg-brand-primary/30 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
const LEGENDE = "mb-1 block font-heading text-[13px] font-medium text-brand-text/70";

/** Même lecture que l'habillage : la font-family RÉSOLUE du body, pas la
 *  variable next/font (vide sur documentElement — le canvas partait alors en
 *  police système sans que rien ne le signale). */
function policeUbuntu() {
  if (typeof document === "undefined") return "sans-serif";
  const famille = getComputedStyle(document.body).fontFamily;
  return famille && famille !== "" ? famille : "sans-serif";
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation différée : Safari annule le téléchargement si l'URL meurt trop
  // tôt après le clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** La fiche d'une aventure, pré-remplie avec ce que la trace sait déjà. Les
 *  deux dernières lignes, l'atelier ne peut pas les deviner : elles sont là
 *  pour être remplies, pas pour être justes. */
function ficheParDefaut(trace, segments) {
  return [
    { label: "Distance", valeur: trace ? `${Math.round(trace.totalKm)} km` : "", accent: false },
    { label: "Dénivelé", valeur: trace ? `${trace.dPlusM.toLocaleString("fr-FR")} m` : "", accent: false },
    {
      label: "Durée visée",
      valeur: segments?.length > 1 ? `${segments.length} jours` : "",
      accent: false,
    },
    { label: "Sac de départ", valeur: "", accent: false },
    { label: "Ravitaillement", valeur: "aucun", accent: true },
  ];
}

let compteur = 0;
function carteNeuve(gabarit, trace, segments) {
  compteur += 1;
  return {
    id: `c${compteur}`,
    gabarit,
    /** L'intitulé de la bande d'en-tête, à droite de la marque. */
    entete: "",
    enteteAccent: false,
    /** Le surtitre en capitales, précédé du filet ambre. */
    surtitre: gabarit === "carte" ? (trace?.vecue ? "La sortie" : "L'itinéraire") : "",
    titre: gabarit === "carte" ? (trace?.nom ?? liveConfig.aventure.nom) : "",
    texte: "",
    pied: null,
    /** Le pied de page : au milieu, et à droite (à défaut « GLISSE → »). */
    piedCentre: "",
    piedDroite: "",
    etiquettes: [],
    afficherFond: true,
    afficherProfil: true,
    afficherAltitudes: true,
    image: null,
    nomImage: "",
    ancrage: 0.5,
    degradeHaut: true,
    degradeBas: true,
    bandeauPart: 0.42,
    fiche: gabarit === "fiche" ? ficheParDefaut(trace, segments) : [],
    segment: null,
  };
}

export default function CarrouselAtelier() {
  const canvasRef = useRef(null);
  const boitesRef = useRef([]);
  const glisseRef = useRef(null);

  const [trace, setTrace] = useState(null);
  const [formatCle, setFormatCle] = useState("carrousel");
  const [themeCle, setThemeCle] = useState("sombre");
  // AVANT ou APRÈS : c'est une propriété du CARROUSEL, pas d'une carte.
  // Un carrousel annonce une aventure ou la raconte — jamais les deux.
  const [bilan, setBilan] = useState(false);
  const [coupures, setCoupures] = useState([]);
  const [cartes, setCartes] = useState([]);
  const [active, setActive] = useState(0);
  const [fond, setFond] = useState(null);
  const [marque, setMarque] = useState(null);
  const [policePrete, setPolicePrete] = useState(false);
  const [etat, setEtat] = useState({ occupe: false, message: "" });

  const format = FORMATS[formatCle];
  const segments = useMemo(() => decouperTrace(trace, coupures), [trace, coupures]);
  const carte = cartes[active] ?? null;

  /* --------------------------------------------------------------- chargements */

  useEffect(() => {
    let vivant = true;
    const famille = policeUbuntu();
    Promise.all([
      document.fonts.load(`700 76px ${famille}`),
      document.fonts.load(`500 30px ${famille}`),
      document.fonts.load(`400 34px ${famille}`),
    ])
      .catch(() => {})
      .then(() => vivant && setPolicePrete(true));
    return () => {
      vivant = false;
    };
  }, []);

  // La marque suit le thème : teintée crème elle disparaîtrait sur un fond
  // clair, et l'inverse sur un fond sombre.
  useEffect(() => {
    let vivant = true;
    chargerMarqueTeintee(THEMES[themeCle].encre)
      .then((c) => vivant && setMarque(c))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [themeCle]);

  // Le fond de carte suit la trace ET le format (le cadrage change avec le
  // rapport de l'image). Un chargement plus ancien qui reviendrait après un
  // plus récent est ignoré : `vivant` sert de garde.
  useEffect(() => {
    let vivant = true;
    // Pas de garde synchrone ici : `vueDeLaCarte` rend null sans coordonnées et
    // `chargerFond` l'absorbe. Tout passe donc par la promesse — un setState
    // posé directement dans le corps de l'effet déclencherait un rendu en
    // cascade (et le lint le refuse, à raison).
    chargerFond(vueDeLaCarte(trace?.coords ?? [], formatCle))
      .then((f) => vivant && setFond(f))
      .catch(() => vivant && setFond(null));
    return () => {
      vivant = false;
    };
  }, [trace, formatCle]);

  /**
   * @param {object|null} t
   * @param {boolean} deLAventure - vrai seulement pour l'itinéraire de
   *   `liveConfig`. Les waypoints (Arsine 42, Vallouise 84, Valgaudémar 130,6)
   *   ne décrivent QUE cette aventure : les appliquer à un GPX importé
   *   découperait une sortie de 60 km à des kilomètres qui n'ont aucun sens.
   */
  const appliquerTrace = useCallback((t, deLAventure = false) => {
    if (!t) {
      setEtat({ occupe: false, message: "Fichier illisible — attendu un .gpx ou un .track.json." });
      return;
    }
    setTrace(t);
    // Une sortie DÉJÀ FAITE est d'un seul tenant par défaut : elle se raconte,
    // elle ne se planifie plus. Un itinéraire prévu, lui, se découpe.
    const auto = deLAventure ? coupuresDepuisWaypoints(liveConfig.aventure.waypoints, t.totalKm) : [];
    setCoupures(auto.length ? auto : t.vecue ? [] : coupuresRegulieres(t.totalKm, 2));
    setBilan(Boolean(t.vecue));
    setCartes([carteNeuve("carte", t, [])]);
    setActive(0);
    setEtat({ occupe: false, message: "" });
  }, []);

  const chargerFichierTrace = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setEtat({ occupe: true, message: "Lecture de la trace…" });
      try {
        const texte = await file.text();
        const t = file.name.endsWith(".json")
          ? traceDepuisTrackJson(JSON.parse(texte))
          : traceDepuisGpx(texte);
        appliquerTrace(t);
      } catch {
        setEtat({ occupe: false, message: "Fichier illisible — attendu un .gpx ou un .track.json." });
      }
    },
    [appliquerTrace],
  );

  const chargerAventure = useCallback(async () => {
    setEtat({ occupe: true, message: "Chargement de l'itinéraire…" });
    try {
      const res = await fetch(liveConfig.aventure.trace);
      appliquerTrace(traceDepuisTrackJson(await res.json()), true);
    } catch {
      setEtat({ occupe: false, message: "Itinéraire de l'aventure introuvable." });
    }
  }, [appliquerTrace]);

  /* ------------------------------------------------------------------- édition */

  const majCarte = useCallback(
    (patch) => setCartes((cs) => cs.map((c, i) => (i === active ? { ...c, ...patch } : c))),
    [active],
  );

  const majEtiquette = useCallback(
    (i, patch) =>
      setCartes((cs) =>
        cs.map((c, k) => {
          if (k !== active) return c;
          const etiquettes = [...(c.etiquettes ?? [])];
          etiquettes[i] = { ...(etiquettes[i] ?? {}), ...patch };
          return { ...c, etiquettes };
        }),
      ),
    [active],
  );

  // La nouvelle carte devient l'active : on vient de la créer, c'est elle qu'on
  // veut voir. Son index est la longueur ACTUELLE de la liste.
  const majFiche = useCallback(
    (i, patch) =>
      setCartes((cs) =>
        cs.map((c, k) => {
          if (k !== active) return c;
          const fiche = [...(c.fiche ?? [])];
          fiche[i] = { ...(fiche[i] ?? {}), ...patch };
          return { ...c, fiche };
        }),
      ),
    [active],
  );

  const ajouterCarte = useCallback(
    (gabarit) => {
      setCartes((cs) => [...cs, carteNeuve(gabarit, trace, segments)]);
      setActive(cartes.length);
    },
    [trace, segments, cartes.length],
  );

  const supprimerCarte = useCallback((i) => {
    setCartes((cs) => cs.filter((_, k) => k !== i));
    setActive((a) => Math.max(0, a >= i ? a - 1 : a));
  }, []);

  const deplacerCarte = useCallback((i, delta) => {
    let bouge = false;
    setCartes((cs) => {
      const j = i + delta;
      if (j < 0 || j >= cs.length) return cs;
      bouge = true;
      const out = [...cs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
    // L'active SUIT la carte, dans les deux sens de l'échange : sans le second
    // cas, déplacer une carte par-dessus l'active faisait sauter l'aperçu.
    if (bouge) setActive((a) => (a === i ? i + delta : a === i + delta ? i : a));
  }, []);

  const chargerPhoto = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setEtat({ occupe: true, message: "Lecture de la photo…" });
      try {
        const bitmap = await chargerImage(file);
        majCarte({ image: bitmap, nomImage: file.name });
        setEtat({ occupe: false, message: "" });
      } catch (err) {
        setEtat({
          occupe: false,
          message: err?.message?.startsWith("Ce HEIC")
            ? err.message
            : "Photo illisible — essaie un JPEG, un PNG ou un HEIC.",
        });
      }
    },
    [majCarte],
  );

  /* -------------------------------------------------------------------- rendu */

  const options = useMemo(
    () => ({
      format: formatCle,
      theme: themeCle,
      trace,
      segments,
      police: policeUbuntu(),
      logo: marque,
      fond,
      total: cartes.length,
    }),
    [formatCle, themeCle, trace, segments, marque, fond, cartes.length],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !carte) return;
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    boitesRef.current =
      dessinerCartePartage(ctx, { ...options, carte: { ...carte, bilan }, index: active }) ?? [];
  }, [carte, options, format, policePrete, active, bilan]);

  /* ------------------------------------------- glisser-déposer des étiquettes */

  const pointCanvas = useCallback((e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * canvas.width,
      ((e.clientY - r.top) / r.height) * canvas.height,
    ];
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      if (carte?.gabarit !== "carte") return;
      const [x, y] = pointCanvas(e);
      // Du dernier au premier : c'est l'étiquette DESSUS qu'on attrape quand
      // deux se recouvrent, celle qu'on voit.
      const boites = boitesRef.current;
      for (let i = boites.length - 1; i >= 0; i -= 1) {
        const b = boites[i];
        if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
          const etq = carte.etiquettes?.[b.index] ?? {};
          glisseRef.current = {
            index: b.index,
            x0: x,
            y0: y,
            dx0: etq.dx ?? 0,
            dy0: etq.dy ?? 0,
          };
          e.currentTarget.setPointerCapture?.(e.pointerId);
          return;
        }
      }
    },
    [carte, pointCanvas],
  );

  const onPointerMove = useCallback(
    (e) => {
      const g = glisseRef.current;
      if (!g) return;
      const [x, y] = pointCanvas(e);
      majEtiquette(g.index, { dx: g.dx0 + (x - g.x0), dy: g.dy0 + (y - g.y0) });
    },
    [pointCanvas, majEtiquette],
  );

  const onPointerUp = useCallback(() => {
    glisseRef.current = null;
  }, []);

  /* ------------------------------------------------------------------- export */

  const exporter = useCallback(
    async (indices) => {
      setEtat({ occupe: true, message: "Fabrication des images…" });
      const hors = document.createElement("canvas");
      hors.width = format.width;
      hors.height = format.height;
      const ctx = hors.getContext("2d");
      const horodatage = Date.now();

      for (const i of indices) {
        // `index` reste celui de la carte DANS LE CARROUSEL : la pagination du
        // pied doit dire « 03 / 10 » même si on n'exporte que cette carte-là.
        dessinerCartePartage(ctx, { ...options, carte: { ...cartes[i], bilan }, index: i });
        const blob = await new Promise((r) => hors.toBlob(r, "image/jpeg", 0.92));
        if (blob) {
          const numero = String(indices.indexOf(i) + 1).padStart(2, "0");
          telecharger(blob, `carrousel-${horodatage}-${numero}.jpg`);
          await new Promise((r) => setTimeout(r, 260)); // Safari perd les téléchargements en rafale
        }
      }
      setEtat({ occupe: false, message: "" });
    },
    [cartes, options, format, bilan],
  );

  /* --------------------------------------------------------------------- vues */

  const nbJours = segments.length;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      {/* ---------------------------------------------------------- aperçu */}
      <div className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-4">
        <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-2xl bg-brand-text/10 shadow-card">
          {carte ? (
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="block h-auto w-full touch-none"
              style={{ aspectRatio: `${format.width} / ${format.height}` }}
            />
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center px-6 text-center font-heading text-[14px] text-brand-text/50">
              Charge une trace pour commencer.
            </div>
          )}
        </div>

        {carte?.gabarit === "carte" && nbJours > 0 && (
          <p className="mx-auto mt-3 max-w-[380px] text-center font-heading text-[13px] text-brand-text/55">
            Attrape une étiquette pour la déplacer.
          </p>
        )}

        {/* ------------------------------------------------ bande des cartes */}
        {cartes.length > 0 && (
          <div className="mx-auto mt-5 flex max-w-[380px] flex-wrap items-center gap-2">
            {cartes.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-heading text-[13px] transition-colors ${
                  i === active
                    ? "border-brand-primary-dark bg-brand-primary/25 text-brand-text"
                    : "border-brand-field bg-brand-paper text-brand-text/65 hover:border-brand-primary/60"
                }`}
              >
                <span className="tabular-nums">{i + 1}</span>
                <span className="opacity-70">{GABARITS.find((g) => g.cle === c.gabarit)?.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- réglages */}
      <div className="order-1 flex flex-col gap-5 lg:order-none lg:col-start-2 lg:row-start-1">
        {/* La trace */}
        <section className="rounded-2xl border border-brand-field bg-brand-paper/60 p-4">
          <h2 className="mb-3 font-heading text-[15px] font-medium text-brand-text">La trace</h2>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={chargerAventure} className={BOUTON_SECOND}>
              <MapIcon size={16} aria-hidden />
              {liveConfig.aventure.nom}
            </button>
            <label className={`${BOUTON_SECOND} cursor-pointer`}>
              <Route size={16} aria-hidden />
              Un .gpx ou un .track.json
              <input
                type="file"
                accept=".gpx,.json,application/gpx+xml,application/json"
                onChange={chargerFichierTrace}
                className="sr-only"
              />
            </label>
          </div>
          {trace && (
            <>
              <p className="mt-3 font-heading text-[13px] text-brand-text/60">
                {trace.totalKm.toFixed(1).replace(".", ",")} km · {trace.dPlusM} m D+
                {trace.coords.length === 0 && " · sans coordonnées (gabarit Carte indisponible)"}
              </p>

              {/* AVANT ou APRÈS : le réglage qui change les MOTS de tout le
                  carrousel — « km à parcourir » ou « km parcourus », profil
                  vide ou rempli, durée affichée ou non. */}
              <p className={`${LEGENDE} mt-4`}>Ce carrousel raconte</p>
              <div className="flex gap-2">
                {[
                  { v: false, l: "Avant le départ" },
                  { v: true, l: "Après l'aventure" },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    onClick={() => setBilan(o.v)}
                    className={`flex-1 rounded-full border px-3 py-2 font-heading text-[13px] transition-colors ${
                      bilan === o.v
                        ? "border-brand-primary-dark bg-brand-primary/25 text-brand-text"
                        : "border-brand-field bg-brand-paper text-brand-text/65 hover:border-brand-primary/60"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              {trace.vecue && (
                <p className="mt-2 font-heading text-[12px] text-brand-text/45">
                  Trace horodatée ({dureeCourte(trace.dureeSecondes)}) — l&rsquo;atelier a supposé
                  « après ».
                </p>
              )}
            </>
          )}
          {etat.message && (
            <p className="mt-3 font-heading text-[13px] text-brand-primary-dark">{etat.message}</p>
          )}
        </section>

        {/* Le découpage en journées */}
        {trace && (
          <section className="rounded-2xl border border-brand-field bg-brand-paper/60 p-4">
            <h2 className="mb-3 font-heading text-[15px] font-medium text-brand-text">
              Les journées
            </h2>
            <label className={LEGENDE} htmlFor="nb-jours">
              Nombre de journées
            </label>
            <div className="mb-3 flex items-center gap-2">
              <input
                id="nb-jours"
                type="number"
                min={1}
                max={12}
                value={nbJours}
                onChange={(e) => setCoupures(coupuresRegulieres(trace.totalKm, Number(e.target.value)))}
                className={`${CHAMP} w-24`}
              />
              <button
                type="button"
                className={BOUTON_SECOND}
                onClick={() =>
                  setCoupures(coupuresDepuisWaypoints(liveConfig.aventure.waypoints, trace.totalKm))
                }
              >
                Depuis les bivouacs
              </button>
            </div>

            <p className="mb-2 font-heading text-[13px] text-brand-text/55">
              Fin de chaque journée, en kilomètres :
            </p>
            <div className="flex flex-col gap-2">
              {coupures.map((km, i) => (
                <div key={`coupure-${i}`} className="flex items-center gap-2">
                  <span className="w-10 font-heading text-[13px] text-brand-text/55">
                    J{i + 1} →
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={Number(km.toFixed(1))}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCoupures((cs) => cs.map((c, k) => (k === i ? v : c)).sort((a, b) => a - b));
                    }}
                    className={`${CHAMP} w-28`}
                  />
                  <span className="font-heading text-[13px] text-brand-text/45">km</span>
                  <button
                    type="button"
                    onClick={() => setCoupures((cs) => cs.filter((_, k) => k !== i))}
                    className="ml-auto rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark"
                    aria-label={`Supprimer la coupure J${i + 1}`}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={BOUTON_SECOND}
                onClick={() =>
                  setCoupures((cs) =>
                    [...cs, Math.min(trace.totalKm - 1, (cs[cs.length - 1] ?? 0) + trace.totalKm / 4)].sort(
                      (a, b) => a - b,
                    ),
                  )
                }
              >
                <Plus size={15} aria-hidden />
                Une journée de plus
              </button>
            </div>
          </section>
        )}

        {/* La carte affichée */}
        {carte && (
          <section className="rounded-2xl border border-brand-field bg-brand-paper/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-[15px] font-medium text-brand-text">
                Carte {active + 1}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => deplacerCarte(active, -1)}
                  disabled={active === 0}
                  className="rounded-full px-2 py-1 font-heading text-[13px] text-brand-text/50 hover:bg-brand-primary/15 disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => deplacerCarte(active, 1)}
                  disabled={active === cartes.length - 1}
                  className="rounded-full px-2 py-1 font-heading text-[13px] text-brand-text/50 hover:bg-brand-primary/15 disabled:opacity-30"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => supprimerCarte(active)}
                  disabled={cartes.length <= 1}
                  className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark disabled:opacity-30"
                  aria-label="Supprimer cette carte"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </div>

            <label className={LEGENDE} htmlFor="gabarit">
              Gabarit
            </label>
            <select
              id="gabarit"
              value={carte.gabarit}
              onChange={(e) => majCarte({ gabarit: e.target.value })}
              className={`${CHAMP} mb-3`}
            >
              {GABARITS.map((g) => (
                <option key={g.cle} value={g.cle}>
                  {g.label} — {g.aide}
                </option>
              ))}
            </select>

            <label className={LEGENDE} htmlFor="entete">
              En-tête <span className="font-normal opacity-60">— à droite de la marque</span>
            </label>
            <input
              id="entete"
              type="text"
              value={carte.entete}
              placeholder="bande photo — détail / matériel"
              onChange={(e) => majCarte({ entete: e.target.value })}
              className={CHAMP}
            />
            <label className="mb-3 mt-1 flex items-center gap-2 font-heading text-[13px] text-brand-text/70">
              <input
                type="checkbox"
                checked={Boolean(carte.enteteAccent)}
                onChange={(e) => majCarte({ enteteAccent: e.target.checked })}
              />
              en ambre
            </label>

            <label className={LEGENDE} htmlFor="surtitre">
              Surtitre <span className="font-normal opacity-60">— après le filet ambre</span>
            </label>
            <input
              id="surtitre"
              type="text"
              value={carte.surtitre}
              placeholder="pourquoi ce tour"
              onChange={(e) => majCarte({ surtitre: e.target.value })}
              className={`${CHAMP} mb-3`}
            />

            <label className={LEGENDE} htmlFor="titre">
              Titre
            </label>
            <input
              id="titre"
              type="text"
              value={carte.titre}
              onChange={(e) => majCarte({ titre: e.target.value })}
              className={`${CHAMP} mb-3`}
            />

            <label className={LEGENDE} htmlFor="texte">
              Texte <span className="font-normal opacity-60">— une ligne vide sépare deux paragraphes</span>
            </label>
            <textarea
              id="texte"
              rows={4}
              value={carte.texte}
              onChange={(e) => majCarte({ texte: e.target.value })}
              className={`${CHAMP} mb-3 resize-y`}
            />

            {carte.gabarit === "carte" && (
              <>
                <label className="mb-2 flex items-center gap-2 font-heading text-[14px] text-brand-text/75">
                  <input
                    type="checkbox"
                    checked={carte.afficherFond !== false}
                    onChange={(e) => majCarte({ afficherFond: e.target.checked })}
                  />
                  Fond de carte topo
                  {!fond && trace?.coords?.length > 0 && (
                    <span className="text-brand-text/45">(indisponible hors ligne)</span>
                  )}
                </label>
                <label className="mb-2 flex items-center gap-2 font-heading text-[14px] text-brand-text/75">
                  <input
                    type="checkbox"
                    checked={carte.afficherProfil !== false}
                    onChange={(e) => majCarte({ afficherProfil: e.target.checked })}
                  />
                  Profil altimétrique
                </label>
                <label className="mb-3 flex items-center gap-2 pl-6 font-heading text-[13px] text-brand-text/70">
                  <input
                    type="checkbox"
                    checked={carte.afficherAltitudes !== false}
                    disabled={carte.afficherProfil === false}
                    onChange={(e) => majCarte({ afficherAltitudes: e.target.checked })}
                  />
                  altitudes min / max
                </label>

                <p className={LEGENDE}>Étiquettes</p>
                <div className="flex flex-col gap-2">
                  {segments.map((seg, i) => {
                    const etq = carte.etiquettes?.[i] ?? {};
                    return (
                      <div key={`etq-${seg.kmDebut}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={etq.texte ?? etiquetteParDefaut(i)}
                          onChange={(e) => majEtiquette(i, { texte: e.target.value })}
                          className={`${CHAMP} flex-1`}
                          aria-label={`Étiquette de la journée ${i + 1}`}
                        />
                        <input
                          type="color"
                          value={etq.couleur ?? PALETTE_JOURS[i % PALETTE_JOURS.length]}
                          onChange={(e) => majEtiquette(i, { couleur: e.target.value })}
                          className="h-9 w-9 cursor-pointer rounded-lg border border-brand-field bg-transparent"
                          aria-label={`Couleur de la journée ${i + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => majEtiquette(i, { dx: 0, dy: 0 })}
                          className="rounded-full px-2 py-1 font-heading text-[12px] text-brand-text/45 hover:bg-brand-primary/15"
                          title="Replacer l'étiquette"
                        >
                          ⤺
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 font-heading text-[12px] text-brand-text/45">
                  {segments
                    .map((s, i) => `J${i + 1} ${s.distanceKm.toFixed(1)} km / ${s.dPlusM} m D+`)
                    .join("  ·  ")}
                </p>
              </>
            )}

            {(carte.gabarit === "photo" || carte.gabarit === "bandeau") && (
              <>
                <label className={`${BOUTON_SECOND} mb-3 cursor-pointer`}>
                  <ImageUp size={16} aria-hidden />
                  {carte.nomImage || "Choisir une photo"}
                  <input type="file" accept="image/*,.heic" onChange={chargerPhoto} className="sr-only" />
                </label>
                <label className={LEGENDE} htmlFor="ancrage">
                  Cadrage
                </label>
                <input
                  id="ancrage"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={carte.ancrage}
                  onChange={(e) => majCarte({ ancrage: Number(e.target.value) })}
                  className="mb-3 w-full accent-brand-primary-dark"
                />

                {carte.gabarit === "bandeau" && (
                  <>
                    <label className={LEGENDE} htmlFor="bandeau-part">
                      Hauteur du bandeau — {Math.round(carte.bandeauPart * 100)} %
                    </label>
                    <input
                      id="bandeau-part"
                      type="range"
                      min={0.2}
                      max={0.7}
                      step={0.01}
                      value={carte.bandeauPart}
                      onChange={(e) => majCarte({ bandeauPart: Number(e.target.value) })}
                      className="mb-3 w-full accent-brand-primary-dark"
                    />
                  </>
                )}

                {/* Les deux dégradés se règlent séparément : une photo au ciel
                    déjà sombre n'a pas besoin d'être assombrie en haut. */}
                <p className={LEGENDE}>Dégradés</p>
                <div className="mb-1 flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 font-heading text-[14px] text-brand-text/75">
                    <input
                      type="checkbox"
                      checked={carte.degradeHaut !== false}
                      onChange={(e) => majCarte({ degradeHaut: e.target.checked })}
                    />
                    en-tête
                  </label>
                  <label className="flex items-center gap-2 font-heading text-[14px] text-brand-text/75">
                    <input
                      type="checkbox"
                      checked={carte.degradeBas !== false}
                      onChange={(e) => majCarte({ degradeBas: e.target.checked })}
                    />
                    {carte.gabarit === "bandeau" ? "bas du bandeau" : "pied de page"}
                  </label>
                </div>
                <div className="mb-3" />
              </>
            )}

            {carte.gabarit === "fiche" && (
              <>
                <p className={LEGENDE}>Lignes</p>
                <div className="mb-2 flex flex-col gap-2">
                  {(carte.fiche ?? []).map((l, i) => (
                    <div key={`fiche-${i}`} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={l.label}
                        placeholder="libellé"
                        onChange={(e) => majFiche(i, { label: e.target.value })}
                        className={`${CHAMP} flex-1`}
                        aria-label={`Libellé de la ligne ${i + 1}`}
                      />
                      <input
                        type="text"
                        value={l.valeur}
                        placeholder="valeur"
                        onChange={(e) => majFiche(i, { valeur: e.target.value })}
                        className={`${CHAMP} flex-1`}
                        aria-label={`Valeur de la ligne ${i + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => majFiche(i, { accent: !l.accent })}
                        className={`rounded-lg border px-2 py-1.5 font-heading text-[13px] ${
                          l.accent
                            ? "border-brand-accent-dark bg-brand-accent/25 text-brand-accent-ink"
                            : "border-brand-field text-brand-text/40"
                        }`}
                        title="Mettre la valeur en ambre"
                        aria-label={`Valeur en ambre, ligne ${i + 1}`}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => majCarte({ fiche: carte.fiche.filter((_, k) => k !== i) })}
                        className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark"
                        aria-label={`Supprimer la ligne ${i + 1}`}
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${BOUTON_SECOND} mb-3`}
                  onClick={() =>
                    majCarte({ fiche: [...(carte.fiche ?? []), { label: "", valeur: "", accent: false }] })
                  }
                >
                  <Plus size={15} aria-hidden />
                  Une ligne de plus
                </button>
              </>
            )}

            {carte.gabarit === "chiffres" && (
              <>
                <label className={LEGENDE} htmlFor="chiffres-jour">
                  Chiffres de
                </label>
                <select
                  id="chiffres-jour"
                  value={carte.segment ?? ""}
                  onChange={(e) =>
                    majCarte({ segment: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className={`${CHAMP} mb-3`}
                >
                  <option value="">Tout l&rsquo;itinéraire</option>
                  {segments.map((s, i) => (
                    <option key={`chiffres-${s.kmDebut}`} value={i}>
                      Journée {i + 1}
                    </option>
                  ))}
                </select>
              </>
            )}

            <p className={LEGENDE}>Pied de page</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={carte.piedCentre}
                placeholder="au milieu"
                onChange={(e) => majCarte({ piedCentre: e.target.value })}
                className={CHAMP}
                aria-label="Pied de page, au milieu"
              />
              <input
                type="text"
                value={carte.piedDroite}
                placeholder="à droite (défaut : glisse →)"
                onChange={(e) => majCarte({ piedDroite: e.target.value })}
                className={CHAMP}
                aria-label="Pied de page, à droite"
              />
            </div>
          </section>
        )}

        {/* Ajouter / format / export */}
        {trace && (
          <section className="rounded-2xl border border-brand-field bg-brand-paper/60 p-4">
            <p className={LEGENDE}>Ajouter une carte</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {GABARITS.map((g) => (
                <button
                  key={g.cle}
                  type="button"
                  onClick={() => ajouterCarte(g.cle)}
                  className={BOUTON_SECOND}
                >
                  <Plus size={15} aria-hidden />
                  {g.label}
                </button>
              ))}
            </div>

            <label className={LEGENDE} htmlFor="format">
              Format
            </label>
            <select
              id="format"
              value={formatCle}
              onChange={(e) => setFormatCle(e.target.value)}
              className={`${CHAMP} mb-3`}
            >
              {Object.values(FORMATS).map((f) => (
                <option key={f.cle} value={f.cle}>
                  {f.label}
                </option>
              ))}
            </select>

            <p className={LEGENDE}>Thème</p>
            <div className="mb-4 flex gap-2">
              {Object.values(THEMES).map((t) => (
                <button
                  key={t.cle}
                  type="button"
                  onClick={() => setThemeCle(t.cle)}
                  className={`flex-1 rounded-full border px-3 py-2 font-heading text-[14px] transition-colors ${
                    themeCle === t.cle
                      ? "border-brand-primary-dark bg-brand-primary/25 text-brand-text"
                      : "border-brand-field bg-brand-paper text-brand-text/65 hover:border-brand-primary/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={BOUTON_PRINCIPAL}
                disabled={etat.occupe || cartes.length === 0}
                onClick={() => exporter(cartes.map((_, i) => i))}
              >
                {etat.occupe ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Download size={16} aria-hidden />
                )}
                Tout exporter ({cartes.length})
              </button>
              <button
                type="button"
                className={BOUTON_SECOND}
                disabled={etat.occupe || !carte}
                onClick={() => exporter([active])}
              >
                <Download size={15} aria-hidden />
                Cette carte seulement
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
