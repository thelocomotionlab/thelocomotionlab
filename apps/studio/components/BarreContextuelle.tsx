"use client";

// components/BarreContextuelle.tsx
//
// LES SIX RÉGLAGES FRÉQUENTS, AU-DESSUS DE LA SÉLECTION.
//
// C'est le renversement que la v1 n'avait pas : le titre s'y réglait dans six
// sections d'un onglet « Allure », à l'autre bout de l'écran. Ici ce qui sert
// tout le temps est SOUS LA MAIN, à un centimètre de ce qu'on regarde ;
// l'inspecteur garde le reste.
//
// ELLE NE BOUGE JAMAIS LA PLANCHE. Elle flotte au-dessus, en pixels d'écran, et
// bascule SOUS la sélection quand le haut manque — sinon elle sortirait du plan
// de travail sur un élément collé au bord supérieur.

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  Copy,
  Trash2,
  Type,
} from "lucide-react";
import { GRAISSES, brandColors } from "@locomotionlab/planche";
import type { BoitePx, Element, ElementTexte, Theme } from "@locomotionlab/planche";

/** La hauteur de la barre, et l'air qu'elle garde au-dessus de la sélection. */
const HAUTEUR = 40;
const ECART = 12;

/** Les encres proposées au premier rang : celles du thème, puis la charte. */
function palette(theme: Theme): { valeur: string; nom: string }[] {
  return [
    { valeur: "", nom: "Encre du thème" },
    { valeur: theme.accent, nom: "Accent" },
    { valeur: brandColors.primary, nom: "Bleu-vert" },
    { valeur: brandColors.deep, nom: "Terracotta" },
    { valeur: brandColors.trace, nom: "Fuchsia" },
  ];
}

const BOUTON =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded px-1.5 text-[12px] text-brand-soft transition-colors hover:bg-brand-primary/15 hover:text-brand-text motion-reduce:transition-none";

export default function BarreContextuelle({
  choisis,
  cadre,
  echelle,
  theme,
  onRegler,
  onDupliquer,
  onSupprimer,
  onOrdre,
}: {
  choisis: Element[];
  cadre: BoitePx;
  echelle: number;
  theme: Theme;
  onRegler: (transforme: (e: Element) => Element, libelle: string) => void;
  onDupliquer: () => void;
  onSupprimer: () => void;
  onOrdre: (vers: "devant" | "derriere") => void;
}) {
  const texte = choisis.length === 1 && choisis[0]!.type === "texte" ? (choisis[0] as ElementTexte) : null;

  // La barre se pose au-dessus de la sélection, centrée. Si le haut manque, elle
  // passe dessous : hors du plan de travail, elle ne servirait à rien.
  const hautVoulu = cadre.y * echelle - HAUTEUR - ECART;
  const dessous = hautVoulu < 0;
  // Centrée par transformation plutôt que par mesure : lire sa largeur pour la
  // recentrer demanderait un rendu de plus à chaque changement de sélection, et
  // la barre sauterait d'un cheveu à chaque clic.
  const style: React.CSSProperties = {
    top: dessous ? (cadre.y + cadre.h) * echelle + ECART : hautVoulu,
    left: (cadre.x + cadre.l / 2) * echelle,
    transform: "translateX(-50%)",
    height: HAUTEUR,
  };

  const regler = (t: (e: ElementTexte) => ElementTexte, libelle: string) =>
    onRegler((e) => (e.type === "texte" ? t(e) : e), libelle);

  return (
    <div
      role="toolbar"
      aria-label="Réglages de la sélection"
      className="absolute z-20 flex items-center gap-0.5 rounded-lg border border-brand-field bg-brand-paper px-1 shadow-card"
      style={style}
      // Le pointeur ne doit pas traverser jusqu'à la planche : cliquer un bouton
      // désélectionnerait l'élément qu'on règle.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {texte && (
        <>
          <label className="flex items-center gap-1" title="Corps">
            <Type size={14} aria-hidden className="text-brand-muted" />
            <input
              type="number"
              min={6}
              value={Math.round(texte.corps)}
              aria-label="Corps"
              onChange={(e) =>
                regler((x) => ({ ...x, corps: Math.max(6, Number(e.target.value)) }), "corps")
              }
              className="tabulaire h-8 w-12 rounded border border-brand-field bg-brand-bg px-1 text-right text-[12px]"
            />
          </label>

          <label className="sr-only" htmlFor="graisse-contextuelle">
            Graisse
          </label>
          <select
            id="graisse-contextuelle"
            value={texte.graisse}
            onChange={(e) => regler((x) => ({ ...x, graisse: Number(e.target.value) }), "graisse")}
            className="h-8 rounded border border-brand-field bg-brand-bg px-1 text-[12px]"
          >
            {Object.entries(GRAISSES).map(([nom, poids]) => (
              <option key={poids} value={poids}>
                {poids} · {nom}
              </option>
            ))}
          </select>

          <button
            type="button"
            title="Capitales espacées"
            aria-label="Capitales espacées"
            aria-pressed={texte.casse === "capitales"}
            onClick={() =>
              regler(
                (x) => ({
                  ...x,
                  casse: x.casse === "capitales" ? "normale" : "capitales",
                  // Les capitales de la charte s'écartent : sans interlettrage
                  // elles se lisent comme un cri, pas comme une étiquette.
                  lettrage: x.casse === "capitales" ? 0 : 0.16,
                }),
                "casse",
              )
            }
            className={`${BOUTON} ${texte.casse === "capitales" ? "bg-brand-primary/20 text-brand-text" : ""}`}
          >
            <CaseSensitive size={15} aria-hidden />
          </button>

          <Separateur />

          <div className="flex items-center gap-0.5" role="group" aria-label="Couleur">
            {palette(theme).map((c) => (
              <button
                key={c.valeur || "encre"}
                type="button"
                title={c.nom}
                aria-label={c.nom}
                aria-pressed={texte.couleur === c.valeur}
                onClick={() => regler((x) => ({ ...x, couleur: c.valeur }), "couleur")}
                className={`h-5 w-5 rounded-full border transition-transform motion-reduce:transition-none ${
                  texte.couleur === c.valeur
                    ? "scale-110 border-brand-primary-dark"
                    : "border-brand-field hover:scale-110"
                }`}
                style={{ background: c.valeur || theme.encre }}
              />
            ))}
          </div>

          <Separateur />

          <div className="flex" role="group" aria-label="Alignement">
            {(
              [
                ["gauche", AlignLeft, "À gauche"],
                ["centre", AlignCenter, "Centré"],
                ["droite", AlignRight, "À droite"],
              ] as const
            ).map(([cle, Icone, nom]) => (
              <button
                key={cle}
                type="button"
                title={nom}
                aria-label={nom}
                aria-pressed={texte.alignement === cle}
                onClick={() => regler((x) => ({ ...x, alignement: cle }), "alignement")}
                className={`${BOUTON} ${texte.alignement === cle ? "bg-brand-primary/20 text-brand-text" : ""}`}
              >
                <Icone size={15} aria-hidden />
              </button>
            ))}
          </div>

          <Separateur />
        </>
      )}

      <button type="button" title="Devant" aria-label="Passer devant" onClick={() => onOrdre("devant")} className={BOUTON}>
        <ArrowUp size={15} aria-hidden />
      </button>
      <button
        type="button"
        title="Derrière"
        aria-label="Passer derrière"
        onClick={() => onOrdre("derriere")}
        className={BOUTON}
      >
        <ArrowDown size={15} aria-hidden />
      </button>
      <button type="button" title="Dupliquer (Ctrl+D)" aria-label="Dupliquer" onClick={onDupliquer} className={BOUTON}>
        <Copy size={15} aria-hidden />
      </button>
      <button type="button" title="Supprimer (Suppr)" aria-label="Supprimer" onClick={onSupprimer} className={BOUTON}>
        <Trash2 size={15} aria-hidden />
      </button>
    </div>
  );
}

function Separateur() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-brand-hairline" aria-hidden />;
}
