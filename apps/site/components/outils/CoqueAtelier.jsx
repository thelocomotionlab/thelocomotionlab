// components/outils/CoqueAtelier.jsx
//
// LA COQUE DES DEUX ATELIERS — la scène, le panneau, le rail. Rien d'autre.
//
// Elle existe pour UNE raison : sur un téléphone, les deux ateliers avaient la
// même ergonomie, et elle était mauvaise de la même façon. L'aperçu se COLLAIT
// en haut d'une page qui défile, avec sous lui le zoom, l'aide et la bande des
// vignettes — soit les deux tiers de l'écran figés. Il restait au panneau des
// réglages une bande de 150 px, qu'on atteignait en faisant défiler la page
// SOUS un aperçu collé. On réglait à l'aveugle un truc qu'on ne voyait pas.
//
// Ici, la page ne défile plus du tout : c'est un poste de travail, pas un
// document. La hauteur visible se partage entre la scène (en haut, elle prend
// ce qui reste) et UNE FEUILLE (en bas, celle de toutes les applis de
// retouche), qu'on tire à trois hauteurs — fermée, à mi-écran, presque pleine.
// Le rail des onglets descend sous la feuille : c'est là que le pouce arrive.
//
// Sur grand écran, RIEN NE CHANGE : la feuille redevient la colonne de gauche,
// le rail sa bande d'icônes, la scène la place qui reste. Tout ce qui suit est
// donc écrit « petit écran d'abord », et `lg:` remet la mise en page connue.

"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Les trois paliers de la feuille, en fraction de la hauteur VISIBLE.
 *
 * Trois et pas deux : « fermée » sert à juger la planche entière, « à mi-écran »
 * à travailler (on voit ce qu'on règle), « presque pleine » aux panneaux longs
 * — l'allure, les journées — où l'on ne fait que faire défiler.
 */
const PALIERS_FEUILLE = { fermee: 0, demi: 0.38, pleine: 0.76 };

/** La hauteur réellement visible : sur iOS, `innerHeight` compte la barre
 *  d'URL rétractée, `visualViewport` non. C'est la seconde qu'on habite. */
function hauteurVue() {
  if (typeof window === "undefined") return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Le palier le plus proche d'une hauteur en pixels. */
function palierProche(px) {
  const vh = hauteurVue();
  return Object.keys(PALIERS_FEUILLE).reduce((meilleur, cle) =>
    Math.abs(PALIERS_FEUILLE[cle] * vh - px) < Math.abs(PALIERS_FEUILLE[meilleur] * vh - px)
      ? cle
      : meilleur,
  );
}

/**
 * @param {object} p
 * @param {React.ReactNode} p.barre    - le contenu de la barre haute.
 * @param {string} p.message           - le bandeau d'état, s'il y en a un.
 * @param {React.ReactNode} p.scene    - l'aperçu et ce qui l'accompagne.
 * @param {Array} p.onglets            - `{ cle, label, Icone }`.
 * @param {React.RefObject} p.feuilleRef - la poignée que l'atelier tient sur sa
 *   coque : `{ ouvrir, panneau }`. `ouvrir` parce qu'un clic DANS la planche
 *   ouvre le réglage correspondant, et doit relever la feuille même quand
 *   l'onglet visé est déjà l'onglet courant. `panneau` rend l'élément qui
 *   défile : c'est LÀ que l'atelier cherche le champ à mettre au point, et pas
 *   dans le document — les deux ateliers du studio sont montés ensemble, et un
 *   `id` n'y est unique que par accident.
 */
export default function CoqueAtelier({
  barre,
  message,
  scene,
  outils = null,
  onglets,
  onglet,
  setOnglet,
  feuilleRef = null,
  children,
}) {
  const [feuille, setFeuille] = useState("demi");
  /** La hauteur en pixels PENDANT le glissement — hors des paliers. */
  const [glissee, setGlissee] = useState(null);
  /** Vrai sous `lg`. Mesuré, jamais deviné : la hauteur de la feuille est un
   *  style en ligne, et un style en ligne ne connaît pas les media queries. */
  const [petit, setPetit] = useState(false);
  const boiteRef = useRef(null);
  const gesteRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const maj = () => setPetit(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);

  const ouvrir = useCallback(() => {
    setFeuille((f) => (f === "fermee" ? "demi" : f));
  }, []);

  // `useImperativeHandle` et pas une écriture à la main : un `ref` reçu en prop
  // ne s'écrit pas, ni pendant le rendu ni depuis un effet — c'est la règle
  // d'immutabilité de React 19. `panneau` est une FONCTION : la poignée est
  // fabriquée une fois, l'élément qu'elle désigne doit rester frais.
  useImperativeHandle(feuilleRef, () => ({ ouvrir, panneau: () => boiteRef.current }), [ouvrir]);

  const choisirOnglet = useCallback(
    (cle) => {
      // Retaper l'onglet COURANT referme la feuille : c'est le geste de toutes
      // les barres d'outils du monde, et le seul moyen rapide de revoir la
      // planche entière sans viser la poignée.
      if (cle === onglet) {
        setFeuille((f) => (f === "fermee" ? "demi" : "fermee"));
        return;
      }
      setOnglet(cle);
      ouvrir();
    },
    [onglet, setOnglet, ouvrir],
  );

  /* ------------------------------------------------------ la poignée qu'on tire */

  const debutGeste = useCallback((e) => {
    const h = boiteRef.current?.getBoundingClientRect().height ?? 0;
    gesteRef.current = { y0: e.clientY, h0: h, courant: h, bouge: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const pendantGeste = useCallback((e) => {
    const g = gesteRef.current;
    if (!g) return;
    if (Math.abs(e.clientY - g.y0) > 4) g.bouge = true;
    // Vers le haut = plus grand : on tire la feuille, on ne pousse pas un bord.
    g.courant = Math.max(0, Math.min(hauteurVue() * 0.88, g.h0 - (e.clientY - g.y0)));
    setGlissee(g.courant);
  }, []);

  const finGeste = useCallback(() => {
    const g = gesteRef.current;
    gesteRef.current = null;
    setGlissee(null);
    if (!g) return;
    // Un simple appui fait défiler les paliers ; un vrai glissement s'aimante
    // au plus proche.
    if (!g.bouge) {
      setFeuille((f) => (f === "demi" ? "pleine" : f === "pleine" ? "fermee" : "demi"));
      return;
    }
    setFeuille(palierProche(g.courant));
  }, []);

  const hauteurPanneau =
    glissee != null ? `${Math.round(glissee)}px` : `${Math.round(PALIERS_FEUILLE[feuille] * 100)}dvh`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-brand-paper/35">
      {/* ---------------------------------------------------------- barre haute */}
      {/* Une seule ligne sur téléphone (`flex-nowrap`) : elle en prenait trois,
          et chacune était prise sur la planche. Ce qui n'y tient pas vit
          maintenant dans un panneau — c'est le rôle des panneaux. */}
      <header className="flex shrink-0 flex-nowrap items-center gap-2 border-b border-brand-field/70 bg-brand-paper/70 px-3 py-1 lg:flex-wrap lg:py-2">
        {barre}
      </header>

      {message && (
        <p
          className="shrink-0 border-b border-brand-field/60 bg-brand-primary/12 px-4 py-2 font-heading text-[13px] text-brand-primary-dark"
          role="status"
        >
          {message}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ------------------------------------------------------------- scène */}
        {/* `min-h-[26dvh]` : le plancher de la planche. Sans lui, la feuille
            tirée à fond réduisait l'aperçu à ZÉRO pixel — on réglait à l'aveugle
            le défaut même qu'on venait de corriger. Le minimum est un minimum
            FLEX : la feuille, qui peut rétrécir, cède ce qu'il faut pour le
            tenir, et le rail reste sous le pouce au lieu d'être poussé dehors. */}
        <section className="order-1 flex min-h-[26dvh] flex-1 flex-col lg:order-2 lg:min-h-0 lg:min-w-0">
          {scene}
        </section>

        {/* --------------------------------------------------- feuille + rail */}
        {/* `flex-col-reverse` : le rail est PREMIER dans le document (c'est la
            navigation, elle se lit et se tabule avant le panneau qu'elle pilote)
            mais il s'affiche EN BAS, sous le pouce. En grand écran, `lg:flex-row`
            le remet à sa place — à gauche, avant le panneau. */}
        <div className="order-2 flex min-h-0 flex-col-reverse lg:order-1 lg:w-[404px] lg:shrink-0 lg:flex-row lg:border-r lg:border-brand-field/70">
          <nav
            aria-label="Réglages"
            className="flex shrink-0 gap-1 overflow-x-auto border-t border-brand-field/70 bg-brand-paper/80 px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:w-[80px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-t-0 lg:border-r lg:py-2 lg:pb-2"
          >
            {onglets.map(({ cle, label, Icone }) => (
              <button
                key={cle}
                type="button"
                onClick={() => choisirOnglet(cle)}
                aria-current={onglet === cle ? "page" : undefined}
                className={`flex min-w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 font-heading text-[10px] transition-colors motion-reduce:transition-none lg:w-full lg:min-w-0 lg:gap-1 lg:py-2 lg:text-[11px] ${
                  onglet === cle
                    ? "bg-brand-primary/25 text-brand-text"
                    : "text-brand-text/55 hover:bg-brand-primary/10 hover:text-brand-text"
                }`}
              >
                <Icone size={18} aria-hidden className="lg:size-[19px]" />
                {label}
              </button>
            ))}
          </nav>

          {/* `lg:contents` : en grand écran cette boîte disparaît et le panneau
              redevient l'enfant direct du rail — sinon il perdrait sa largeur. */}
          <div className="flex min-h-0 flex-col lg:contents">
            {/* LA BARRE DE LA FEUILLE — trois métiers dans une seule rangée :
                la poignée qu'on tire, et les outils de la scène (le zoom, la
                bande des vignettes). Ils avaient chacun leur rangée, et sur un
                téléphone ces rangées se prenaient sur la seule chose qui
                compte, la planche. */}
            <div className="flex shrink-0 items-center gap-2 border-t border-brand-field/70 bg-brand-paper/80 px-2 py-1 lg:hidden">
              {outils}
              {/* La poignée porte les gestes, et elle seule : les outils qui la
                  bordent restent cliquables sans garde à écrire. */}
              <button
                type="button"
                aria-label="Hauteur du panneau de réglages"
                aria-expanded={feuille !== "fermee"}
                onPointerDown={debutGeste}
                onPointerMove={pendantGeste}
                onPointerUp={finGeste}
                onPointerCancel={finGeste}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") setFeuille(feuille === "fermee" ? "demi" : "pleine");
                  else if (e.key === "ArrowDown") setFeuille(feuille === "pleine" ? "demi" : "fermee");
                }}
                // `detail === 0` : le clic vient du CLAVIER (entrée, espace), pas
                // d'un doigt. Un appui tactile passe déjà par `finGeste` — sans
                // cette garde, il basculerait la feuille deux fois.
                onClick={(e) => {
                  if (e.detail === 0) setFeuille(feuille === "fermee" ? "demi" : "fermee");
                }}
                className="flex flex-1 cursor-grab touch-none items-center justify-center self-stretch py-2 active:cursor-grabbing"
              >
                <span className="h-1 w-10 rounded-full bg-brand-text/25" />
              </button>
            </div>
            <div
              ref={boiteRef}
              style={petit ? { height: hauteurPanneau } : undefined}
              className={`min-h-0 overflow-y-auto overscroll-contain bg-brand-paper/80 lg:h-auto lg:w-[324px] lg:flex-1 lg:bg-transparent lg:transition-none ${
                glissee == null ? "transition-[height] duration-200 motion-reduce:transition-none" : ""
              }`}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
