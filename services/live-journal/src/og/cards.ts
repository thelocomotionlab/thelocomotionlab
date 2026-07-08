// Les cartes de partage (design 2f, styles exacts) : OG 1200×630 et story
// 1080×1920, chacune en trois variantes (live / avant / terminé — les deux
// dernières sobres, même grammaire, non maquettées : décision PR4 §3).
// La silhouette du profil est un petit SVG embarqué en data URI (satori
// rend les <img>) — même géométrie que le profil du site (1000×180).

import { h } from "./render";
import type { OgData } from "./data";

const CREME = "#FEFBF6";
const ENCRE = "#333333";
const TERRACOTTA = "#B67352";
const BRUN = "#9A6044";
const SAUGE = "#8CB9BD";
const SAUGE_FONCE = "#6E9CA0";

// Intl fr-FR groupe les milliers avec U+202F (espace fine insécable) : la fonte
// Ubuntu n'a pas ce glyphe → tofu dans satori. On normalise en espace simple.
const sansFines = (s: string) => s.replace(/[  ]/g, " ");
const kmFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const entierFmt = new Intl.NumberFormat("fr-FR");
const KM = { format: (n: number) => sansFines(kmFmt.format(n)) };
const PCT = KM;
const ENTIER = { format: (n: number) => sansFines(entierFmt.format(n)) };

/** SVG silhouette du profil (aires couverte/restante + ligne + marqueur) en data URI. */
function profileDataUri(data: OgData, options: { coverOverrideKm?: number } = {}): string | null {
  const track = data.track;
  if (!track) return null;
  const W = 1000;
  const H = 180;
  const TOP = 12;
  const BASE = 156;
  const alts = track.profile.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const x = (km: number) => ((km / track.totalKm) * W).toFixed(1);
  const y = (alt: number) => (TOP + (1 - (alt - min) / Math.max(1, max - min)) * (BASE - TOP)).toFixed(1);

  const doneKm = options.coverOverrideKm ?? data.live?.doneKm ?? 0;
  const all = track.profile.map((p) => `${x(p.km)} ${y(p.alt)}`);
  const covered = track.profile.filter((p) => p.km <= doneKm);
  const cov = covered.map((p) => `${x(p.km)} ${y(p.alt)}`);

  let paths = `<path d="M 0 ${BASE} L ${all.join(" L ")} L ${W} ${BASE} Z" fill="rgba(154,96,68,0.12)"/>`;
  if (cov.length > 1) {
    paths += `<path d="M 0 ${BASE} L ${cov.join(" L ")} L ${x(covered[covered.length - 1].km)} ${BASE} Z" fill="rgba(239,177,89,0.45)"/>`;
  }
  paths += `<path d="M ${all.join(" L ")}" fill="none" stroke="${BRUN}" stroke-width="2" stroke-linejoin="round"/>`;
  if (doneKm > 0 && cov.length > 0) {
    const last = covered[covered.length - 1];
    paths += `<circle cx="${x(last.km)}" cy="${y(last.alt)}" r="8" fill="${TERRACOTTA}" stroke="${CREME}" stroke-width="3"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${paths}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function logoRow(size: number, fontSize: number) {
  const ring = Math.round(size * 0.43);
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: `${Math.round(size * 0.32)}px` } },
    h(
      "div",
      {
        style: {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${Math.round(size * 0.27)}px`,
          background: SAUGE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      h("div", {
        style: {
          width: `${ring}px`,
          height: `${ring}px`,
          border: `3px solid ${CREME}`,
          borderRadius: "50%",
          borderRightColor: "transparent",
          transform: "rotate(-30deg)",
        },
      }),
    ),
    h("span", { style: { fontFamily: "Ubuntu", fontWeight: 500, fontSize: `${fontSize}px`, color: ENCRE } }, "The Locomotion Lab"),
  );
}

function badge(text: string, opts: { background: string; color: string; fontSize: number; dot?: boolean }) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: `${Math.round(opts.fontSize * 0.55)}px ${Math.round(opts.fontSize * 1.2)}px`,
        borderRadius: "32px",
        background: opts.background,
        color: opts.color,
        fontFamily: "Ubuntu",
        fontSize: `${opts.fontSize}px`,
        fontWeight: 700,
        letterSpacing: "0.1em",
      },
    },
    opts.dot
      ? h("div", {
          style: {
            width: `${Math.round(opts.fontSize * 0.62)}px`,
            height: `${Math.round(opts.fontSize * 0.62)}px`,
            borderRadius: "50%",
            background: opts.color,
          },
        })
      : null,
    text,
  );
}

function variantBadge(data: OgData, fontSize: number) {
  if (data.variant === "live") {
    return badge("EN DIRECT", { background: TERRACOTTA, color: CREME, fontSize, dot: true });
  }
  if (data.variant === "termine") {
    return badge("TERMINÉ", { background: "rgba(110,156,160,0.2)", color: SAUGE_FONCE, fontSize });
  }
  return badge("PROCHAIN DÉPART", { background: "rgba(140,185,189,0.22)", color: SAUGE_FONCE, fontSize });
}

function progressBar(percent: number, height: number, maxWidth?: number) {
  return h(
    "div",
    {
      style: {
        height: `${height}px`,
        borderRadius: `${height}px`,
        background: "rgba(51,51,51,0.08)",
        display: "flex",
        overflow: "hidden",
        ...(maxWidth ? { maxWidth: `${maxWidth}px` } : {}),
      },
    },
    h("div", {
      style: {
        height: "100%",
        width: `${Math.min(100, percent)}%`,
        borderRadius: `${height}px`,
        background: "linear-gradient(90deg, #EFB159, #D89A3D)",
      },
    }),
  );
}

/** Sous-ligne de l'OG selon la variante : progression + dernière étape, ou dates. */
function ogSubline(data: OgData) {
  const style = {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    marginTop: "20px",
    fontFamily: "Ubuntu",
    fontSize: "24px",
    color: "rgba(51,51,51,0.7)",
  };
  if (data.variant === "live" && data.live) {
    const children = [
      h(
        "span",
        { style: { display: "flex", gap: "7px" } },
        h("span", { style: { color: ENCRE, fontWeight: 700 } }, KM.format(data.live.doneKm)),
        ` / ${data.aventure.distanceKm} km`,
      ),
    ];
    if (data.lastWaypoint) {
      children.push(h("span", { style: { color: "rgba(51,51,51,0.3)" } }, "·"));
      children.push(
        h(
          "span",
          { style: { display: "flex", gap: "7px" } },
          "Dernière étape — ",
          h(
            "span",
            { style: { color: ENCRE, fontWeight: 700 } },
            data.lastWaypoint.nom +
              (data.lastWaypoint.altitude ? ` (${ENTIER.format(data.lastWaypoint.altitude)} m)` : ""),
          ),
        ),
      );
    }
    return h("div", { style }, ...children);
  }
  const infos = [data.aventure.dates, `${data.aventure.distanceKm} km`, `${ENTIER.format(data.aventure.deniveleM)} m D+`]
    .filter(Boolean)
    .join(" · ");
  return h(
    "div",
    { style },
    data.variant === "termine" ? `Aventure bouclée · ${infos}` : infos,
  );
}

/** Couverture de la silhouette selon la variante : jamais avant le départ,
 *  totale une fois bouclée, vécue pendant le direct. */
function coverForVariant(data: OgData): { coverOverrideKm?: number } {
  if (data.variant === "avant") return { coverOverrideKm: 0 };
  if (data.variant === "termine") return { coverOverrideKm: data.track?.totalKm };
  return {};
}

/** OG 1200×630 — maquette 2f (live) et variantes sobres. */
export function ogCard(data: OgData) {
  const percent =
    data.aventure.distanceKm > 0 && data.live
      ? (data.live.doneKm / data.aventure.distanceKm) * 100
      : 0;
  const profile = profileDataUri(data, coverForVariant(data));

  return h(
    "div",
    {
      style: {
        width: "1200px",
        height: "630px",
        background: CREME,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Ubuntu",
      },
    },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", padding: "56px 64px 0", flexGrow: 1 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        logoRow(44, 20),
        variantBadge(data, 17),
      ),
      h(
        "h2",
        {
          style: {
            fontFamily: "Ubuntu",
            fontWeight: 700,
            fontSize: "58px",
            lineHeight: 1.08,
            color: ENCRE,
            margin: "44px 0 0",
            maxWidth: "900px",
          },
        },
        data.aventure.nom,
      ),
      ogSubline(data),
      data.variant === "live" ? h("div", { style: { marginTop: "26px", display: "flex", flexDirection: "column" } }, progressBar(percent, 14, 900)) : null,
    ),
    profile
      ? h("img", {
          src: profile,
          width: 1200,
          height: 190,
          style: { position: "absolute", left: "0px", bottom: "0px", width: "1200px", height: "190px" },
        })
      : null,
    h(
      "div",
      {
        style: {
          position: "absolute",
          right: "64px",
          bottom: "24px",
          fontFamily: "Ubuntu",
          fontSize: "17px",
          fontWeight: 500,
          color: "rgba(51,51,51,0.6)",
        },
      },
      "thelocomotionlab.com/live",
    ),
  );
}

/** Story 1080×1920 — contenu critique dans la bande centrale (maquette 2f). */
export function storyCard(data: OgData) {
  const percent =
    data.aventure.distanceKm > 0 && data.live
      ? (data.live.doneKm / data.aventure.distanceKm) * 100
      : 0;
  const restantKm = data.live ? Math.max(0, data.aventure.distanceKm - data.live.doneKm) : 0;
  const profile = profileDataUri(data, coverForVariant(data));

  const statsLine = [
    `${data.aventure.distanceKm} km`,
    `${ENTIER.format(data.aventure.deniveleM)} m D+`,
    data.variant === "live" && data.jour ? `Jour ${data.jour}` : data.aventure.dates,
  ]
    .filter(Boolean)
    .join(" · ");

  return h(
    "div",
    {
      style: {
        width: "1080px",
        height: "1920px",
        background: CREME,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Ubuntu",
      },
    },
    h("div", { style: { position: "absolute", left: "72px", top: "110px", display: "flex" } }, logoRow(56, 26)),
    h(
      "div",
      { style: { position: "absolute", left: "72px", right: "72px", top: "250px", display: "flex", flexDirection: "column", alignItems: "flex-start" } },
      variantBadge(data, 22),
      h(
        "h2",
        { style: { fontFamily: "Ubuntu", fontWeight: 700, fontSize: "88px", lineHeight: 1.05, color: ENCRE, margin: "44px 0 0" } },
        data.aventure.nom,
      ),
      h("div", { style: { fontFamily: "Ubuntu", fontSize: "32px", color: "rgba(51,51,51,0.7)", marginTop: "28px" } }, statsLine),
    ),
    data.variant === "live" && data.live
      ? h(
          "div",
          { style: { position: "absolute", left: "72px", right: "72px", top: "760px", display: "flex", flexDirection: "column" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "baseline", gap: "12px" } },
            h("div", { style: { fontFamily: "Ubuntu", fontWeight: 700, fontSize: "150px", lineHeight: 0.9, color: ENCRE } }, PCT.format(percent)),
            h("div", { style: { fontFamily: "Ubuntu", fontSize: "56px", fontWeight: 500, color: BRUN } }, "%"),
          ),
          h("div", { style: { marginTop: "40px", display: "flex", flexDirection: "column" } }, progressBar(percent, 22)),
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", marginTop: "18px", fontFamily: "Ubuntu", fontSize: "26px", color: "rgba(51,51,51,0.65)" } },
            h("span", {}, `${KM.format(data.live.doneKm)} km parcourus`),
            h("span", {}, `${KM.format(restantKm)} km restants`),
          ),
          data.lastWaypoint
            ? h(
                "div",
                { style: { display: "flex", flexDirection: "column" } },
                h("div", { style: { marginTop: "70px", fontFamily: "Ubuntu", fontSize: "26px", color: "rgba(51,51,51,0.7)" } }, "Dernière étape franchie"),
                h(
                  "div",
                  { style: { fontFamily: "Ubuntu", fontWeight: 700, fontSize: "44px", color: ENCRE, marginTop: "10px" } },
                  data.lastWaypoint.nom +
                    (data.lastWaypoint.altitude ? ` — ${ENTIER.format(data.lastWaypoint.altitude)} m` : ""),
                ),
              )
            : null,
        )
      : null,
    profile
      ? h("img", {
          src: profile,
          width: 1080,
          height: 300,
          style: { position: "absolute", left: "0px", bottom: "120px", width: "1080px", height: "300px" },
        })
      : null,
    h(
      "div",
      {
        style: {
          position: "absolute",
          left: "0px",
          right: "0px",
          bottom: "44px",
          display: "flex",
          justifyContent: "center",
          fontFamily: "Ubuntu",
          fontSize: "26px",
          fontWeight: 500,
          color: "rgba(51,51,51,0.6)",
        },
      },
      "thelocomotionlab.com/live",
    ),
  );
}
