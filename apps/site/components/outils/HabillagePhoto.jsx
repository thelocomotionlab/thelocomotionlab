// components/outils/HabillagePhoto.jsx
//
// L'atelier d'habillage : une photo + un GPX → une image prête à publier.
//
// TOUT SE PASSE DANS LE TÉLÉPHONE. Ni photo ni trace ne quittent l'appareil :
// pas de serveur, donc rien à stocker, rien à purger. C'est aussi ce qui permet
// de traiter un GPX de 6 Mo sans se demander qui paie la bande passante.
//
// HORS LIGNE : oui, mais seulement servi depuis /studio, qui installe le service
// worker (public/sw.js). Un manifeste seul ne met rien en cache.
//
// MÊME POSTE DE TRAVAIL QUE LE CARROUSEL — barre en haut, rail à gauche,
// panneau, image au centre. Ce n'est pas de la cosmétique : les deux ateliers
// s'utilisent dans la même demi-heure, et deux ergonomies différentes pour deux
// canvas identiques obligeaient à réapprendre à chaque bascule.
//
// DEUX HABILLAGES, DEUX FORMATS (cf. lib/habillage.js). « Silhouette » pose le
// relief en bandeau ; « Chiffres » met la distance en très grand, à la manière
// d'un écran de montre — mais à la charte du labo, et avec le D+ à côté de la
// distance, que les montres relèguent toujours au second écran.
//
// Les chiffres sont MODIFIABLES. Une montre n'affiche pas ce que son propre
// fichier contient : sur la Croix de Belledonne, le GPX Coros donne 22,86 km de
// tracé et annonce 24,26 km, et son D+ à l'écran dépasse de ~12 % ce que ses
// altitudes exportées permettent de recalculer. Publier un chiffre qui
// contredit sa montre serait pénible ; on part donc du fichier, et on laisse le
// dernier mot à l'auteur.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Hash, ImageUp, Route, Share2 } from "lucide-react";

import { statsDeGpx } from "@/lib/gpxStats";
import { chargerImage } from "@/lib/imageFile";
import {
  COULEURS,
  FORMATS_HABILLAGE,
  STYLES_HABILLAGE,
  dessinerHabillage,
  formatEntier,
  formatHabillage,
} from "@/lib/habillage";
import { CLES_ICONES } from "@/lib/carrouselIcones";
import { chargerMarqueTeintee } from "@/lib/marque";
import {
  AIDE,
  BOUTON_PRINCIPAL,
  BOUTON_SECOND,
  CHAMP,
  Curseur,
  Groupe,
  ICONES_PAR_CLE,
  LEGENDE,
  Puce,
  Zoom,
} from "@/components/outils/champsAtelier";

const ONGLETS = [
  { cle: "photo", label: "Photo", Icone: ImageUp },
  { cle: "trace", label: "Trace", Icone: Route },
  { cle: "chiffres", label: "Chiffres", Icone: Hash },
];

/**
 * Famille de police à donner au canvas.
 *
 * On lit la `font-family` RÉSOLUE du body, pas la variable `--next-font-ubuntu`
 * : next/font pose cette variable sur `<body>` (app/layout.js), et l'interroger
 * sur `documentElement` renvoyait une chaîne vide — le canvas dessinait alors
 * en police système sans que rien ne le signale.
 */
function policeUbuntu() {
  if (typeof document === "undefined") return "sans-serif";
  const famille = getComputedStyle(document.body).fontFamily;
  return famille && famille !== "" ? famille : "sans-serif";
}

/** « 21:15:08 » — le chrono tel qu'une montre l'affiche, pas tel qu'on le dit. */
function formatChrono(secondes) {
  if (!(secondes > 0)) return "";
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = Math.round(secondes % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** « 10'31"/km ». L'allure d'un ultra se lit à la seconde près, pas au dixième. */
function formatAllure(secondes, km) {
  if (!(secondes > 0) || !(km > 0)) return "";
  const parKm = secondes / km;
  const m = Math.floor(parKm / 60);
  const s = Math.round(parKm % 60);
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

/** « 27 juin 2025, 23:05 » — l'en-tête d'un écran de montre. */
function formatDate(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const jour = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
  // Les espaces fines insécables d'Intl sortiraient en carré : la fonte du site
  // est un sous-ensemble latin (cf. lib/habillage.js).
  return `${jour}, ${heure}`.replace(/[   ]/g, " ");
}

/** Les trois mesures de l'habillage « Chiffres », vides. */
function mesuresVides() {
  return [
    { icone: "chrono", texte: "" },
    { icone: "sommet", texte: "" },
    { icone: "sandales", texte: "" },
  ];
}

/** Le sélecteur d'icône d'une mesure — la même liste que les planches. */
function ChoixIcone({ valeur, onChange, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-field bg-brand-paper text-brand-accent-ink">
        <Puce cle={valeur} Icone={ICONES_PAR_CLE[valeur]} />
      </span>
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className={`${CHAMP} w-auto py-1.5 text-[13px]`}
        aria-label={label}
      >
        {CLES_ICONES.map((cle) => (
          <option key={cle} value={cle}>
            {cle}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function HabillagePhoto() {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [nomPhoto, setNomPhoto] = useState("");
  const [trace, setTrace] = useState(null);
  const [ancrage, setAncrage] = useState(0.5);
  const [formatCle, setFormatCle] = useState("story");
  const [style, setStyle] = useState("silhouette");
  const [onglet, setOnglet] = useState("photo");
  /** `null` = ajusté à la fenêtre ; un nombre = le facteur sur la largeur du
   *  format (100 % = un pixel d'export pour un pixel d'écran). */
  const [zoom, setZoom] = useState(null);
  const [champs, setChamps] = useState({
    distanceKm: "",
    dPlusM: "",
    dMinusM: "",
    entete: "",
    activite: "sentier",
    mesures: mesuresVides(),
  });
  const [etat, setEtat] = useState({ occupe: false, message: "" });
  const [policePrete, setPolicePrete] = useState(false);
  const [marque, setMarque] = useState(null);

  const format = formatHabillage(formatCle);

  // Le canvas dessine avec la vraie fonte du site : sans cette attente, le
  // premier rendu part en police système et le texte saute ensuite.
  useEffect(() => {
    let vivant = true;
    const famille = policeUbuntu();
    Promise.all([
      document.fonts.load(`700 118px ${famille}`),
      document.fonts.load(`500 44px ${famille}`),
      document.fonts.load(`500 21px ${famille}`),
    ])
      .catch(() => {})
      .then(() => vivant && setPolicePrete(true));
    return () => {
      vivant = false;
    };
  }, []);

  // La marque, teintée une fois pour toutes. Si elle ne charge pas, l'habillage
  // se contente du nom : le tampon du labo ne doit jamais empêcher d'exporter
  // sa photo.
  useEffect(() => {
    let vivant = true;
    chargerMarqueTeintee(COULEURS.creme)
      .then((c) => vivant && setMarque(c))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  const chargerPhoto = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEtat({ occupe: true, message: "Lecture de la photo…" });
    try {
      // HEIC compris : décodage natif d'abord, décodeur de secours chargé à la
      // demande seulement s'il le faut (cf. lib/imageFile.js).
      const bitmap = await chargerImage(file);
      setImage(bitmap);
      setNomPhoto(file.name);
      setEtat({ occupe: false, message: "" });
    } catch (err) {
      setEtat({
        occupe: false,
        message: err?.message?.startsWith("Ce HEIC")
          ? err.message
          : "Photo illisible — essaie un JPEG, un PNG ou un HEIC.",
      });
    }
  }, []);

  const chargerTrace = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEtat({ occupe: true, message: "Lecture de la trace…" });
    try {
      const stats = statsDeGpx(await file.text());
      if (!stats) {
        setEtat({ occupe: false, message: "Ce fichier ne contient pas de trace exploitable." });
        return;
      }
      setTrace(stats);
      // Tout ce que le fichier sait déjà de lui-même est pré-rempli — y compris
      // le chrono et l'allure, qu'on retaperait sinon à la main en les lisant
      // sur la montre.
      setChamps((c) => ({
        ...c,
        distanceKm: stats.distanceKm.toFixed(1).replace(".", ","),
        dPlusM: String(stats.dPlusM),
        dMinusM: String(stats.dMinusM),
        entete: formatDate(stats.debutMs),
        mesures: [
          { icone: "chrono", texte: formatChrono(stats.dureeSecondes) },
          { icone: "sommet", texte: stats.dMinusM > 0 ? `${formatEntier(stats.dMinusM)} m D−` : "" },
          { icone: "sandales", texte: formatAllure(stats.dureeSecondes, stats.distanceKm) },
        ],
      }));
      setEtat({ occupe: false, message: "" });
    } catch {
      setEtat({ occupe: false, message: "Fichier illisible — attendu : un .gpx." });
    }
  }, []);

  const majMesure = useCallback(
    (i, patch) =>
      setChamps((c) => {
        const mesures = c.mesures.map((m, k) => (k === i ? { ...m, ...patch } : m));
        return { ...c, mesures };
      }),
    [],
  );

  const valeurs = useMemo(
    () => ({
      distanceKm: Number.parseFloat(String(champs.distanceKm).replace(",", ".")),
      dPlusM: Number.parseFloat(champs.dPlusM),
      dMinusM: Number.parseFloat(champs.dMinusM),
    }),
    [champs],
  );

  // Redessin à chaque changement — le canvas est la seule source de vérité de
  // ce qui sera exporté (l'aperçu EST l'image finale, mise à l'échelle en CSS).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    dessinerHabillage(ctx, {
      format,
      style,
      image,
      profil: trace?.profil ?? [],
      distanceKm: valeurs.distanceKm,
      dPlusM: valeurs.dPlusM,
      dMinusM: valeurs.dMinusM,
      entete: champs.entete,
      activite: champs.activite,
      mesures: champs.mesures,
      ancrage,
      police: policeUbuntu(),
      logo: marque,
    });
  }, [image, trace, valeurs, champs, ancrage, policePrete, marque, format, style]);

  const fichierFinal = useCallback(
    () =>
      new Promise((resolve) => {
        canvasRef.current?.toBlob(
          (blob) =>
            resolve(
              blob ? new File([blob], `locomotion-${Date.now()}.jpg`, { type: "image/jpeg" }) : null,
            ),
          "image/jpeg",
          0.92,
        );
      }),
    [],
  );

  const partager = useCallback(async () => {
    const file = await fichierFinal();
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        // Partage annulé : on ne force pas le téléchargement derrière.
        return;
      }
    }
    telecharger(file);
  }, [fichierFinal]);

  const enregistrer = useCallback(async () => {
    const file = await fichierFinal();
    if (file) telecharger(file);
  }, [fichierFinal]);

  /** Le zoom EFFECTIF de l'aperçu, mesuré sur le canvas. */
  const zoomAffiche = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas?.clientWidth ? canvas.clientWidth / format.width : null;
  }, [format.width]);

  /** Ctrl/⌘ + molette : le geste de zoom de tous les éditeurs. */
  const molette = useCallback(
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const actuel = zoom ?? zoomAffiche() ?? 0.4;
      const suivant = Math.min(3, Math.max(0.1, actuel * (e.deltaY > 0 ? 0.9 : 1.1)));
      setZoom(Math.round(suivant * 100) / 100);
    },
    [zoom, zoomAffiche],
  );

  const pret = Boolean(image && trace);

  return (
    <div
      className={
        // Enfant direct de la coque du studio (display:contents) : il prend
        // toute la hauteur qui reste sous la barre. Sur un téléphone, la page
        // défile et c'est l'aperçu qui se colle.
        "flex flex-col bg-brand-paper/35 lg:min-h-0 lg:flex-1 lg:overflow-hidden"
      }
    >
      {/* ---------------------------------------------------------- barre haute */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-brand-field/70 bg-brand-paper/70 px-3 py-2">
        <select
          value={formatCle}
          onChange={(e) => setFormatCle(e.target.value)}
          className="rounded-lg border border-brand-field bg-brand-paper px-2 py-1.5 font-heading text-[13px] text-brand-text focus:border-brand-primary-dark focus:outline-none"
          aria-label="Format"
        >
          {Object.values(FORMATS_HABILLAGE).map((f) => (
            <option key={f.cle} value={f.cle}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="flex rounded-full border border-brand-field bg-brand-paper p-0.5">
          {STYLES_HABILLAGE.map((st) => (
            <button
              key={st.cle}
              type="button"
              onClick={() => setStyle(st.cle)}
              aria-pressed={style === st.cle}
              title={st.aide}
              className={`rounded-full px-3 py-1 font-heading text-[13px] transition-colors motion-reduce:transition-none ${
                style === st.cle
                  ? "bg-brand-deep text-brand-bg"
                  : "text-brand-text/60 hover:text-brand-text"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={enregistrer}
            disabled={!pret || etat.occupe}
            className={BOUTON_SECOND}
          >
            <Download size={15} aria-hidden />
            <span className="hidden sm:inline">Enregistrer</span>
          </button>
          <button
            type="button"
            onClick={partager}
            disabled={!pret || etat.occupe}
            className={BOUTON_PRINCIPAL}
          >
            <Share2 size={16} aria-hidden />
            Partager
          </button>
        </div>
      </header>

      {etat.message && (
        <p
          className="shrink-0 border-b border-brand-field/60 bg-brand-primary/12 px-4 py-2 font-heading text-[13px] text-brand-primary-dark"
          role="status"
        >
          {etat.message}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* `contents` en petit écran : gardée, cette boîte n'envelopperait que
            l'image, et le collage n'aurait aucune course (cf. l'atelier
            carrousel, où le même piège s'est refermé trois fois). */}
        <section className="contents lg:order-2 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-col">
          <div className="order-1 sticky top-[var(--apercu-top,84px)] z-20 flex min-h-0 flex-col gap-2 bg-brand-bg/95 px-3 py-3 backdrop-blur lg:static lg:order-none lg:flex-1 lg:bg-transparent lg:backdrop-blur-none">
            <div
              onWheel={molette}
              className="flex min-h-0 flex-1 items-center justify-center overflow-auto lg:rounded-xl lg:bg-brand-text/5 lg:p-4"
            >
              <canvas
                ref={canvasRef}
                style={zoom == null ? undefined : { width: `${format.width * zoom}px` }}
                className={
                  zoom == null
                    ? "block h-auto max-h-[40vh] w-auto max-w-full rounded-xl bg-brand-text/10 shadow-card lg:max-h-full"
                    : "block h-auto max-w-none shrink-0 rounded-xl bg-brand-text/10 shadow-card"
                }
                aria-label="Aperçu de l'image habillée"
              />
            </div>
            <div className="flex shrink-0 items-center justify-center gap-2">
              <Zoom valeur={zoom} onChange={setZoom} mesurer={zoomAffiche} />
            </div>
            <p className={`${AIDE} shrink-0 text-center`}>
              Aperçu à l&rsquo;échelle exacte du fichier exporté ({format.width} × {format.height}).
              {formatCle === "story"
                ? " Tout est posé dans la bande qu’Instagram ne recouvre pas."
                : " Une publication n’est recouverte de rien : le cadre entier sert."}
            </p>
          </div>
        </section>

        <div className="order-2 flex min-h-0 shrink-0 flex-col lg:order-1 lg:w-[404px] lg:flex-row lg:border-r lg:border-brand-field/70">
          <nav
            aria-label="Réglages"
            className="flex shrink-0 gap-1 overflow-x-auto border-y border-brand-field/70 bg-brand-paper/60 px-2 py-1.5 lg:w-[80px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-y-0 lg:border-r lg:py-2"
          >
            {ONGLETS.map(({ cle, label, Icone }) => (
              <button
                key={cle}
                type="button"
                onClick={() => setOnglet(cle)}
                aria-current={onglet === cle ? "page" : undefined}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 font-heading text-[11px] transition-colors motion-reduce:transition-none lg:w-full ${
                  onglet === cle
                    ? "bg-brand-primary/25 text-brand-text"
                    : "text-brand-text/55 hover:bg-brand-primary/10 hover:text-brand-text"
                }`}
              >
                <Icone size={19} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto lg:w-[324px]">
            {onglet === "photo" && (
              <Groupe titre="La photo">
                <label className={`${BOUTON_SECOND} mb-3 w-full cursor-pointer`}>
                  <ImageUp size={16} aria-hidden />
                  <span className="truncate">{image ? "Changer la photo" : "Choisir une photo"}</span>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    onChange={chargerPhoto}
                    className="sr-only"
                  />
                </label>
                {nomPhoto && <p className={`${AIDE} mb-3 truncate`}>{nomPhoto}</p>}
                <Curseur
                  id="ancrage"
                  label="Cadrage"
                  valeur={ancrage}
                  defaut={0.5}
                  min={0}
                  max={1}
                  pas={0.01}
                  format={(v) => `${Math.round(v * 100)} %`}
                  onChange={(v) => setAncrage(v ?? 0.5)}
                />
              </Groupe>
            )}

            {onglet === "trace" && (
              <Groupe
                titre="La trace"
                aide="Le fichier de la montre. C'est lui qui donne le relief, la distance, le chrono et l'allure."
              >
                <label className={`${BOUTON_SECOND} w-full cursor-pointer`}>
                  <Route size={16} aria-hidden />
                  {trace ? "Changer la trace" : "Choisir la trace (.gpx)"}
                  <input
                    type="file"
                    accept=".gpx,application/gpx+xml,text/xml"
                    onChange={chargerTrace}
                    className="sr-only"
                  />
                </label>
                {trace && (
                  <p className={`${AIDE} mt-2`}>
                    {trace.nom ? `${trace.nom} — ` : ""}
                    {trace.profil.length} points de profil
                    {trace.distanceSource === "montre" &&
                      " · distance lue dans le fichier de la montre"}
                  </p>
                )}
              </Groupe>
            )}

            {onglet === "chiffres" && (
              <>
                <Groupe
                  titre="Les chiffres"
                  aide="Calculés depuis le fichier. Corrige-les si ta montre affiche autre chose — c'est elle que tes lecteurs connaissent."
                >
                  {[
                    ["distanceKm", "Distance (km)"],
                    ["dPlusM", "D+ (m)"],
                    ["dMinusM", "D− (m)"],
                  ].map(([cle, libelle]) => (
                    <label key={cle} className="mb-2 flex flex-col gap-1">
                      <span className={LEGENDE}>{libelle}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={champs[cle]}
                        onChange={(e) => setChamps((c) => ({ ...c, [cle]: e.target.value }))}
                        className={CHAMP}
                      />
                    </label>
                  ))}
                  {style === "silhouette" && (
                    <p className={AIDE}>
                      Le D− n&rsquo;apparaît que sur l&rsquo;habillage « Silhouette ». Sur
                      « Chiffres », mets-le dans une mesure si tu le veux.
                    </p>
                  )}
                </Groupe>

                {style === "chiffres" && (
                  <>
                    <Groupe
                      titre="L'en-tête"
                      aide="Ce que porte le haut de l'image : l'activité, et quand elle a eu lieu."
                    >
                      <span className={LEGENDE}>Icône de l&rsquo;activité</span>
                      <div className="mb-3">
                        <ChoixIcone
                          valeur={champs.activite}
                          onChange={(v) => setChamps((c) => ({ ...c, activite: v }))}
                          label="Icône de l'activité"
                        />
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className={LEGENDE}>Date et heure</span>
                        <input
                          type="text"
                          value={champs.entete}
                          placeholder="27 juin 2025, 23:05"
                          onChange={(e) => setChamps((c) => ({ ...c, entete: e.target.value }))}
                          className={CHAMP}
                        />
                      </label>
                    </Groupe>

                    <Groupe
                      titre="La ligne de mesures"
                      aide="Trois mesures libres, sous la distance. Vide = absente. L'icône se choisit dans le même vocabulaire que les planches."
                    >
                      <div className="flex flex-col gap-3">
                        {champs.mesures.map((mes, i) => (
                          <div key={`mesure-${i}`} className="flex flex-col gap-1.5">
                            <ChoixIcone
                              valeur={mes.icone}
                              onChange={(v) => majMesure(i, { icone: v })}
                              label={`Icône de la mesure ${i + 1}`}
                            />
                            <input
                              type="text"
                              value={mes.texte}
                              placeholder={i === 0 ? "21:15:08" : i === 1 ? "4 700 m D−" : "10'31\"/km"}
                              onChange={(e) => majMesure(i, { texte: e.target.value })}
                              className={CHAMP}
                              aria-label={`Texte de la mesure ${i + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </Groupe>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function telecharger(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  // Révocation différée : Safari lit l'URL APRÈS le clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
