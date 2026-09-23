// components/twin/ProfilAltimetrique.jsx
//
// LE PROFIL D'UNE COURSE, calculé depuis sa trace — jamais dessiné à la main.
//
// Trois usages, un seul dessin : l'éditeur y pose et y déplace les ravitaillements et
// les phases, l'écran Plan et la page de l'athlète y lisent la nuit. Le trait et l'aire
// sont en SVG étiré au cadre ; les marqueurs sont posés PAR-DESSUS en HTML, pour qu'un
// cercle reste un cercle quelle que soit la largeur de l'écran.
//
// Les couleurs sont celles de la charte, par leurs classes : aucune valeur en dur.

"use client";

import { useRef, useState } from "react";

import { echelleDuProfil, nombre } from "@/lib/twinTableauDeBord.mjs";

const LARGEUR = 1000;

/** Le kilomètre sous un point de l'écran. */
function kmSous(evenement, cadre, kmMax) {
  const rect = cadre.getBoundingClientRect();
  const part = (evenement.clientX - rect.left) / (rect.width || 1);
  return Math.max(0, Math.min(1, part)) * kmMax;
}

/**
 * - `profil` : couples [km, altitude] rendus par le moteur ;
 * - `marqueurs` : `{ cle, km, libelle, actif, assistance, base, numero }` — un clic appelle
 *   `surChoix(cle)`, un glisser `surDeplacement(cle, km)` ; `numero` s'écrit au-dessus du
 *   point, là où une base écrit son « B » ;
 * - `bandes` : `{ cle, du_km, au_km, ton: "nuit" | "phase", actif, libelle }` ;
 * - `surClic(km)` : un clic hors marqueur (poser un ravitaillement) ;
 * - `surGlisser(du, au)` : un glisser hors marqueur (poser une phase).
 */
export default function ProfilAltimetrique({
  profil,
  hauteur = 220,
  marqueurs = [],
  bandes = [],
  surChoix,
  surDeplacement,
  surClic,
  surGlisser,
  etiquettes = true,
  libelle = "Profil altimétrique du parcours",
}) {
  const cadre = useRef(null);
  const [glisse, setGlisse] = useState(null); // { type: "marqueur"|"bande", cle?, du, au }
  const e = echelleDuProfil(profil, { largeur: LARGEUR, hauteur: 300 });
  const pct = (km) => (e.x(km) / LARGEUR) * 100;
  const haut = (alt) => (e.y(alt) / 300) * 100;
  const interactif = Boolean(surClic || surGlisser || surDeplacement);

  const graduations = [];
  const pas = e.altMax - e.altMin > 1500 ? 1000 : e.altMax - e.altMin > 600 ? 500 : 100;
  for (let alt = Math.ceil(e.altMin / pas) * pas; alt <= e.altMax; alt += pas) {
    graduations.push(alt);
  }

  const fin = (evenement) => {
    if (!glisse) return;
    const km = kmSous(evenement, cadre.current, e.kmMax);
    if (glisse.type === "marqueur" && surDeplacement && glisse.bouge) {
      surDeplacement(glisse.cle, km);
    } else if (glisse.type === "fond") {
      const du = Math.min(glisse.du, km);
      const au = Math.max(glisse.du, km);
      if (surGlisser && au - du > e.kmMax / 200) surGlisser(du, au);
      else if (surClic) surClic(glisse.du);
    }
    setGlisse(null);
  };

  return (
    <div className="select-none">
      <div
        ref={cadre}
        className={`relative w-full ${interactif ? "cursor-crosshair" : ""}`}
        style={{ height: hauteur }}
        role={interactif ? "application" : "img"}
        aria-label={libelle}
        onPointerDown={(evenement) => {
          if (!interactif || evenement.target.dataset.marqueur) return;
          const km = kmSous(evenement, cadre.current, e.kmMax);
          evenement.currentTarget.setPointerCapture?.(evenement.pointerId);
          setGlisse({ type: "fond", du: km, au: km });
        }}
        onPointerMove={(evenement) => {
          if (!glisse) return;
          const km = kmSous(evenement, cadre.current, e.kmMax);
          setGlisse((g) => ({ ...g, au: km, bouge: true }));
        }}
        onPointerUp={fin}
        onPointerCancel={() => setGlisse(null)}
      >
        <svg
          viewBox={`0 0 ${LARGEUR} 300`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {graduations.map((alt) => (
            <line
              key={alt}
              x1="0"
              x2={LARGEUR}
              y1={e.y(alt)}
              y2={e.y(alt)}
              className="stroke-brand-hairline"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {bandes.map((b) => (
            <rect
              key={b.cle}
              x={e.x(b.du_km)}
              y="0"
              width={Math.max(0, e.x(b.au_km) - e.x(b.du_km))}
              height="300"
              className={
                b.ton === "nuit"
                  ? "fill-brand-primary/20"
                  : b.actif
                    ? "fill-brand-accent/25"
                    : "fill-brand-accent/10"
              }
            />
          ))}
          {glisse?.type === "fond" && glisse.bouge && surGlisser ? (
            <rect
              x={e.x(Math.min(glisse.du, glisse.au))}
              y="0"
              width={Math.abs(e.x(glisse.au) - e.x(glisse.du))}
              height="300"
              className="fill-brand-accent/20"
            />
          ) : null}
          <path d={e.aire} className="fill-brand-mist" />
          <path
            d={e.ligne}
            className="fill-none stroke-brand-slate"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {bandes
          .filter((b) => b.libelle)
          .map((b) => (
            <span
              key={`l-${b.cle}`}
              className="pointer-events-none absolute top-1 truncate px-1 text-xxs font-semibold uppercase tracking-etiquette text-brand-accent-ink"
              style={{ left: `${pct(b.du_km)}%`, maxWidth: `${pct(b.au_km) - pct(b.du_km)}%` }}
            >
              {b.libelle}
            </span>
          ))}

        {marqueurs.map((m) => {
          const km = glisse?.type === "marqueur" && glisse.cle === m.cle && glisse.bouge ? glisse.au : m.km;
          return (
            <button
              key={m.cle}
              type="button"
              data-marqueur="1"
              title={`${m.libelle} · km ${nombre(km, 1)}`}
              aria-label={`${m.libelle}, kilomètre ${nombre(km, 1)}`}
              aria-pressed={m.actif || undefined}
              onPointerDown={(evenement) => {
                evenement.stopPropagation();
                surChoix?.(m.cle);
                if (surDeplacement) {
                  cadre.current.setPointerCapture?.(evenement.pointerId);
                  setGlisse({ type: "marqueur", cle: m.cle, du: m.km, au: m.km });
                }
              }}
              onClick={(evenement) => evenement.stopPropagation()}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                m.actif
                  ? "z-10 h-3.5 w-3.5 border-brand-accent-ink bg-brand-accent"
                  : m.assistance
                    ? "h-2.5 w-2.5 border-brand-accent-ink bg-brand-paper"
                    : "h-2.5 w-2.5 border-brand-text bg-brand-paper"
              } ${surChoix ? "cursor-pointer" : "cursor-default"}`}
              style={{ left: `${pct(km)}%`, top: `${haut(e.altitudeA(km))}%` }}
            >
              {m.base ? (
                <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 text-xxs font-bold text-brand-deep">
                  B
                </span>
              ) : m.numero !== undefined && m.numero !== null ? (
                <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 text-xxs font-semibold tabular-nums text-brand-muted">
                  {m.numero}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {etiquettes && profil?.length ? (
        <div className="mt-1 flex justify-between text-xxs text-brand-muted">
          <span>0 km · {nombre(profil[0][1], 0)} m</span>
          <span className="hidden sm:inline">
            {nombre(e.altMin, 0)} – {nombre(e.altMax, 0)} m
          </span>
          <span>
            {nombre(e.kmMax, 1)} km · {nombre(profil[profil.length - 1][1], 0)} m
          </span>
        </div>
      ) : null}
    </div>
  );
}
