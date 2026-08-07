// LES CARTES DE PARTAGE — maquette « carte topo » (Claude Design, août 2026).
//
// Une seule grammaire visuelle en trois formats :
//   story     1080×1920  partage en direct (Instagram / stories), automatique ;
//   carrousel 1080×1350  bilan a posteriori (publication 4:5), fabriqué à la
//                        main avec un encart de texte — voir og/cli.ts ;
//   og        1200×630   aperçu des liens (Open Graph), servi par le VPS.
//
// La carte est un FOND DE PAGE : tuiles Esri World Topo, itinéraire en
// pointillés fuchsia, trace vécue en trait plein, exactement comme la carte de
// /live — le partage doit ressembler à la page. Par-dessus, un voile sombre
// dégradé porte le texte en crème. Ambre pour tout ce qui est acquis (aire du
// profil, barre, chiffres), terracotta pour l'état (pastille, marqueur).
//
// Rien n'échoue faute de réseau : sans tuiles, le fond retombe sur un aplat
// sombre et la carte reste lisible.

import { basemapJpeg, dataUriJpeg, ATTRIBUTION, type BasemapOptions } from "./basemap";
import { fitView, type FitBox, type LonLat } from "./geo";
import { kmSurItineraire, type OgData } from "./data";
import { profilDataUri } from "./profil";
import { h, renderPng } from "./render";
import { traceSvgDataUri } from "./trace";

const CREME = "#FEFBF6";
const AMBRE = "#EFB159";
const TERRACOTTA = "#B67352";
const SOMBRE = "#22241E"; // repli quand aucune tuile n'arrive

const doux = (a: number) => `rgba(254,251,246,${a})`;

// Intl fr-FR groupe les milliers avec U+202F (espace fine insécable) : la fonte
// Ubuntu n'a pas ce glyphe → carré blanc dans satori (« 4□184 m »). On normalise
// en espace simple. Les échappements sont EXPLICITES : écrits littéralement,
// ces caractères sont invisibles dans le source et se perdent à la moindre
// normalisation d'éditeur — c'est exactement comme ça que le tofu est revenu.
const sansFines = (s: string) => s.replace(/[\u202F\u00A0\u2009\u2007]/g, " ");
const kmFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entierFmt = new Intl.NumberFormat("fr-FR");
const KM = (n: number) => sansFines(kmFmt.format(n));
const ENTIER = (n: number) => sansFines(entierFmt.format(Math.round(n)));

const jourMoisFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "long",
});

/** « Départ le 20 août » — `null` si la date n'est pas exploitable. */
export function departLe(dateDebutISO: string): string | null {
  const t = Date.parse(dateDebutISO);
  if (!Number.isFinite(t)) return null;
  return `Départ le ${sansFines(jourMoisFmt.format(new Date(t)))}`;
}

/** « 7 h 45 » — la durée telle qu'on la dit, pas telle qu'un chrono l'affiche. */
export function dureeCourte(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const heures = Math.floor(total / 60);
  const minutes = total % 60;
  return heures > 0 ? `${heures} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

export type CarteFormat = "story" | "carrousel" | "og";

interface Gabarit {
  width: number;
  height: number;
  pad: number;
  /** Fenêtre de cadrage de l'itinéraire sur le canevas. */
  fit: FitBox;
  /** Fenêtre réduite quand l'encart de texte occupe la droite (carrousel). */
  fitAvecEncart?: FitBox;
  colonne: { bottom: number; right?: number };
  /** Ordonnée de la ligne « THE LOCOMOTION LAB » + pastille du jour. */
  headerTop: number;
  marque: number;
  badge: number;
  titre: number;
  chiffre: number;
  unite: number;
  valeur: number;
  libelle: number;
  profilH: number | null;
  barre: number;
  pied: number;
  credit: number;
}

export const GABARITS: Record<CarteFormat, Gabarit> = {
  story: {
    width: 1080,
    height: 1920,
    pad: 72,
    fit: { x: 96, y: 200, width: 888, height: 800 },
    colonne: { bottom: 100 },
    headerTop: 142,
    marque: 22,
    badge: 24,
    titre: 82,
    chiffre: 118,
    unite: 38,
    valeur: 46,
    libelle: 23,
    profilH: 190,
    barre: 9,
    pied: 24,
    credit: 18,
  },
  carrousel: {
    width: 1080,
    height: 1350,
    pad: 72,
    // L'itinéraire commence SOUS la ligne de marque : au premier essai le
    // marqueur de position se posait en plein milieu de « THE LOCOMOTION LAB ».
    fit: { x: 96, y: 178, width: 888, height: 352 },
    fitAvecEncart: { x: 96, y: 178, width: 528, height: 352 },
    colonne: { bottom: 92 },
    headerTop: 104,
    marque: 22,
    badge: 24,
    titre: 76,
    chiffre: 112,
    unite: 36,
    valeur: 44,
    libelle: 23,
    profilH: 178,
    barre: 9,
    pied: 24,
    credit: 18,
  },
  og: {
    // Format court : la colonne de texte tient à GAUCHE et l'itinéraire se cadre
    // à droite. Pas de profil altimétrique — à la taille d'un aperçu de lien
    // (souvent 300 px de large), une silhouette de 110 px n'est plus lisible.
    width: 1200,
    height: 630,
    pad: 64,
    fit: { x: 660, y: 92, width: 470, height: 450 },
    colonne: { bottom: 84, right: 560 },
    headerTop: 46,
    marque: 18,
    badge: 18,
    titre: 56,
    chiffre: 82,
    unite: 27,
    valeur: 34,
    libelle: 18,
    profilH: null,
    barre: 8,
    pied: 19,
    credit: 14,
  },
};

/* ---------------------------------------------------------------- primitives */

function marqueRow(size: number) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        fontFamily: "Ubuntu",
        fontWeight: 500,
        fontSize: `${size}px`,
        letterSpacing: "0.3em",
        color: doux(0.86),
      },
    },
    "THE LOCOMOTION LAB",
  );
}

function pilule(texte: string, size: number) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        padding: `${Math.round(size * 0.42)}px ${Math.round(size * 1.05)}px`,
        borderRadius: "999px",
        border: `2px solid ${doux(0.5)}`,
        fontFamily: "Ubuntu",
        fontWeight: 500,
        fontSize: `${size}px`,
        letterSpacing: "0.18em",
        color: doux(0.9),
      },
    },
    texte,
  );
}

function pastille(texte: string, size: number, options: { point?: boolean } = {}) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        // Sans `alignSelf`, la pastille hérite du `stretch` de la colonne et
        // s'étire sur toute la largeur de la carte.
        alignSelf: "flex-start",
        alignItems: "center",
        gap: `${Math.round(size * 0.42)}px`,
        padding: `${Math.round(size * 0.44)}px ${Math.round(size * 1.05)}px`,
        borderRadius: "999px",
        background: TERRACOTTA,
        color: CREME,
        fontFamily: "Ubuntu",
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: "0.14em",
      },
    },
    options.point
      ? h("div", {
          style: {
            width: `${Math.round(size * 0.42)}px`,
            height: `${Math.round(size * 0.42)}px`,
            borderRadius: "50%",
            background: CREME,
          },
        })
      : null,
    texte,
  );
}

function barreProgression(percent: number, hauteur: number) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        height: `${hauteur}px`,
        borderRadius: `${hauteur}px`,
        background: doux(0.22),
        overflow: "hidden",
      },
    },
    h("div", {
      style: {
        height: "100%",
        width: `${Math.max(0, Math.min(100, percent))}%`,
        borderRadius: `${hauteur}px`,
        background: AMBRE,
      },
    }),
  );
}

/** Deux textes aux extrémités d'une même ligne — le motif de toute la carte. */
function ligneDeuxBouts(
  gauche: unknown,
  droite: unknown,
  style: Record<string, unknown> = {},
) {
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", ...style } },
    gauche,
    droite ?? h("div", { style: { display: "flex" } }),
  );
}

function petitTexte(texte: string, size: number, couleur: string, espacement = "0.16em") {
  return h(
    "div",
    {
      style: {
        display: "flex",
        fontFamily: "Ubuntu",
        fontWeight: 500,
        fontSize: `${size}px`,
        letterSpacing: espacement,
        color: couleur,
      },
    },
    texte,
  );
}

/* ------------------------------------------------------------------- contenu */

/** Ce que chaque format affiche : dépend de la variante ET de l'a-posteriori. */
interface Contenu {
  badge: { texte: string; point: boolean };
  titre: string;
  chiffre: string;
  unite: string;
  valeur: string | null;
  libelleDroite: string | null;
  piedGauche: string;
  percent: number;
  /** Kilomètre de l'itinéraire atteint — pilote le curseur du profil. */
  doneKm: number;
  jour: string | null;
}

function contenu(data: OgData, format: CarteFormat): Contenu {
  const { aventure, live } = data;
  const totalKm = aventure.distanceKm || data.track?.totalKm || 0;
  const deniveleM = aventure.deniveleM || data.track?.dPlusM || 0;
  const piedGauche = [totalKm > 0 ? `${ENTIER(totalKm)} km` : "", deniveleM > 0 ? `${ENTIER(deniveleM)} m D+` : ""]
    .filter(Boolean)
    .join(" · ");
  const doneKm = kmSurItineraire(live);
  const percent = live?.pourcent ?? (totalKm > 0 ? Math.min(100, (doneKm / totalKm) * 100) : 0);
  const dplusDmoins =
    live && (live.dplus > 0 || live.dminus > 0)
      ? `D+ ${ENTIER(live.dplus)} m · D− ${ENTIER(live.dminus)} m`
      : null;

  // Carrousel = bilan. Plus de pastille « EN DIRECT » ni de pourcentage : ce
  // qu'on regarde après coup, c'est ce qui a été fait — distance et durée.
  if (format === "carrousel") {
    return {
      badge: {
        texte: (data.jour ? `Jour ${data.jour}` : aventure.dates || "Aventure bouclée").toUpperCase(),
        point: false,
      },
      titre: aventure.nom,
      chiffre: KM(live?.doneKm ?? 0),
      unite: "km parcourus",
      valeur: live && live.durationSeconds > 0 ? dureeCourte(live.durationSeconds) : null,
      libelleDroite: dplusDmoins,
      piedGauche,
      percent: 100,
      doneKm: data.track?.totalKm ?? doneKm,
      jour: null,
    };
  }

  if (data.variant === "live") {
    return {
      badge: { texte: "EN DIRECT", point: true },
      titre: aventure.nom,
      chiffre: KM(live?.doneKm ?? 0),
      unite: "km parcourus",
      valeur: `${KM(percent)} %`,
      libelleDroite: dplusDmoins,
      piedGauche,
      percent,
      doneKm,
      jour: data.jour ? `JOUR ${data.jour}` : null,
    };
  }

  if (data.variant === "termine") {
    return {
      badge: { texte: "TERMINÉ", point: false },
      titre: aventure.nom,
      chiffre: KM(live?.doneKm ?? totalKm),
      unite: "km parcourus",
      valeur: live && live.durationSeconds > 0 ? dureeCourte(live.durationSeconds) : null,
      libelleDroite: dplusDmoins,
      piedGauche,
      percent: 100,
      doneKm: data.track?.totalKm ?? doneKm,
      jour: null,
    };
  }

  // Avant le départ : rien n'est parcouru, la carte annonce l'itinéraire.
  return {
    badge: { texte: "PROCHAIN DÉPART", point: false },
    titre: aventure.nom,
    chiffre: totalKm > 0 ? ENTIER(totalKm) : "—",
    unite: "km à parcourir",
    valeur: deniveleM > 0 ? `${ENTIER(deniveleM)} m D+` : null,
    libelleDroite: aventure.dates ? aventure.dates.toUpperCase() : null,
    // Le pied REPREND l'itinéraire (les dates sont déjà à côté du profil) :
    // laisser le coin vide déséquilibrait visiblement le bas de la carte.
    piedGauche: departLe(aventure.dateDebut) ?? piedGauche,
    percent: 0,
    doneKm: 0,
    jour: null,
  };
}

/* --------------------------------------------------------------------- fond */

interface Fond {
  carte: string | null;
  trace: string | null;
}

async function fond(
  data: OgData,
  gabarit: Gabarit,
  fit: FitBox,
  options: CarteOptions,
): Promise<Fond> {
  const reference = data.track?.coords ?? [];
  const vecu = data.live?.coords ?? [];
  // Le cadrage se fait sur l'ITINÉRAIRE, pas sur le vécu : le fond doit être le
  // même du départ à l'arrivée (sinon il n'est plus jamais servi par le cache).
  const aCadrer: LonLat[] = reference.length > 1 ? reference : vecu;
  const view = fitView(aCadrer, {
    width: gabarit.width,
    height: gabarit.height,
    fit,
    maxZoom: options.maxZoom ?? 15,
  });
  if (!view) return { carte: null, trace: null };

  const tuiles = options.sansFond ? null : await basemapJpeg(view, options.basemap ?? {});
  const marqueur = vecu.length > 0 ? vecu[vecu.length - 1] : (reference[0] ?? null);
  return {
    carte: tuiles ? dataUriJpeg(tuiles) : null,
    trace: traceSvgDataUri(view, { reference, done: vecu, marker: marqueur }),
  };
}

function voile(gabarit: Gabarit, format: CarteFormat) {
  // Deux couches : un voile uniforme qui calme la carte partout (le nom du labo
  // se lit en haut), puis un dégradé qui va chercher le noir sous le texte.
  // Les paliers sont RAPPROCHÉS exprès : à trois arrêts, la transition se voyait
  // comme une bande horizontale en travers du relief.
  const degrade =
    format === "og"
      ? "linear-gradient(90deg, rgba(16,18,14,0.80) 0%, rgba(16,18,14,0.74) 30%, rgba(16,18,14,0.56) 46%, rgba(16,18,14,0.32) 58%, rgba(16,18,14,0.12) 70%, rgba(16,18,14,0) 84%)"
      : "linear-gradient(180deg, rgba(16,18,14,0) 26%, rgba(16,18,14,0.12) 38%, rgba(16,18,14,0.32) 46%, rgba(16,18,14,0.50) 53%, rgba(16,18,14,0.60) 60%, rgba(16,18,14,0.66) 70%, rgba(16,18,14,0.66) 100%)";
  return [
    h("div", {
      style: {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${gabarit.width}px`,
        height: `${gabarit.height}px`,
        background: "rgba(24,26,20,0.32)",
      },
    }),
    h("div", {
      style: {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${gabarit.width}px`,
        height: `${gabarit.height}px`,
        background: degrade,
      },
    }),
  ];
}

function encart(texte: string, gabarit: Gabarit) {
  return h(
    "div",
    {
      style: {
        position: "absolute",
        right: `${gabarit.pad}px`,
        top: "196px",
        width: "340px",
        display: "flex",
        flexDirection: "column",
        padding: "28px 30px",
        borderRadius: "26px",
        border: `3px solid ${doux(0.72)}`,
        background: "rgba(18,20,16,0.58)",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          fontFamily: "Ubuntu",
          fontSize: "27px",
          lineHeight: 1.45,
          color: doux(0.94),
        },
      },
      texte,
    ),
  );
}

/* --------------------------------------------------------------------- carte */

export interface CarteOptions {
  format: CarteFormat;
  basemap?: BasemapOptions;
  /** Saute le téléchargement des tuiles (tests, rendu hors ligne). */
  sansFond?: boolean;
  maxZoom?: number;
}

/**
 * Construit l'arbre satori d'une carte. Asynchrone parce que le fond de carte
 * se télécharge (et se met en cache) — le reste est purement déterministe.
 */
export async function carteDePartage(data: OgData, options: CarteOptions) {
  const format = options.format;
  const g = GABARITS[format];
  const c = contenu(data, format);
  const note = format === "carrousel" ? (data.note ?? null) : null;
  const fit = note && g.fitAvecEncart ? g.fitAvecEncart : g.fit;
  const { carte, trace } = await fond(data, g, fit, options);

  const profil =
    g.profilH && data.track
      ? profilDataUri(data.track.profile, {
          doneKm: c.doneKm,
          totalKm: data.track.totalKm,
          curseur: data.variant === "live" && format !== "carrousel",
        })
      : null;

  const colonne: unknown[] = [
    pastille(c.badge.texte, g.badge, { point: c.badge.point }),
    h(
      "div",
      {
        style: {
          display: "flex",
          fontFamily: "Ubuntu",
          fontWeight: 700,
          fontSize: `${g.titre}px`,
          lineHeight: 1.08,
          color: CREME,
          marginTop: `${Math.round(g.titre * 0.38)}px`,
        },
      },
      c.titre,
    ),
    // Alignement sur la LIGNE DE BASE : `alignItems: "baseline"` de satori
    // retombe sur le bas de la boîte de ligne, ce qui fait plonger « km
    // parcourus » sous la virgule du grand chiffre. On aligne donc par le bas,
    // en relevant les petits textes d'un décalage proportionnel au chiffre.
    ligneDeuxBouts(
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "flex-end",
            gap: `${Math.round(g.unite * 0.4)}px`,
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: "Ubuntu",
              fontWeight: 700,
              fontSize: `${g.chiffre}px`,
              lineHeight: 1,
              color: CREME,
            },
          },
          c.chiffre,
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: "Ubuntu",
              fontSize: `${g.unite}px`,
              lineHeight: 1,
              paddingBottom: `${Math.round(g.chiffre * 0.045)}px`,
              color: doux(0.82),
            },
          },
          c.unite,
        ),
      ),
      c.valeur
        ? h(
            "div",
            {
              style: {
                display: "flex",
                fontFamily: "Ubuntu",
                fontWeight: 700,
                fontSize: `${g.valeur}px`,
                lineHeight: 1,
                paddingBottom: `${Math.round(g.chiffre * 0.045)}px`,
                color: AMBRE,
              },
            },
            c.valeur,
          )
        : null,
      { alignItems: "flex-end", marginTop: `${Math.round(g.chiffre * 0.24)}px` },
    ),
  ];

  if (profil) {
    colonne.push(
      ligneDeuxBouts(
        petitTexte("PROFIL", g.libelle, doux(0.55)),
        c.libelleDroite ? petitTexte(c.libelleDroite, g.libelle, AMBRE, "0.1em") : null,
        { marginTop: `${Math.round(g.libelle * 1.2)}px` },
      ),
      h("img", {
        src: profil,
        width: g.width - 2 * g.pad,
        height: g.profilH as number,
        style: { marginTop: "10px", width: `${g.width - 2 * g.pad}px`, height: `${g.profilH}px` },
      }),
    );
  } else if (c.libelleDroite) {
    colonne.push(
      ligneDeuxBouts(petitTexte(c.libelleDroite, g.libelle, AMBRE, "0.1em"), null, {
        marginTop: `${Math.round(g.libelle * 1.2)}px`,
      }),
    );
  }

  colonne.push(
    h("div", { style: { display: "flex", flexDirection: "column", marginTop: "12px" } }, barreProgression(c.percent, g.barre)),
    ligneDeuxBouts(
      petitTexte(c.piedGauche, g.pied, doux(0.66), "0.04em"),
      petitTexte("thelocomotionlab.com/live", g.pied, doux(0.66), "0.04em"),
      { marginTop: `${Math.round(g.pied * 1.05)}px` },
    ),
  );

  return h(
    "div",
    {
      style: {
        width: `${g.width}px`,
        height: `${g.height}px`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: SOMBRE,
        fontFamily: "Ubuntu",
      },
    },
    carte
      ? h("img", {
          src: carte,
          width: g.width,
          height: g.height,
          style: { position: "absolute", left: "0px", top: "0px", width: `${g.width}px`, height: `${g.height}px` },
        })
      : null,
    trace
      ? h("img", {
          src: trace,
          width: g.width,
          height: g.height,
          style: { position: "absolute", left: "0px", top: "0px", width: `${g.width}px`, height: `${g.height}px` },
        })
      : null,
    ...voile(g, format),
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: `${g.pad}px`,
          right: `${g.pad}px`,
          top: `${g.headerTop}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      marqueRow(g.marque),
      c.jour ? pilule(c.jour, g.marque) : h("div", { style: { display: "flex" } }),
    ),
    note ? encart(note, g) : null,
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: `${g.pad}px`,
          right: `${g.colonne.right ?? g.pad}px`,
          bottom: `${g.colonne.bottom}px`,
          display: "flex",
          flexDirection: "column",
        },
      },
      ...colonne,
    ),
    // L'attribution n'a de sens QUE s'il y a un fond : sur le repli sombre,
    // créditer une carte absente serait faux.
    carte
      ? h(
          "div",
          {
            style: {
              position: "absolute",
              left: `${g.pad}px`,
              bottom: `${Math.round(g.credit * 1.9)}px`,
              display: "flex",
              fontFamily: "Ubuntu",
              fontSize: `${g.credit}px`,
              letterSpacing: "0.08em",
              color: doux(0.38),
            },
          },
          ATTRIBUTION,
        )
      : null,
  );
}

/** Raccourci : arbre satori → PNG aux dimensions du gabarit. */
export async function rendreCarte(data: OgData, options: CarteOptions): Promise<Buffer> {
  const g = GABARITS[options.format];
  return renderPng(await carteDePartage(data, options), g.width, g.height);
}

/**
 * Prépare (et met en cache) le fond de carte d'un format SANS rasteriser la
 * carte. Le cadrage — donc la clé de cache — diffère d'un format à l'autre :
 * sans ce préchauffage, le premier appui sur « Partager l'aventure » attendrait
 * le téléchargement d'une soixantaine de tuiles.
 */
export async function prechaufferFond(data: OgData, options: CarteOptions): Promise<boolean> {
  const g = GABARITS[options.format];
  const avecEncart = options.format === "carrousel" && data.note && g.fitAvecEncart;
  const { carte } = await fond(data, g, avecEncart ? (g.fitAvecEncart as FitBox) : g.fit, options);
  return carte !== null;
}
