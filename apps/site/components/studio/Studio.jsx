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
// PLEIN ÉCRAN. La navbar du site (80 px, collée) et le pied mangeaient un quart
// de la hauteur, sur laquelle se trouve la seule chose qui compte : l'image en
// cours. Ils sont retirés de cette route (components/ChromeDuSite.jsx) et
// remplacés par UNE marque cliquable, qui ramène au site. C'est le geste de
// Canva — une icône pour sortir, rien d'autre — avec l'empreinte du labo à la
// place de la maison générique : on sait toujours chez qui on travaille.
//
// PAS DE MOT DE PASSE. Décision assumée : ces outils ne portent aucune donnée,
// aucun secret, aucun appel serveur — il n'y a rien à protéger derrière. La
// page est en `noindex` et n'est liée depuis nulle part ; qui a l'URL entre.

"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Images, Wand2, WifiOff } from "lucide-react";

import CarrouselAtelier from "@/components/outils/CarrouselAtelier";
import HabillagePhoto from "@/components/outils/HabillagePhoto";

const ATELIERS = [
  { cle: "carrousel", label: "Carrousel", Icon: Images },
  { cle: "habillage", label: "Habillage photo", Icon: Wand2 },
];

const ONGLET =
  "inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-1.5 font-heading text-[13px] font-medium transition-colors motion-reduce:transition-none";

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
   * L'aperçu des ateliers se colle à `--apercu-top` : sur un téléphone, la page
   * défile et la planche doit rester sous la barre du studio, pas glisser
   * dessous.
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
      coque.style.setProperty(
        "--apercu-top",
        `${Math.round(barre.getBoundingClientRect().height)}px`,
      );
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
    <div ref={coqueRef} className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:overflow-hidden">
      {/* LA BARRE DU STUDIO : la marque pour sortir, les deux ateliers, et rien
          d'autre. Collée en haut — sur un téléphone, la page défile et changer
          d'atelier ne doit pas demander de remonter. */}
      <header
        ref={barreRef}
        className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-brand-field bg-brand-paper/95 px-3 py-1.5 backdrop-blur"
      >
        <Link
          href="/"
          title="Revenir au site"
          aria-label="Revenir au site"
          className="flex shrink-0 items-center rounded-full p-1 transition-opacity hover:opacity-70 motion-reduce:transition-none"
        >
          <Image
            src="/images/assets/logo-mark-512.png"
            alt=""
            width={30}
            height={30}
            className="h-[30px] w-[30px]"
            priority
          />
        </Link>
        <div className="flex gap-1 rounded-full border border-brand-field bg-brand-bg p-0.5">
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
              <Icon size={15} aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {horsLigne && (
          <p className="ml-auto flex items-center gap-1.5 font-heading text-[12px] text-brand-text/55">
            <WifiOff size={13} aria-hidden />
            <span className="hidden md:inline">
              Hors ligne — tout fonctionne, sauf le fond de carte topo.
            </span>
          </p>
        )}
      </header>

      {/* `hidden` et non un démontage : l'atelier qu'on quitte garde sa photo,
          sa trace et ses textes. `display: contents` sur le conteneur visible :
          c'est l'ATELIER qui doit être l'enfant flex de la coque, sinon il n'a
          aucune hauteur à occuper. */}
      <div className={actif === "carrousel" ? "contents" : ""} hidden={actif !== "carrousel"}>
        <CarrouselAtelier />
      </div>
      <div className={actif === "habillage" ? "contents" : ""} hidden={actif !== "habillage"}>
        <HabillagePhoto />
      </div>
    </div>
  );
}
