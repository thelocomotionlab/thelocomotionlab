// components/studio/Studio.jsx
//
// LE STUDIO : l'espace de création des visuels du labo pour les réseaux.
//
// Il ne fait presque rien lui-même — il RÉUNIT. Les deux ateliers existaient
// déjà, chacun sur sa page, avec la même façon de travailler : un canvas qui
// EST l'image finale, un aperçu collé en haut, tout dans le navigateur. Les
// séparer obligeait à sortir de l'un pour entrer dans l'autre, alors qu'on
// prépare une publication en faisant les deux dans la même demi-heure.
//
// LES DEUX ATELIERS RESTENT MONTÉS, celui qu'on ne regarde pas simplement
// caché. C'est le point qui compte : changer d'onglet ne doit RIEN perdre. Un
// démontage jetterait la photo chargée, la trace découpée, les textes écrits —
// et sur un téléphone, recharger un GPX de 6 Mo n'est pas une broutille.
//
// PAS DE MOT DE PASSE. Décision assumée : ces outils ne portent aucune donnée,
// aucun secret, aucun appel serveur — il n'y a rien à protéger derrière. La
// page est en `noindex` et n'est liée depuis nulle part ; qui a l'URL entre.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Images, Wand2, WifiOff } from "lucide-react";

import CarrouselAtelier from "@/components/outils/CarrouselAtelier";
import HabillagePhoto from "@/components/outils/HabillagePhoto";

const ATELIERS = [
  { cle: "carrousel", label: "Carrousel", Icon: Images },
  { cle: "habillage", label: "Habillage photo", Icon: Wand2 },
];

const ONGLET =
  "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 font-heading text-[14px] font-medium transition-colors motion-reduce:transition-none";

export default function Studio() {
  const [actif, setActif] = useState("carrousel");
  const [horsLigne, setHorsLigne] = useState(false);
  const barreRef = useRef(null);
  const coqueRef = useRef(null);

  // L'onglet vient du FRAGMENT (#habillage), lu dans un effet et non au premier
  // rendu : le serveur ne connaît pas le fragment, le lire pendant le rendu
  // ferait diverger l'hydratation. Un changement d'onglet le réécrit, pour que
  // l'URL reste partageable et que le bouton « retour » fasse ce qu'on attend.
  useEffect(() => {
    const depuisUrl = () => {
      const cle = window.location.hash.replace("#", "");
      if (ATELIERS.some((a) => a.cle === cle)) setActif(cle);
    };
    depuisUrl();
    window.addEventListener("hashchange", depuisUrl);
    return () => window.removeEventListener("hashchange", depuisUrl);
  }, []);

  // Le service worker : enregistré SEULEMENT depuis le studio, et cantonné à
  // son scope. Le site public n'en a jamais, donc rien ne peut y être servi
  // périmé (cf. public/sw.js).
  useEffect(() => {
    // Pas en développement : un service worker qui garde les chunks de Next en
    // cache pendant qu'on édite est une source d'erreurs incompréhensibles.
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/studio" }).catch(() => {});
  }, []);

  useEffect(() => {
    const maj = () => setHorsLigne(!navigator.onLine);
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);

  /**
   * L'aperçu des ateliers se colle à `--apercu-top`. Ici, il doit se poser SOUS
   * la barre d'onglets, elle-même collée sous la navbar — sinon il glisse
   * dessous au défilement et on ne voit plus le haut de la planche.
   *
   * On MESURE la barre au lieu d'écrire sa hauteur en dur : elle change avec le
   * bandeau « hors ligne », et une valeur figée se serait désaccordée en
   * silence, à l'endroit précis qu'on ne regarde plus une fois qu'il marche.
   */
  useEffect(() => {
    const barre = barreRef.current;
    const coque = coqueRef.current;
    if (!barre || !coque) return undefined;
    const mesurer = () => {
      const haut = barre.getBoundingClientRect().height;
      coque.style.setProperty("--apercu-top", `${Math.round(80 + haut)}px`);
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(barre);
    return () => observateur.disconnect();
  }, []);

  const changer = useCallback((cle) => {
    setActif(cle);
    window.history.replaceState(null, "", `#${cle}`);
  }, []);

  return (
    <div ref={coqueRef}>
      {/* La barre d'onglets est collée elle aussi, au-dessus des aperçus :
          sur un téléphone, changer d'atelier ne doit pas demander de remonter. */}
      <div ref={barreRef} className="sticky top-[80px] z-30 -mx-4 mb-4 bg-brand-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-md gap-2 rounded-full border border-brand-field bg-brand-paper p-1">
          {ATELIERS.map(({ cle, label, Icon }) => (
            <button
              key={cle}
              type="button"
              onClick={() => changer(cle)}
              aria-current={actif === cle ? "page" : undefined}
              className={`${ONGLET} ${
                actif === cle
                  ? "bg-brand-deep text-brand-bg"
                  : "text-brand-text/60 hover:bg-brand-primary/12 hover:text-brand-text"
              }`}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        {horsLigne && (
          <p className="mx-auto mt-2 flex max-w-md items-center justify-center gap-2 font-heading text-[12px] text-brand-text/55">
            <WifiOff size={13} aria-hidden />
            Hors ligne — tout fonctionne, sauf le fond de carte topo.
          </p>
        )}
      </div>

      {/* `hidden` et non un démontage : l'atelier qu'on quitte garde sa photo,
          sa trace et ses textes. */}
      <div hidden={actif !== "carrousel"}>
        <CarrouselAtelier />
      </div>
      {/* L'habillage garde la colonne de lecture : c'est un outil à un seul
          réglage à la fois, l'étirer sur 1600 px l'aurait rendu illisible. */}
      <div hidden={actif !== "habillage"} className="mx-auto max-w-6xl">
        <HabillagePhoto />
      </div>
    </div>
  );
}
