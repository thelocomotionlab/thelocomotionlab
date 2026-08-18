// components/outils/CarrouselAtelier.jsx
//
// L'ATELIER CARROUSEL : des cartes → un lot d'images à publier.
//
// TOUT SE PASSE DANS LE NAVIGATEUR, comme l'habillage de photo : ni la trace ni
// les photos ne quittent l'appareil, il n'y a donc rien à stocker et rien à
// purger. C'est aussi ce qui permet d'ouvrir l'outil sur le téléphone, au
// bivouac, sans réseau — sauf pour le fond de carte, qui dégrade proprement.
//
// L'OUTIL S'OUVRE SUR UNE CARTE VIERGE. La trace est une OPTION, pas un péage :
// seul le gabarit « Carte » en a besoin, et on écrit très bien un carrousel de
// texte et de photos sans jamais charger de GPX.
//
// L'APERÇU NE BOUGE PAS. Il est collé en haut de l'écran pendant qu'on
// descend dans les réglages — sinon on règle à l'aveugle, ce qui était le
// principal défaut de la première version. Les réglages, eux, sont repliés par
// sections : on n'ouvre que celle dont on a besoin.
//
// CE QUE L'OUTIL N'EST PAS : un Canva. On ne pose pas n'importe quoi n'importe
// où. On remplit DES GABARITS. Tout est réglable À L'INTÉRIEUR de la mise en
// page — corps, couleurs, opacités, découpage, étiquettes — mais la mise en
// page, elle, tient. C'est ce qui fait que deux carrousels publiés à six mois
// d'écart se ressemblent encore.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  ImageUp,
  Loader2,
  Map as MapIcon,
  Plus,
  RotateCcw,
  Route,
  Trash2,
} from "lucide-react";

import {
  CORPS,
  FLECHES,
  FORMATS,
  GABARITS,
  MARQUES,
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
  fusionnerTraces,
  traceDepuisGpx,
  traceDepuisTrackJson,
} from "@/lib/carrouselTrace";
import { AIDE_BALISAGE } from "@/lib/carrouselTexte";
import { CLES_ICONES } from "@/lib/carrouselIcones";
import { chargerImage } from "@/lib/imageFile";
import { chargerMarqueTeintee } from "@/lib/marque";
import { liveConfig } from "@/lib/liveConfig";

const CHAMP =
  "w-full rounded-xl border border-brand-field bg-brand-paper px-3 py-2 font-heading text-[15px] text-brand-text focus:border-brand-primary-dark focus:outline-none";
const BOUTON_PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-deep px-5 py-2.5 font-heading text-[14px] font-medium text-brand-bg transition-colors hover:bg-brand-deep-dark disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
const BOUTON_SECOND =
  "inline-flex items-center justify-center gap-2 rounded-full border border-brand-primary/45 bg-brand-primary/12 px-4 py-2 font-heading text-[14px] font-medium text-brand-primary-dark transition-colors hover:border-brand-primary-dark hover:bg-brand-primary/30 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
const LEGENDE =
  "mb-1 block font-heading text-[13px] font-medium text-brand-text/70";
const CASE =
  "flex items-center gap-2 font-heading text-[14px] text-brand-text/75";

/** Une section repliable. Native `<details>` : le clavier et les lecteurs
 *  d'écran la connaissent déjà, il n'y a rien à réimplémenter. */
function Section({ titre, ouvert = false, children }) {
  return (
    <details
      open={ouvert}
      className="group rounded-2xl border border-brand-field bg-brand-paper/60"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-heading text-[15px] font-medium text-brand-text marker:content-['']">
        {titre}
        <ChevronDown
          size={17}
          aria-hidden
          className="text-brand-text/45 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-brand-field/70 px-4 pb-4 pt-3">
        {children}
      </div>
    </details>
  );
}

/** Un réglage numérique en pixels de planche (référence : 1080 de large). */
function Taille({ id, label, valeur, defaut, onChange }) {
  return (
    <div>
      <label className={LEGENDE} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={8}
        max={260}
        value={valeur ?? defaut}
        onChange={(e) => onChange(Number(e.target.value) || defaut)}
        className={CHAMP}
      />
    </div>
  );
}

/** Une couleur, avec le moyen de revenir à celle du thème. */
function Couleur({ label, valeur, defaut, onChange }) {
  return (
    <div>
      <span className={LEGENDE}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={valeur || defaut}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full cursor-pointer rounded-lg border border-brand-field bg-transparent"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={!valeur}
          className="rounded-full p-1.5 text-brand-text/40 hover:bg-brand-primary/15 hover:text-brand-primary-dark disabled:opacity-25"
          title="Revenir à la couleur du thème"
          aria-label={`${label} — revenir au thème`}
        >
          <RotateCcw size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Opacite({ id, label, valeur, onChange }) {
  const v = valeur ?? 1;
  return (
    <div>
      <label className={LEGENDE} htmlFor={id}>
        {label} — {Math.round(v * 100)} %
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-primary-dark"
      />
    </div>
  );
}

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
    {
      label: "Distance",
      valeur: trace ? `${Math.round(trace.totalKm)} km` : "",
      accent: false,
    },
    {
      label: "Dénivelé",
      valeur: trace ? `${trace.dPlusM.toLocaleString("fr-FR")} m` : "",
      accent: false,
    },
    {
      label: "Durée visée",
      valeur: segments?.length > 1 ? `${segments.length} jours` : "",
      accent: false,
    },
    { label: "Sac de départ", valeur: "", accent: false },
    { label: "Ravitaillement", valeur: "aucun", accent: true },
  ];
}

/**
 * `id` est fourni par l'appelant, JAMAIS tiré d'un compteur de module.
 *
 * Un compteur au niveau du module survit d'une requête à l'autre côté serveur :
 * le rendu SSR pouvait sortir « c7 » là où le client, module frais, sortait
 * « c1 ». Des `key` différentes, et React refusait d'hydrater l'arbre — avec un
 * message qui accusait le bouton « Avancer cette carte », très loin de la cause.
 */
function carteNeuve(gabarit, trace, segments, bilan = false, id = "c0") {
  return {
    id,
    gabarit,
    /* --- contenu --- */
    entete: "",
    enteteAccent: false,
    surtitre:
      gabarit === "carte" ? (trace?.vecue ? "La sortie" : "L'itinéraire") : "",
    titre: gabarit === "carte" ? (trace?.nom ?? liveConfig.aventure.nom) : "",
    texte: "",
    pied: null,
    piedCentre: "",
    piedDroite: "",
    /* --- mise en forme : vide = la valeur du thème / de la charte --- */
    tailleTitre: null,
    tailleCorps: null,
    tailleSurtitre: null,
    tailleEntete: null,
    taillePied: null,
    epaisseurFilet: null,
    tailleFicheLabel: null,
    tailleFicheValeur: null,
    tailleLogo: null,
    couleurTitre: "",
    couleurCorps: "",
    couleurAccent: "",
    couleurFond: "",
    enteteOpacite: 1,
    piedOpacite: 1,
    /** Ce que porte la bande d'en-tête : "" (logo + nom), sans-nom, sans-logo, rien. */
    marque: "",
    couleurLogo: "",
    /** auto | toujours | jamais */
    piedFleche: "auto",
    centrer: false,
    /** Les filets sous l'en-tête et au-dessus du pied. */
    filetEntete: gabarit !== "cloture",
    filetPied: gabarit !== "cloture",
    /** N'afficher que les n+1 premières journées. `null` = tout. */
    jusquA: null,
    /* --- propres aux gabarits --- */
    etiquettes: [],
    afficherFond: true,
    afficherProfil: true,
    image: null,
    nomImage: "",
    ancrage: 0.5,
    degradeHaut: true,
    degradeBas: true,
    bandeauPart: 0.42,
    fiche: gabarit === "fiche" ? ficheParDefaut(trace, segments) : [],
    segment: null,
    /* --- clôture --- */
    tailleCercle: 128,
    epaisseurCercle: 4,
    couleurCercle: "",
    voileCloture: 0.62,
    ...(gabarit === "cloture" ? clotureParDefaut(bilan) : null),
  };
}

/**
 * Le mot de la fin, pré-rempli selon ce que le carrousel raconte : avant le
 * départ on renvoie vers le direct, après on remercie. C'est du texte, il se
 * réécrit — mais partir d'une page blanche pour la dernière planche est
 * exactement le moment où on abandonne.
 */
function clotureParDefaut(bilan) {
  const commun = {
    // La marque est déjà au centre, en grand : la répéter en haut fait doublon.
    marque: "rien",
    cercleVisible: false,
  };
  return bilan
    ? {
        ...commun,
        surtitre: "c'est fini",
        titre: "Merci d'avoir suivi.",
        texte: "Le récit complet arrive sur le site.",
      }
    : {
        ...commun,
        surtitre: "à suivre en direct",
        titre: "Position, carnet de bord, messages.",
        texte: "thelocomotionlab.com/live",
      };
}

/** Une carte sur laquelle personne n'a encore rien écrit — on peut la
 *  remplacer sans rien perdre quand une trace arrive. */
function estVierge(c) {
  return (
    !c.titre &&
    !c.texte &&
    !c.entete &&
    !c.surtitre &&
    !c.image &&
    !c.fiche?.length
  );
}

export default function CarrouselAtelier() {
  const canvasRef = useRef(null);
  const boitesRef = useRef([]);
  const glisseRef = useRef(null);
  const texteRef = useRef(null);
  /** Les identifiants de cartes, propres à CETTE instance (cf. carteNeuve). */
  const idRef = useRef(0);
  const idNeuf = useCallback(() => {
    idRef.current += 1;
    return `c${idRef.current}`;
  }, []);

  const [trace, setTrace] = useState(null);
  const [formatCle, setFormatCle] = useState("carrousel");
  const [themeCle, setThemeCle] = useState("sombre");
  // AVANT ou APRÈS : c'est une propriété du CARROUSEL, pas d'une carte.
  // Un carrousel annonce une aventure ou la raconte — jamais les deux.
  const [bilan, setBilan] = useState(false);
  const [coupures, setCoupures] = useState([]);
  /** L'itinéraire COMPLET, jamais dessiné : il ne sert qu'à figer le cadrage. */
  const [traceCadre, setTraceCadre] = useState(null);
  // L'atelier démarre sur une carte de texte : utilisable sans rien charger.
  const [cartes, setCartes] = useState(() => [
    carteNeuve("texte", null, [], false, "c0"),
  ]);
  const [active, setActive] = useState(0);
  const [fond, setFond] = useState(null);
  const [marque, setMarque] = useState(null);
  const [policePrete, setPolicePrete] = useState(false);
  const [etat, setEtat] = useState({ occupe: false, message: "" });

  const format = FORMATS[formatCle];
  const theme = THEMES[themeCle];
  const segments = useMemo(
    () => decouperTrace(trace, coupures),
    [trace, coupures],
  );
  const carte = cartes[active] ?? null;

  /* --------------------------------------------------------------- chargements */

  useEffect(() => {
    let vivant = true;
    const famille = policeUbuntu();
    Promise.all([
      document.fonts.load(`700 65px ${famille}`),
      document.fonts.load(`500 22px ${famille}`),
      document.fonts.load(`400 38px ${famille}`),
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
    chargerMarqueTeintee(
      carte?.couleurLogo || carte?.couleurTitre || theme.encre,
    )
      .then((c) => vivant && setMarque(c))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [theme.encre, carte?.couleurTitre, carte?.couleurLogo]);

  // Le fond de carte suit la trace ET le format (le cadrage change avec le
  // rapport de l'image). Un chargement plus ancien qui reviendrait après un
  // plus récent est ignoré : `vivant` sert de garde.
  useEffect(() => {
    let vivant = true;
    // Pas de garde synchrone ici : `vueDeLaCarte` rend null sans coordonnées et
    // `chargerFond` l'absorbe. Tout passe donc par la promesse — un setState
    // posé directement dans le corps de l'effet déclencherait un rendu en
    // cascade (et le lint le refuse, à raison).
    chargerFond(vueDeLaCarte((traceCadre ?? trace)?.coords ?? [], formatCle))
      .then((f) => vivant && setFond(f))
      .catch(() => vivant && setFond(null));
    return () => {
      vivant = false;
    };
  }, [trace, traceCadre, formatCle]);

  /**
   * @param {object|null} t
   * @param {boolean} deLAventure - vrai seulement pour l'itinéraire de
   *   `liveConfig`. Les waypoints (Arsine 42, Vallouise 84, Valgaudémar 130,6)
   *   ne décrivent QUE cette aventure : les appliquer à un GPX importé
   *   découperait une sortie de 60 km à des kilomètres qui n'ont aucun sens.
   */
  // Les jonctions d'une fusion l'emportent sur le découpage automatique : ce
  // sont de vraies fins d'étape, pas une estimation.
  const jonctionsRef = useRef(null);
  const setCoupuresApresFusion = useCallback((km) => {
    jonctionsRef.current = km;
  }, []);

  const appliquerTrace = useCallback(
    (t, deLAventure = false) => {
      if (!t) {
        setEtat({
          occupe: false,
          message: "Fichier illisible — attendu un .gpx ou un .track.json.",
        });
        return;
      }
      setTrace(t);
      setBilan(Boolean(t.vecue));
      // Une sortie DÉJÀ FAITE est d'un seul tenant par défaut : elle se raconte,
      // elle ne se planifie plus. Un itinéraire prévu, lui, se découpe.
      const auto = deLAventure
        ? coupuresDepuisWaypoints(liveConfig.aventure.waypoints, t.totalKm)
        : [];
      setCoupures(
        auto.length ? auto : t.vecue ? [] : coupuresRegulieres(t.totalKm, 2),
      );

      // On ne jette JAMAIS un texte déjà écrit : la carte de l'itinéraire remplace
      // une planche vierge, et s'ajoute derrière les autres.
      setCartes((cs) => {
        const neuve = carteNeuve("carte", t, [], Boolean(t.vecue), idNeuf());
        if (cs.every(estVierge)) return [neuve];
        setActive(cs.length);
        return [...cs, neuve];
      });
      setEtat({ occupe: false, message: "" });
    },
    [idNeuf],
  );

  /**
   * Un fichier, ou PLUSIEURS recollés bout à bout.
   *
   * Le cas qui l'exige : une aventure de quatre jours enregistrée en quatre
   * sorties, parce que la montre s'arrête au bivouac. Les fichiers sont pris
   * dans l'ordre ALPHABÉTIQUE de leur nom — c'est celui des exports de montre
   * (horodatés), et c'est le seul ordre qu'on peut deviner sans se tromper.
   * Les jonctions deviennent les coupures de journée : elles sont exactes, ce
   * sont de vraies fins d'étape.
   */
  const chargerFichierTrace = useCallback(
    async (e) => {
      const fichiers = [...(e.target.files ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );
      if (fichiers.length === 0) return;
      setEtat({
        occupe: true,
        message:
          fichiers.length > 1
            ? `Lecture de ${fichiers.length} traces…`
            : "Lecture de la trace…",
      });
      try {
        const traces = [];
        for (const file of fichiers) {
          const texte = await file.text();
          const t = file.name.endsWith(".json")
            ? traceDepuisTrackJson(JSON.parse(texte))
            : traceDepuisGpx(texte);
          if (t) traces.push(t);
        }
        const fusion = fusionnerTraces(traces);
        if (fusion?.jonctions?.length) setCoupuresApresFusion(fusion.jonctions);
        appliquerTrace(fusion);
      } catch {
        setEtat({
          occupe: false,
          message: "Fichier illisible — attendu un .gpx ou un .track.json.",
        });
      }
    },
    [appliquerTrace, setCoupuresApresFusion],
  );

  /** La référence ne remplace RIEN : elle se pose à côté, et fige le cadre. */
  const chargerReference = useCallback(async (e) => {
    const fichiers = [...(e.target.files ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "fr"),
    );
    if (fichiers.length === 0) return;
    setEtat({ occupe: true, message: "Lecture de la référence…" });
    try {
      const traces = [];
      for (const file of fichiers) {
        const texte = await file.text();
        const t = file.name.endsWith(".json")
          ? traceDepuisTrackJson(JSON.parse(texte))
          : traceDepuisGpx(texte);
        if (t) traces.push(t);
      }
      setTraceCadre(fusionnerTraces(traces));
      setEtat({ occupe: false, message: "" });
    } catch {
      setEtat({
        occupe: false,
        message: "Référence illisible — attendu un .gpx ou un .track.json.",
      });
    }
  }, []);

  const chargerAventure = useCallback(async () => {
    setEtat({ occupe: true, message: "Chargement de l'itinéraire…" });
    try {
      const res = await fetch(liveConfig.aventure.trace);
      appliquerTrace(traceDepuisTrackJson(await res.json()), true);
    } catch {
      setEtat({
        occupe: false,
        message: "Itinéraire de l'aventure introuvable.",
      });
    }
  }, [appliquerTrace]);

  /* ------------------------------------------------------------------- édition */

  const majCarte = useCallback(
    (patch) =>
      setCartes((cs) =>
        cs.map((c, i) => (i === active ? { ...c, ...patch } : c)),
      ),
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

  /**
   * Insère une balise LÀ OÙ EST LE CURSEUR, pas à la fin du champ.
   *
   * Ajouter en bout de texte oblige à couper-coller derrière : autant taper la
   * balise à la main. On repose donc le curseur juste après l'insertion, et on
   * rend le focus au champ — la frappe continue sans rien toucher à la souris.
   */
  const insererDansTexte = useCallback(
    (balise) => {
      const champ = texteRef.current;
      const actuel = carte?.texte ?? "";
      const debut = champ?.selectionStart ?? actuel.length;
      const fin = champ?.selectionEnd ?? actuel.length;
      majCarte({ texte: actuel.slice(0, debut) + balise + actuel.slice(fin) });
      requestAnimationFrame(() => {
        champ?.focus();
        champ?.setSelectionRange(debut + balise.length, debut + balise.length);
      });
    },
    [carte?.texte, majCarte],
  );

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

  // La nouvelle carte devient l'active : on vient de la créer, c'est elle qu'on
  // veut voir. Son index est la longueur ACTUELLE de la liste.
  const ajouterCarte = useCallback(
    (gabarit) => {
      setCartes((cs) => [
        ...cs,
        carteNeuve(gabarit, trace, segments, bilan, idNeuf()),
      ]);
      setActive(cartes.length);
    },
    [trace, segments, bilan, cartes.length, idNeuf],
  );

  const supprimerCarte = useCallback((i) => {
    setCartes((cs) => (cs.length <= 1 ? cs : cs.filter((_, k) => k !== i)));
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
    if (bouge)
      setActive((a) => (a === i ? i + delta : a === i + delta ? i : a));
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
      traceCadre,
      segments,
      police: policeUbuntu(),
      logo: marque,
      fond,
      total: cartes.length,
    }),
    [
      formatCle,
      themeCle,
      trace,
      traceCadre,
      segments,
      marque,
      fond,
      cartes.length,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !carte) return;
    canvas.width = format.width;
    canvas.height = format.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    boitesRef.current =
      dessinerCartePartage(ctx, {
        ...options,
        carte: { ...carte, bilan },
        index: active,
      }) ?? [];
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
        dessinerCartePartage(ctx, {
          ...options,
          carte: { ...cartes[i], bilan },
          index: i,
        });
        const blob = await new Promise((r) =>
          hors.toBlob(r, "image/jpeg", 0.92),
        );
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

  const aPhoto = ["photo", "bandeau", "cloture"].includes(carte?.gabarit);

  return (
    // PAS de `items-start` sur cette grille : il réduirait chaque colonne à la
    // hauteur de son contenu, et la colonne de l'aperçu n'aurait alors aucune
    // course pour coller. C'est l'étirement par défaut qui donne au `sticky`
    // toute la hauteur des réglages pour travailler.
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      {/* ---------------------------------------------------------- aperçu collé */}
      {/* DEUX BOÎTES, et il en faut deux.
          L'extérieure est la colonne de la grille : elle doit rester HAUTE (pas
          de `self-start`, qui la réduirait à la taille de l'aperçu et laisserait
          au collage une course nulle — l'aperçu remontait alors sous la navbar).
          L'intérieure est ce qui colle, à 84 px : la navbar du site est
          `sticky top-0` et fait 80 px (Navbar.jsx, `p-4`). `z-20` garde
          l'aperçu SOUS elle (z-50), pas devant. */}
      {/* `contents` sur mobile : cette boîte n'existe que pour la GRILLE du grand
          écran. Gardée en petit écran, elle n'enveloppe QUE l'aperçu — donc le
          collage n'a aucune course et la planche défile hors de l'écran, ce qui
          est exactement l'inverse du but sur un téléphone. */}
      <div className="contents lg:block lg:col-start-1 lg:row-start-1">
        <div className="sticky top-[var(--apercu-top,84px)] z-20 -mx-4 mb-5 bg-brand-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:mb-0 lg:bg-transparent lg:px-0 lg:py-2 lg:backdrop-blur-none">
          {carte && (
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="mx-auto block h-auto max-h-[38vh] w-auto max-w-full touch-none rounded-2xl bg-brand-text/10 shadow-card lg:max-h-[72vh]"
            />
          )}

          {/* La bande des cartes voyage avec l'aperçu : changer de planche ne doit
            pas demander de remonter. */}
          <div className="mx-auto mt-3 flex max-w-[520px] flex-wrap items-center justify-center gap-1.5">
            {cartes.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-heading text-[12px] transition-colors ${
                  i === active
                    ? "border-brand-primary-dark bg-brand-primary/25 text-brand-text"
                    : "border-brand-field bg-brand-paper text-brand-text/60 hover:border-brand-primary/60"
                }`}
              >
                <span className="tabular-nums">{i + 1}</span>
                <span className="opacity-70">
                  {GABARITS.find((g) => g.cle === c.gabarit)?.label}
                </span>
              </button>
            ))}
          </div>
          {carte?.gabarit === "carte" && segments.length > 0 && (
            <p className="mt-2 text-center font-heading text-[12px] text-brand-text/50">
              Attrape une étiquette pour la déplacer.
            </p>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- réglages */}
      <div className="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
        {etat.message && (
          <p className="rounded-xl bg-brand-primary/12 px-3 py-2 font-heading text-[13px] text-brand-primary-dark">
            {etat.message}
          </p>
        )}

        {/* ---- contenu de la carte affichée ---- */}
        <Section titre={`Carte ${active + 1} — contenu`} ouvert>
          <div className="mb-3 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => deplacerCarte(active, -1)}
              disabled={active === 0}
              className="rounded-full p-1.5 text-brand-text/50 hover:bg-brand-primary/15 disabled:opacity-30"
              aria-label="Reculer cette carte"
            >
              <ArrowLeft size={15} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => deplacerCarte(active, 1)}
              disabled={active === cartes.length - 1}
              className="rounded-full p-1.5 text-brand-text/50 hover:bg-brand-primary/15 disabled:opacity-30"
              aria-label="Avancer cette carte"
            >
              <ArrowRight size={15} aria-hidden />
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

          <label className={LEGENDE} htmlFor="gabarit">
            Gabarit
          </label>
          <select
            id="gabarit"
            value={carte?.gabarit ?? "texte"}
            onChange={(e) => majCarte({ gabarit: e.target.value })}
            className={`${CHAMP} mb-3`}
          >
            {GABARITS.map((g) => (
              <option key={g.cle} value={g.cle}>
                {g.label} — {g.aide}
              </option>
            ))}
          </select>
          {carte?.gabarit === "carte" && !trace && (
            <p className="mb-3 font-heading text-[13px] text-brand-text/55">
              Ce gabarit a besoin d&rsquo;une trace — ouvre « La trace » plus
              bas.
            </p>
          )}

          <label className={LEGENDE} htmlFor="entete">
            En-tête{" "}
            <span className="font-normal opacity-60">— coin haut droit</span>
          </label>
          <input
            id="entete"
            type="text"
            value={carte?.entete ?? ""}
            placeholder="bande photo — détail / matériel"
            onChange={(e) => majCarte({ entete: e.target.value })}
            className={CHAMP}
          />
          <label className={`${CASE} mb-3 mt-1 text-[13px]`}>
            <input
              type="checkbox"
              checked={Boolean(carte?.enteteAccent)}
              onChange={(e) => majCarte({ enteteAccent: e.target.checked })}
            />
            en ambre
          </label>

          <label className={LEGENDE} htmlFor="surtitre">
            Surtitre{" "}
            <span className="font-normal opacity-60">
              — après le filet ambre
            </span>
          </label>
          <input
            id="surtitre"
            type="text"
            value={carte?.surtitre ?? ""}
            placeholder="pourquoi ce tour"
            onChange={(e) => majCarte({ surtitre: e.target.value })}
            className={`${CHAMP} mb-3`}
          />

          <label className={LEGENDE} htmlFor="titre">
            Titre{" "}
            <span className="font-normal opacity-60">
              — le balisage marche aussi ici
            </span>
          </label>
          <input
            id="titre"
            type="text"
            value={carte?.titre ?? ""}
            onChange={(e) => majCarte({ titre: e.target.value })}
            className={`${CHAMP} mb-3`}
          />

          <label className={LEGENDE} htmlFor="texte">
            Texte{" "}
            <span className="font-normal opacity-60">
              — une ligne vide sépare deux paragraphes
            </span>
          </label>
          <p className="mb-1 font-mono text-[12px] text-brand-text/50">
            {AIDE_BALISAGE}
          </p>
          <textarea
            ref={texteRef}
            id="texte"
            rows={4}
            value={carte?.texte ?? ""}
            onChange={(e) => majCarte({ texte: e.target.value })}
            className={`${CHAMP} resize-y`}
          />

          <details className="mb-3 mt-1">
            <summary className="cursor-pointer font-heading text-[12px] text-brand-text/55">
              Icônes — les mêmes que les repères de /live
            </summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {CLES_ICONES.map((cle) => (
                <button
                  key={cle}
                  type="button"
                  onClick={() => insererDansTexte(`:${cle}:`)}
                  className="rounded-lg border border-brand-field bg-brand-paper px-2 py-1 font-mono text-[11px] text-brand-text/70 hover:border-brand-primary-dark hover:text-brand-text"
                  title={`Insérer :${cle}:`}
                >
                  {cle}
                </button>
              ))}
            </div>
          </details>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className={CASE}>
              <input
                type="checkbox"
                checked={carte?.filetEntete !== false}
                onChange={(e) => majCarte({ filetEntete: e.target.checked })}
              />
              Ligne sous l&rsquo;en-tête
            </label>
            <label className={CASE}>
              <input
                type="checkbox"
                checked={carte?.filetPied !== false}
                onChange={(e) => majCarte({ filetPied: e.target.checked })}
              />
              Ligne au-dessus du pied
            </label>
          </div>

          <p className={LEGENDE}>Pied de page</p>
          <select
            value={carte?.piedFleche ?? "auto"}
            onChange={(e) => majCarte({ piedFleche: e.target.value })}
            className={`${CHAMP} mb-2`}
            aria-label="Flèche de swipe"
          >
            {FLECHES.map((f) => (
              <option key={f.cle} value={f.cle}>
                Flèche de swipe — {f.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="text"
              value={carte?.piedCentre ?? ""}
              placeholder="au milieu"
              onChange={(e) => majCarte({ piedCentre: e.target.value })}
              className={CHAMP}
              aria-label="Pied de page, au milieu"
            />
            <input
              type="text"
              value={carte?.piedDroite ?? ""}
              placeholder="à droite (défaut : glisse →)"
              onChange={(e) => majCarte({ piedDroite: e.target.value })}
              className={CHAMP}
              aria-label="Pied de page, à droite"
            />
          </div>
        </Section>

        {/* ---- ce qui dépend du gabarit ---- */}
        {aPhoto && (
          <Section titre="La photo" ouvert>
            <label className={`${BOUTON_SECOND} mb-3 cursor-pointer`}>
              <ImageUp size={16} aria-hidden />
              {carte.nomImage || "Choisir une photo"}
              <input
                type="file"
                accept="image/*,.heic"
                onChange={chargerPhoto}
                className="sr-only"
              />
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
                  onChange={(e) =>
                    majCarte({ bandeauPart: Number(e.target.value) })
                  }
                  className="mb-3 w-full accent-brand-primary-dark"
                />
              </>
            )}

            {/* Réglés séparément : une photo au ciel déjà sombre n'a pas besoin
                d'être assombrie sous l'en-tête. */}
            <p className={LEGENDE}>Dégradés</p>
            <div className="flex flex-col gap-1.5">
              <label className={CASE}>
                <input
                  type="checkbox"
                  checked={carte.degradeHaut !== false}
                  onChange={(e) => majCarte({ degradeHaut: e.target.checked })}
                />
                en-tête
              </label>
              <label className={CASE}>
                <input
                  type="checkbox"
                  checked={carte.degradeBas !== false}
                  onChange={(e) => majCarte({ degradeBas: e.target.checked })}
                />
                {carte.gabarit === "bandeau"
                  ? "bas du bandeau"
                  : "pied de page"}
              </label>
            </div>
          </Section>
        )}

        {carte?.gabarit === "cloture" && (
          <Section titre="Le cercle de clôture" ouvert>
            <label className={`${CASE} mb-3`}>
              <input
                type="checkbox"
                checked={Boolean(carte.cercleVisible)}
                onChange={(e) => majCarte({ cercleVisible: e.target.checked })}
              />
              Anneau autour du logo
            </label>
            <label className={LEGENDE} htmlFor="cercle-taille">
              Rayon — {carte.tailleCercle ?? 128} px
            </label>
            <input
              id="cercle-taille"
              type="range"
              min={60}
              max={260}
              step={2}
              value={carte.tailleCercle ?? 128}
              onChange={(e) =>
                majCarte({ tailleCercle: Number(e.target.value) })
              }
              className="mb-3 w-full accent-brand-primary-dark"
            />
            <label className={LEGENDE} htmlFor="cercle-trait">
              Épaisseur du trait — {carte.epaisseurCercle ?? 4} px
            </label>
            <input
              id="cercle-trait"
              type="range"
              min={1}
              max={16}
              step={1}
              value={carte.epaisseurCercle ?? 4}
              onChange={(e) =>
                majCarte({ epaisseurCercle: Number(e.target.value) })
              }
              className="mb-3 w-full accent-brand-primary-dark"
            />
            {carte.image && (
              <>
                <label className={LEGENDE} htmlFor="cloture-voile">
                  Voile sur la photo —{" "}
                  {Math.round((carte.voileCloture ?? 0.62) * 100)} %
                </label>
                <input
                  id="cloture-voile"
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={carte.voileCloture ?? 0.62}
                  onChange={(e) =>
                    majCarte({ voileCloture: Number(e.target.value) })
                  }
                  className="mb-3 w-full accent-brand-primary-dark"
                />
              </>
            )}
            <Couleur
              label="Couleur du cercle"
              valeur={carte.couleurCercle}
              defaut={theme.encre}
              onChange={(v) => majCarte({ couleurCercle: v })}
            />
          </Section>
        )}

        {carte?.gabarit === "fiche" && (
          <Section titre="Les lignes de la fiche" ouvert>
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
                    aria-label={`Valeur en ambre, ligne ${i + 1}`}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      majCarte({ fiche: carte.fiche.filter((_, k) => k !== i) })
                    }
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
              className={BOUTON_SECOND}
              onClick={() =>
                majCarte({
                  fiche: [
                    ...(carte.fiche ?? []),
                    { label: "", valeur: "", accent: false },
                  ],
                })
              }
            >
              <Plus size={15} aria-hidden />
              Une ligne de plus
            </button>
          </Section>
        )}

        {carte?.gabarit === "chiffres" && trace && (
          <Section titre="Le chiffre" ouvert>
            <label className={LEGENDE} htmlFor="chiffres-jour">
              Chiffres de
            </label>
            <select
              id="chiffres-jour"
              value={carte.segment ?? ""}
              onChange={(e) =>
                majCarte({
                  segment:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={CHAMP}
            >
              <option value="">Tout l&rsquo;itinéraire</option>
              {segments.map((s, i) => (
                <option key={`chiffres-${s.kmDebut}`} value={i}>
                  Journée {i + 1}
                </option>
              ))}
            </select>
          </Section>
        )}

        {carte?.gabarit === "carte" && trace && (
          <Section titre="L'itinéraire et les journées" ouvert>
            <label className={`${CASE} mb-2`}>
              <input
                type="checkbox"
                checked={carte.afficherFond !== false}
                onChange={(e) => majCarte({ afficherFond: e.target.checked })}
              />
              Fond de carte topo
              {!fond && trace.coords.length > 0 && (
                <span className="text-brand-text/45">
                  (indisponible hors ligne)
                </span>
              )}
            </label>
            <label className={`${CASE} mb-3`}>
              <input
                type="checkbox"
                checked={carte.afficherProfil !== false}
                onChange={(e) => majCarte({ afficherProfil: e.target.checked })}
              />
              Profil altimétrique
            </label>

            {segments.length > 1 && (
              <>
                <label className={LEGENDE} htmlFor="jusqu-a">
                  Afficher
                </label>
                <select
                  id="jusqu-a"
                  value={carte.jusquA ?? ""}
                  onChange={(e) =>
                    majCarte({
                      jusquA:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={`${CHAMP} mb-1`}
                >
                  <option value="">Tout l&rsquo;itinéraire</option>
                  {segments.map((sg, i) => (
                    <option key={`jusqua-${sg.kmDebut}`} value={i}>
                      Jusqu&rsquo;à la journée {i + 1}
                    </option>
                  ))}
                </select>
                <p className="mb-3 font-heading text-[12px] text-brand-text/45">
                  Une carte par valeur, et la série révèle l&rsquo;itinéraire
                  jour après jour. Le cadre, lui, ne bouge pas.
                </p>
              </>
            )}

            <label className={LEGENDE} htmlFor="nb-jours">
              Nombre de journées
            </label>
            <div className="mb-3 flex items-center gap-2">
              <input
                id="nb-jours"
                type="number"
                min={1}
                max={12}
                value={segments.length}
                onChange={(e) =>
                  setCoupures(
                    coupuresRegulieres(trace.totalKm, Number(e.target.value)),
                  )
                }
                className={`${CHAMP} w-24`}
              />
              <button
                type="button"
                className={BOUTON_SECOND}
                onClick={() =>
                  setCoupures(
                    coupuresDepuisWaypoints(
                      liveConfig.aventure.waypoints,
                      trace.totalKm,
                    ),
                  )
                }
              >
                Depuis les bivouacs
              </button>
            </div>

            <p className={LEGENDE}>Fin de chaque journée, en kilomètres</p>
            <div className="mb-3 flex flex-col gap-2">
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
                      setCoupures((cs) =>
                        cs
                          .map((c, k) => (k === i ? v : c))
                          .sort((a, b) => a - b),
                      );
                    }}
                    className={`${CHAMP} w-28`}
                  />
                  <span className="font-heading text-[13px] text-brand-text/45">
                    km
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCoupures((cs) => cs.filter((_, k) => k !== i))
                    }
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
                    [
                      ...cs,
                      Math.min(
                        trace.totalKm - 1,
                        (cs[cs.length - 1] ?? 0) + trace.totalKm / 4,
                      ),
                    ].sort((a, b) => a - b),
                  )
                }
              >
                <Plus size={15} aria-hidden />
                Une journée de plus
              </button>
            </div>

            <p className={LEGENDE}>Étiquettes</p>
            <div className="flex flex-col gap-2">
              {segments.map((seg, i) => {
                const etq = carte.etiquettes?.[i] ?? {};
                return (
                  <div
                    key={`etq-${seg.kmDebut}`}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={etq.texte ?? etiquetteParDefaut(i)}
                      onChange={(e) =>
                        majEtiquette(i, { texte: e.target.value })
                      }
                      className={`${CHAMP} flex-1`}
                      aria-label={`Étiquette de la journée ${i + 1}`}
                    />
                    <input
                      type="color"
                      value={
                        etq.couleur ?? PALETTE_JOURS[i % PALETTE_JOURS.length]
                      }
                      onChange={(e) =>
                        majEtiquette(i, { couleur: e.target.value })
                      }
                      className="h-9 w-9 cursor-pointer rounded-lg border border-brand-field bg-transparent"
                      aria-label={`Couleur de la journée ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => majEtiquette(i, { dx: 0, dy: 0 })}
                      className="rounded-full p-1.5 text-brand-text/45 hover:bg-brand-primary/15"
                      aria-label={`Replacer l'étiquette ${i + 1}`}
                    >
                      <RotateCcw size={14} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 font-heading text-[12px] text-brand-text/45">
              {segments
                .map(
                  (s, i) =>
                    `J${i + 1} ${s.distanceKm.toFixed(1)} km / ${s.dPlusM} m D+`,
                )
                .join("  ·  ")}
            </p>
          </Section>
        )}

        {/* ---- mise en forme ---- */}
        <Section titre="Mise en forme">
          <p className="mb-3 font-heading text-[12px] text-brand-text/50">
            Corps en pixels d&rsquo;une planche de 1080 de large. Vide ou remis
            à zéro = la valeur de la charte.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Taille
              id="t-titre"
              label="Titre"
              valeur={carte?.tailleTitre}
              defaut={CORPS.titre}
              onChange={(v) => majCarte({ tailleTitre: v })}
            />
            <Taille
              id="t-corps"
              label="Texte"
              valeur={carte?.tailleCorps}
              defaut={CORPS.corps}
              onChange={(v) => majCarte({ tailleCorps: v })}
            />
            <Taille
              id="t-surtitre"
              label="Surtitre"
              valeur={carte?.tailleSurtitre}
              defaut={CORPS.surtitre}
              onChange={(v) => majCarte({ tailleSurtitre: v })}
            />
            <Taille
              id="t-filet"
              label="Filet ambre"
              valeur={carte?.epaisseurFilet}
              defaut={CORPS.filet}
              onChange={(v) => majCarte({ epaisseurFilet: v })}
            />
            <Taille
              id="t-entete"
              label="En-tête"
              valeur={carte?.tailleEntete}
              defaut={CORPS.entete}
              onChange={(v) => majCarte({ tailleEntete: v })}
            />
            <Taille
              id="t-pied"
              label="Pied"
              valeur={carte?.taillePied}
              defaut={CORPS.pied}
              onChange={(v) => majCarte({ taillePied: v })}
            />
            <Taille
              id="t-logo"
              label="Logo"
              valeur={carte?.tailleLogo}
              defaut={CORPS.logo}
              onChange={(v) => majCarte({ tailleLogo: v })}
            />
            {carte?.gabarit === "fiche" && (
              <>
                <Taille
                  id="t-fiche-l"
                  label="Fiche · libellés"
                  valeur={carte?.tailleFicheLabel}
                  defaut={CORPS.ficheLabel}
                  onChange={(v) => majCarte({ tailleFicheLabel: v })}
                />
                <Taille
                  id="t-fiche-v"
                  label="Fiche · valeurs"
                  valeur={carte?.tailleFicheValeur}
                  defaut={CORPS.ficheValeur}
                  onChange={(v) => majCarte({ tailleFicheValeur: v })}
                />
              </>
            )}
          </div>

          <label className={LEGENDE} htmlFor="marque">
            Bande d&rsquo;en-tête
          </label>
          <select
            id="marque"
            value={carte?.marque ?? ""}
            onChange={(e) => majCarte({ marque: e.target.value })}
            className={`${CHAMP} mb-3`}
          >
            {MARQUES.map((mq) => (
              <option key={mq.cle} value={mq.cle}>
                {mq.label}
              </option>
            ))}
          </select>

          <label className={`${CASE} mb-3`}>
            <input
              type="checkbox"
              checked={Boolean(carte?.centrer)}
              onChange={(e) => majCarte({ centrer: e.target.checked })}
            />
            Centrer le titre et le texte
          </label>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <Opacite
              id="o-entete"
              label="Opacité en-tête"
              valeur={carte?.enteteOpacite}
              onChange={(v) => majCarte({ enteteOpacite: v })}
            />
            <Opacite
              id="o-pied"
              label="Opacité pied"
              valeur={carte?.piedOpacite}
              onChange={(v) => majCarte({ piedOpacite: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Couleur
              label="Titre"
              valeur={carte?.couleurTitre}
              defaut={theme.encre}
              onChange={(v) => majCarte({ couleurTitre: v })}
            />
            <Couleur
              label="Texte"
              valeur={carte?.couleurCorps}
              defaut="#BBBBBB"
              onChange={(v) => majCarte({ couleurCorps: v })}
            />
            <Couleur
              label="Ambre"
              valeur={carte?.couleurAccent}
              defaut={theme.accent}
              onChange={(v) => majCarte({ couleurAccent: v })}
            />
            <Couleur
              label="Fond"
              valeur={carte?.couleurFond}
              defaut={theme.fond}
              onChange={(v) => majCarte({ couleurFond: v })}
            />
            <Couleur
              label="Logo"
              valeur={carte?.couleurLogo}
              defaut={theme.encre}
              onChange={(v) => majCarte({ couleurLogo: v })}
            />
          </div>
        </Section>

        {/* ---- la trace (optionnelle) ---- */}
        <Section titre="La trace" ouvert={!trace}>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={chargerAventure}
              className={BOUTON_SECOND}
            >
              <MapIcon size={16} aria-hidden />
              {liveConfig.aventure.nom}
            </button>
            <label className={`${BOUTON_SECOND} cursor-pointer`}>
              <Route size={16} aria-hidden />
              Un ou plusieurs .gpx
              <input
                type="file"
                multiple
                accept=".gpx,.json,application/gpx+xml,application/json"
                onChange={chargerFichierTrace}
                className="sr-only"
              />
            </label>
          </div>
          {/* LE CADRAGE, séparément. Elle n'est jamais dessinée : elle sert à
              figer la carte et le profil pendant qu'on révèle l'itinéraire. */}
          <p className={`${LEGENDE} mt-4`}>Trace de référence (cadrage)</p>
          <label className={`${BOUTON_SECOND} w-full cursor-pointer`}>
            <Route size={16} aria-hidden />
            {traceCadre
              ? `${Math.round(traceCadre.totalKm)} km — cadre figé`
              : "Aucune"}
            <input
              type="file"
              multiple
              accept=".gpx,.json,application/gpx+xml,application/json"
              onChange={chargerReference}
              className="sr-only"
            />
          </label>
          {traceCadre && (
            <button
              type="button"
              onClick={() => setTraceCadre(null)}
              className="mt-1 font-heading text-[12px] text-brand-text/50 underline"
            >
              retirer la référence
            </button>
          )}
          <p className="mt-1 font-heading text-[12px] text-brand-text/45">
            Jamais dessinée. Elle fixe le cadre de la carte et l&rsquo;échelle
            du profil, pour qu&rsquo;une série J1, J1+J2, J1+J2+J3… ne saute pas
            d&rsquo;une planche à l&rsquo;autre.
          </p>

          {trace ? (
            <>
              <p className="mt-3 font-heading text-[13px] text-brand-text/60">
                {trace.totalKm.toFixed(1).replace(".", ",")} km · {trace.dPlusM}{" "}
                m D+
                {trace.coords.length === 0 &&
                  " · sans coordonnées (gabarit Carte indisponible)"}
              </p>
              {/* Ce réglage change les MOTS de tout le carrousel. */}
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
                  Trace horodatée ({dureeCourte(trace.dureeSecondes)}) —
                  l&rsquo;atelier a supposé « après ».
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 font-heading text-[13px] text-brand-text/55">
              Facultatif — seul le gabarit « Carte » en a besoin. Plusieurs
              fichiers d&rsquo;un coup sont recollés bout à bout, dans
              l&rsquo;ordre de leur nom, et chaque jonction devient une fin de
              journée.
            </p>
          )}
        </Section>

        {/* ---- le carrousel ---- */}
        <Section titre="Le carrousel" ouvert>
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
              disabled={etat.occupe}
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
        </Section>
      </div>
    </div>
  );
}
