"use client";

// components/SaisieEnPlace.tsx
//
// LE CARET DANS L'IMAGE.
//
// Un champ posé au pixel sur l'élément, dans SA typographie : même corps, même
// graisse, même interligne, même alignement, même encre. L'élément est retiré
// du canvas pendant la saisie — on ne voit donc qu'un texte, à sa place, qu'on
// modifie là où il vit.
//
// CE QU'ON TAPE EST LE BALISAGE, pas du texte riche rendu. C'est un choix, et
// il tient à une chose : le canvas est le SEUL moteur de rendu. Un
// `contenteditable` qui afficherait le gras en gras devrait remimer en CSS la
// plaque, les capitales espacées lettre à lettre, les puces tracées et les
// blocs de donnée — un second moteur, qui finirait par ne pas couper les lignes
// au même endroit que le premier. On préfère voir `*gras*` pendant deux
// secondes que découvrir une mise en page différente à la sortie.
//
// La mise en forme se fait donc SUR LA SÉLECTION, en enveloppant : Ctrl+B pose
// des étoiles autour des mots choisis, comme un éditeur le ferait.
//
// LE CHAMP NE SE FERME PAS SUR UN `blur`. Le double-clic qui l'ouvre se termine
// par un `mouseup` sur la planche, qui lui reprend le focus aussitôt : fermer
// là-dessus refermait le champ dans la milliseconde où il s'ouvrait. Il se
// ferme donc sur Échap, ou quand on clique ailleurs dans la planche — ce que la
// couche de manipulation sait déjà voir.

import { useLayoutEffect, useRef } from "react";
import { themeDe, type ElementTexte, type Projet } from "@locomotionlab/planche";

/** Les enveloppes de la charte, et leur raccourci. */
const ENVELOPPES: Record<string, [string, string]> = {
  b: ["*", "*"],
  i: ["_", "_"],
  u: ["~", "~"],
  h: ["[", "]"],
};

export default function SaisieEnPlace({
  element,
  projet,
  echelle,
  onChange,
  onFermer,
  onAnnuler,
  onRefaire,
}: {
  element: ElementTexte;
  projet: Projet;
  echelle: number;
  onChange: (contenu: string) => void;
  onFermer: () => void;
  onAnnuler: () => void;
  onRefaire: () => void;
}) {
  const champ = useRef<HTMLTextAreaElement | null>(null);
  const theme = themeDe(projet.theme);

  useLayoutEffect(() => {
    const el = champ.current;
    if (!el) return;
    el.focus();
    // Le caret à la fin, pas au début : on ouvre un texte pour le continuer
    // bien plus souvent que pour le reprendre depuis sa première lettre.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [element.id]);

  /** Enveloppe la sélection, ou pose une paire vide et place le caret dedans. */
  function envelopper(cle: string) {
    const el = champ.current;
    const paire = ENVELOPPES[cle];
    if (!el || !paire) return;
    const [ouvre, ferme] = paire;
    const { selectionStart: d, selectionEnd: f, value } = el;
    const pris = value.slice(d, f);
    onChange(`${value.slice(0, d)}${ouvre}${pris}${ferme}${value.slice(f)}`);
    // On rend la sélection APRÈS le rendu, sur le texte enveloppé : sinon le
    // caret saute à la fin et il faut le replacer à la main.
    queueMicrotask(() => {
      el.setSelectionRange(d + ouvre.length, f + ouvre.length);
      el.focus();
    });
  }

  const corps = element.corps * echelle;
  const interligne = element.interligne || 1.2;

  return (
    <textarea
      ref={champ}
      value={element.contenu}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        const commande = e.metaKey || e.ctrlKey;
        const touche = e.key.toLowerCase();
        if (e.key === "Escape") {
          e.preventDefault();
          onFermer();
          return;
        }
        // L'ANNULATION PASSE PAR NOTRE HISTORIQUE, pas par celui du navigateur.
        // Le champ est contrôlé par React : l'annulation native y remet une
        // valeur que le document ne connaît pas, et les deux divergent.
        if (commande && touche === "z") {
          e.preventDefault();
          if (e.shiftKey) onRefaire();
          else onAnnuler();
          return;
        }
        if (commande && ENVELOPPES[touche]) {
          e.preventDefault();
          envelopper(touche);
        }
        // Le reste du clavier appartient au champ tant qu'il a le focus : Suppr
        // efface une lettre, pas l'élément.
        e.stopPropagation();
      }}
      spellCheck={false}
      aria-label={`Modifier ${element.nom}`}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        left: element.x * 100 + "%",
        // La ligne de base du canvas tombe à 0,78 corps sous le haut de la
        // boîte ; celle d'un champ, au milieu de son interligne. On remonte le
        // champ de la différence pour que les lettres ne sautent pas à
        // l'ouverture.
        top: `calc(${element.y * 100}% + ${(corps * (1 - interligne)) / 2}px)`,
        width: element.l * 100 + "%",
        height: `calc(${element.h * 100}% + ${corps}px)`,
        font: `${element.italique ? "italic " : ""}${element.graisse} ${corps}px var(--next-font-ubuntu), ui-sans-serif`,
        lineHeight: String(interligne),
        letterSpacing: `${element.lettrage}em`,
        textTransform: element.casse === "capitales" ? "uppercase" : "none",
        textAlign: element.alignement === "centre" ? "center" : element.alignement === "droite" ? "right" : "left",
        color: element.couleur || theme.encre,
        caretColor: theme.accent,
        // Le champ est SUR la planche : le rendu du canvas est masqué dessous,
        // donc rien ne se dédouble.
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: "center",
      }}
    />
  );
}
