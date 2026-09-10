"use client";

// components/TiroirMedias.tsx
//
// LA BIBLIOTHÈQUE DE PHOTOS DU PROJET.
//
// En v1 : une photo par planche, rechargée à chaque fois. Ici les photos vivent
// dans le projet, et une planche n'en garde que l'identifiant — un même cliché
// posé sur trois planches n'est stocké qu'une fois, et dupliquer une planche ne
// duplique pas ses photos.
//
// L'ordre est celui de la PRISE DE VUE quand l'EXIF le dit : c'est le seul ordre
// utile quand on raconte une aventure.

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { photoNeuve, type Media, type Projet } from "@locomotionlab/planche";

import { importer } from "@/lib/medias";
import { poser } from "@/lib/images";
import { avecPlanches } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Ce qu'on lit sous une vignette : la date de prise de vue, sinon le nom. */
function legende(m: Media): string {
  return m.priseLe !== null ? dateFmt.format(new Date(m.priseLe)) : m.nom;
}

export default function TiroirMedias({ poste }: { poste: PosteDeTravail }) {
  const { projet, selection, indexPlanche, modifier } = poste;
  const entree = useRef<HTMLInputElement | null>(null);
  const [enLecture, setEnLecture] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const planche = poste.plancheCourante?.type === "image" ? poste.plancheCourante : null;
  const choisie = planche?.elements.find((e) => e.id === selection[0] && e.type === "photo");
  // LE CADRE D'ACCUEIL : un modèle Photo ou Bandeau pose un cadre vide qui
  // ATTEND une image. C'est évidemment lui qu'on vise, et poser la photo à côté
  // obligerait à la déplacer puis à supprimer le cadre à chaque fois. On ne le
  // fait que s'il n'y en a qu'UN : au-delà, deviner serait se tromper une fois
  // sur deux.
  const vides = (planche?.elements ?? []).filter((e) => e.type === "photo" && e.mediaId === null);
  const cible = choisie ?? (vides.length === 1 ? vides[0] : undefined);

  const ranges = [...projet.medias].sort((a, b) => (a.priseLe ?? 0) - (b.priseLe ?? 0));

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setEnLecture(true);
    setSouci(null);
    const venus: Media[] = [];
    for (const f of fichiers) {
      const r = await importer(f);
      if (!r) continue;
      poser(r.media.id, r.image);
      venus.push(r.media);
    }
    setEnLecture(false);
    if (venus.length === 0) {
      setSouci("Aucune de ces images n'a pu être lue.");
      return;
    }
    modifier((p) => ({ ...p, medias: [...p.medias, ...venus] }), {
      libelle: venus.length > 1 ? "importer des photos" : "importer une photo",
    });
  }

  /** Pose la photo : dans le cadre choisi s'il y en a un, sur la planche sinon. */
  function poserSurLaPlanche(media: Media) {
    modifier(
      (p: Projet) => {
        const courante = p.planches[indexPlanche];
        if (!courante || courante.type !== "image") return p;
        const planches = [...p.planches];
        if (cible) {
          planches[indexPlanche] = {
            ...courante,
            elements: courante.elements.map((e) =>
              e.id === cible.id && e.type === "photo" ? { ...e, mediaId: media.id } : e,
            ),
          };
        } else {
          // Sans cadre choisi, la photo arrive au centre, à son rapport : un
          // cadre carré déformerait une photo de téléphone au premier coup
          // d'œil, et on la corrigerait à la main à chaque fois.
          const rapport = media.hauteur > 0 ? media.largeur / media.hauteur : 1;
          const l = 0.6;
          const h = Math.min(0.6, (l * 1080) / rapport / 1350);
          planches[indexPlanche] = {
            ...courante,
            elements: [
              ...courante.elements,
              photoNeuve({ x: (1 - l) / 2, y: (1 - h) / 2, l, h }, { mediaId: media.id }),
            ],
          };
        }
        return avecPlanches(p, planches);
      },
      { libelle: "poser une photo" },
    );
  }

  return (
    <div className="px-3.5 py-3">
      <input
        ref={entree}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={(e) => ajouter(e.target.files)}
      />
      <button
        type="button"
        onClick={() => entree.current?.click()}
        disabled={enLecture}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-brand-field px-3 py-2 text-[13px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none disabled:opacity-50"
      >
        <ImagePlus size={15} aria-hidden />
        {enLecture ? "Lecture…" : "Importer des photos"}
      </button>
      <p className="mt-1.5 text-[11px] leading-snug text-brand-muted">
        HEIC accepté. Rien ne quitte ce navigateur.
      </p>
      {souci && (
        <p role="alert" className="mt-2 text-[12px] text-brand-deep-dark">
          {souci}
        </p>
      )}

      {ranges.length > 0 && (
        <>
          <p className="mt-3 text-[11px] leading-snug text-brand-muted">
            {choisie
              ? "Un cadre est choisi : la photo ira dedans."
              : cible
                ? "Cette planche a un cadre en attente : la photo ira dedans."
                : "Aucun cadre en attente : la photo sera posée au centre."}
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-1.5">
            {ranges.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => poserSurLaPlanche(m)}
                  title={`${m.nom} · ${m.largeur}×${m.hauteur}`}
                  className="group block w-full overflow-hidden rounded border border-brand-field transition-colors hover:border-brand-primary-dark motion-reduce:transition-none"
                >
                  <Vignette id={m.id} />
                  <span className="block truncate px-1 py-0.5 text-[10px] text-brand-muted">
                    {legende(m)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * La vignette : un canvas plutôt qu'une balise `img`.
 *
 * La photo est déjà décodée en mémoire pour le rendu de la planche ; en refaire
 * une URL d'objet la ferait décoder une seconde fois, et à trente photos ça se
 * sent.
 */
function Vignette({ id }: { id: string }) {
  const toile = useRef<HTMLCanvasElement | null>(null);
  const dessine = useRef<string | null>(null);

  const peindre = (c: HTMLCanvasElement | null) => {
    toile.current = c;
    if (!c || dessine.current === id) return;
    void (async () => {
      const { chargerImage } = await import("@/lib/images");
      const image = await chargerImage(id);
      const ctx = c.getContext("2d");
      if (!image || !ctx) return;
      const cote = Math.max(image.width, image.height);
      const echelle = Math.min(c.width / image.width, c.height / image.height) * (cote / cote);
      const l = image.width * echelle;
      const h = image.height * echelle;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(image, (c.width - l) / 2, (c.height - h) / 2, l, h);
      dessine.current = id;
    })();
  };

  return <canvas ref={peindre} width={120} height={90} className="block h-auto w-full" />;
}
