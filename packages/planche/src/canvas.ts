// packages/planche/src/canvas.ts
//
// CE QUE LE RENDU ATTEND D'UN CANVAS, et rien de plus.
//
// Le type est déclaré ici plutôt que pris dans le DOM pour deux raisons :
// `OffscreenCanvasRenderingContext2D` n'est pas assignable à
// `CanvasRenderingContext2D` (il n'a pas de `canvas: HTMLCanvasElement`) alors
// que les deux savent tout faire de ce qui suit, et un contexte de comptoir
// suffit alors à tester la mise en page sans monter le moindre canvas.

export type Degrade = {
  addColorStop(offset: number, couleur: string): void;
};

export type Mesure = { width: number };

/** Le sous-ensemble du contexte 2D qu'utilise le rendu d'une planche. */
export type Ctx2D = {
  font: string;
  fillStyle: string | Degrade | unknown;
  strokeStyle: string | Degrade | unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  measureText(texte: string): Mesure;
  fillText(texte: string, x: number, y: number): void;
  fillRect(x: number, y: number, l: number, h: number): void;
  strokeRect(x: number, y: number, l: number, h: number): void;
  clearRect(x: number, y: number, l: number, h: number): void;

  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, d: number, f: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    debut: number,
    fin: number,
  ): void;
  rect(x: number, y: number, l: number, h: number): void;
  fill(): void;
  stroke(chemin?: unknown): void;
  clip(): void;
  setLineDash(motif: number[]): void;

  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Degrade;
};

/**
 * LE VOCABULAIRE D'ICÔNES, injecté plutôt qu'importé.
 *
 * Les pictogrammes du labo sont des composants lucide : de la géométrie
 * emballée dans du React. Les importer ici ferait de ce paquet — qui ne fait que
 * découper, mesurer et poser — un consommateur de React, alors qu'il tourne
 * aussi bien sous Node et sous les tests. L'app qui possède les icônes déclare
 * donc le vocabulaire au démarrage.
 *
 * Sans vocabulaire, `:col:` reste du texte : c'est le bon défaut. Faire
 * disparaître un mot parce qu'on ne connaît pas sa clé serait pire que de
 * l'afficher tel quel.
 */
export type Vocabulaire = {
  connue(cle: string): boolean;
  dessiner(
    ctx: Ctx2D,
    cle: string,
    x: number,
    y: number,
    taille: number,
    couleur: string,
  ): boolean;
};

const VIDE: Vocabulaire = { connue: () => false, dessiner: () => false };

let vocabulaire: Vocabulaire = VIDE;

export function definirVocabulaireDIcones(v: Vocabulaire | null): void {
  vocabulaire = v ?? VIDE;
}

export function vocabulaireDIcones(): Vocabulaire {
  return vocabulaire;
}
