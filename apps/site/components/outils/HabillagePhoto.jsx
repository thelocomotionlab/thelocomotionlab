// components/outils/HabillagePhoto.jsx
//
// L'atelier d'habillage : une photo + un GPX → une story prête à publier.
//
// TOUT SE PASSE DANS LE TÉLÉPHONE. Ni photo ni trace ne quittent l'appareil :
// pas de serveur, donc rien à stocker, rien à purger, et ça marche hors réseau
// une fois la page en cache (elle fait partie de la PWA). C'est aussi ce qui
// permet de traiter un GPX de 6 Mo sans se demander qui paie la bande passante.
//
// Les chiffres sont MODIFIABLES. Une montre n'affiche pas ce que son propre
// fichier contient : sur la Croix de Belledonne, le GPX Coros donne 22,86 km de
// tracé et annonce 24,26 km, et son D+ à l'écran dépasse de ~12 % ce que ses
// altitudes exportées permettent de recalculer. Publier un chiffre qui
// contredit sa montre serait pénible ; on part donc du fichier, et on laisse le
// dernier mot à l'auteur.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageUp, Route, Share2 } from "lucide-react";

import { statsDeGpx } from "@/lib/gpxStats";
import { chargerImage } from "@/lib/imageFile";
import { COULEURS, dessinerHabillage, STORY } from "@/lib/habillage";

// La marque du labo, fond transparent, produite depuis le logo source par
// `pnpm -F site build:icons` (scripts/build-icons.mjs).
const LOGO_MARQUE = "/images/assets/logo-mark-512.png";

const CHAMP =
  "w-full rounded-xl border border-brand-field bg-brand-paper px-3 py-2 font-heading text-[15px] text-brand-text focus:border-brand-primary-dark focus:outline-none";
const BOUTON_PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-deep px-5 py-2.5 font-heading text-[14px] font-medium text-brand-bg transition-colors hover:bg-brand-deep-dark disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
const BOUTON_SECOND =
  "inline-flex items-center justify-center gap-2 rounded-full border border-brand-primary/45 bg-brand-primary/12 px-5 py-2.5 font-heading text-[14px] font-medium text-brand-primary-dark transition-colors hover:border-brand-primary-dark hover:bg-brand-primary/30 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

/**
 * Famille de police à donner au canvas.
 *
 * On lit la `font-family` RÉSOLUE du body, pas la variable `--next-font-ubuntu`
 * : next/font pose cette variable sur `<body>` (app/layout.js), et l'interroger
 * sur `documentElement` renvoyait une chaîne vide — le canvas dessinait alors
 * en police système sans que rien ne le signale. La valeur résolue porte de
 * toute façon le nom généré au build, qui est exactement ce dont on a besoin.
 */
function policeUbuntu() {
  if (typeof document === "undefined") return "sans-serif";
  const famille = getComputedStyle(document.body).fontFamily;
  return famille && famille !== "" ? famille : "sans-serif";
}

/**
 * La marque du labo, RECOLORÉE en crème.
 *
 * Le logo source est terracotta — sa couleur sur fond clair. Posé tel quel sur
 * le voile sombre du bas de la story, il vire au marron boueux et se perd. On
 * le reteinte donc à l'encre du nom : on dessine la marque dans un canevas
 * hors écran, puis `source-in` ne garde la couleur QUE là où il y a des pixels
 * — les traits deviennent crème, la transparence le reste.
 *
 * Une seule fois au chargement : l'aperçu est redessiné à chaque frappe et à
 * chaque mouvement du curseur de cadrage.
 */
async function chargerMarqueTeintee() {
  const img = new Image();
  img.decoding = "async";
  img.src = LOGO_MARQUE;
  await img.decode();

  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = COULEURS.creme;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export default function HabillagePhoto() {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [nomPhoto, setNomPhoto] = useState("");
  const [trace, setTrace] = useState(null);
  const [ancrage, setAncrage] = useState(0.5);
  const [champs, setChamps] = useState({ distanceKm: "", dPlusM: "", dMinusM: "" });
  const [etat, setEtat] = useState({ occupe: false, message: "" });
  const [policePrete, setPolicePrete] = useState(false);
  const [marque, setMarque] = useState(null);

  // Le canvas dessine avec la vraie fonte du site : sans cette attente, le
  // premier rendu part en police système et le texte saute ensuite.
  useEffect(() => {
    let vivant = true;
    const famille = policeUbuntu();
    Promise.all([
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
    chargerMarqueTeintee()
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
      setChamps({
        distanceKm: stats.distanceKm.toFixed(1).replace(".", ","),
        dPlusM: String(stats.dPlusM),
        dMinusM: String(stats.dMinusM),
      });
      setEtat({ occupe: false, message: "" });
    } catch {
      setEtat({ occupe: false, message: "Fichier illisible — attendu : un .gpx." });
    }
  }, []);

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    dessinerHabillage(ctx, {
      image,
      profil: trace?.profil ?? [],
      distanceKm: valeurs.distanceKm,
      dPlusM: valeurs.dPlusM,
      dMinusM: valeurs.dMinusM,
      ancrage,
      police: policeUbuntu(),
      logo: marque,
    });
  }, [image, trace, valeurs, ancrage, policePrete, marque]);

  const fichierFinal = useCallback(
    () =>
      new Promise((resolve) => {
        canvasRef.current?.toBlob(
          (blob) =>
            resolve(
              blob
                ? new File([blob], `locomotion-${Date.now()}.jpg`, { type: "image/jpeg" })
                : null,
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

  const pret = Boolean(image && trace);

  // ORDRE DE LECTURE. Sur téléphone, tout s'empile : on choisit les fichiers,
  // on VOIT le résultat, puis on ajuste et on partage — l'aperçu ne peut pas
  // être sous le bouton « Partager ». Sur grand écran il passe à gauche, en
  // vis-à-vis des réglages, d'où les placements explicites de grille.
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
      <div className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-3">
        <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl bg-brand-text/10 shadow-card">
          <canvas
            ref={canvasRef}
            width={STORY.width}
            height={STORY.height}
            className="block h-auto w-full"
            aria-label="Aperçu de la story habillée"
          />
        </div>
        <p className="mx-auto mt-3 max-w-[320px] text-center font-heading text-[12px] leading-[1.5] text-brand-text/55">
          Aperçu à l&rsquo;échelle exacte du fichier exporté (1080 × 1920). Le profil et les
          chiffres sont posés dans la zone qu&rsquo;Instagram ne recouvre pas.
        </p>
      </div>

      <div className="order-1 flex flex-col gap-3 lg:order-none lg:col-start-2 lg:row-start-1">
          <label className={`${BOUTON_SECOND} cursor-pointer`}>
            <ImageUp size={16} strokeWidth={2} aria-hidden="true" />
            {image ? "Changer la photo" : "Choisir une photo"}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              onChange={chargerPhoto}
              className="sr-only"
            />
          </label>
          {nomPhoto && (
            <p className="truncate font-heading text-[12px] text-brand-text/55">{nomPhoto}</p>
          )}

          <label className={`${BOUTON_SECOND} cursor-pointer`}>
            <Route size={16} strokeWidth={2} aria-hidden="true" />
            {trace ? "Changer la trace" : "Choisir la trace (.gpx)"}
            <input type="file" accept=".gpx,application/gpx+xml,text/xml" onChange={chargerTrace} className="sr-only" />
          </label>
          {trace && (
            <p className="font-heading text-[12px] leading-[1.5] text-brand-text/55">
              {trace.nom ? `${trace.nom} — ` : ""}
              {trace.profil.length} points de profil
              {trace.distanceSource === "montre" && " · distance lue dans le fichier de la montre"}
            </p>
          )}

        {etat.message && (
          <p className="rounded-xl bg-brand-deep/10 px-3 py-2 font-heading text-[13px] text-brand-deep-dark" role="status">
            {etat.message}
          </p>
        )}
      </div>

      <div className="order-3 flex flex-col gap-5 lg:order-none lg:col-start-2 lg:row-start-2">
        {image && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ancrage" className="font-heading text-[12px] uppercase tracking-[0.14em] text-brand-text/55">
              Cadrage
            </label>
            <input
              id="ancrage"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ancrage}
              onChange={(e) => setAncrage(Number.parseFloat(e.target.value))}
              className="w-full accent-brand-deep"
            />
          </div>
        )}

        {trace && (
          <fieldset className="flex flex-col gap-3 rounded-2xl border border-brand-hairline bg-brand-paper p-4">
            <legend className="px-1 font-heading text-[12px] uppercase tracking-[0.14em] text-brand-text/55">
              Les chiffres
            </legend>
            <p className="font-heading text-[12px] leading-[1.5] text-brand-text/60">
              Calculés depuis le fichier. Corrige-les si ta montre affiche autre chose — c&rsquo;est
              elle que tes lecteurs connaissent.
            </p>
            {[
              ["distanceKm", "Distance (km)"],
              ["dPlusM", "D+ (m)"],
              ["dMinusM", "D− (m)"],
            ].map(([cle, libelle]) => (
              <label key={cle} className="flex flex-col gap-1">
                <span className="font-heading text-[12.5px] text-brand-text/70">{libelle}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={champs[cle]}
                  onChange={(e) => setChamps((c) => ({ ...c, [cle]: e.target.value }))}
                  className={CHAMP}
                />
              </label>
            ))}
          </fieldset>
        )}

      </div>

      <div className="order-4 lg:order-none lg:col-start-2 lg:row-start-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={partager} disabled={!pret || etat.occupe} className={BOUTON_PRINCIPAL}>
            <Share2 size={16} strokeWidth={2} aria-hidden="true" />
            Partager
          </button>
          <button type="button" onClick={enregistrer} disabled={!pret || etat.occupe} className={BOUTON_SECOND}>
            <Download size={16} strokeWidth={2} aria-hidden="true" />
            Enregistrer
          </button>
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
