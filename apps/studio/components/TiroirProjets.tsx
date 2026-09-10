"use client";

// components/TiroirProjets.tsx
//
// LES PROJETS, LES VERSIONS, ET LE FICHIER DE SECOURS.
//
// L'autosauvegarde est un filet, pas un projet : elle écrase un unique
// brouillon. Ici on nomme — « Écrins 2026 », puis « Écrins 2026 · avant
// relecture » —, on rouvre, on duplique, on efface.
//
// ET ON SORT. IndexedDB vit dans CE navigateur : un « effacer les données du
// site » emporte tout, et rien ne passe de l'ordinateur au téléphone. Le
// fichier `.llstudio` est la seule réponse honnête, et il emporte les photos.

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Upload } from "lucide-react";
import type { Projet } from "@locomotionlab/planche";

import { EN_COURS, charger, enregistrer, lister, renommer, supprimer, usage } from "@/lib/depot";
import { exporter, importer } from "@/lib/fichierProjet";
import { projetNeuf } from "@/lib/projet";
import type { PosteDeTravail } from "@/lib/usePosteDeTravail";

type Fiche = { nom: string; enregistreLe: string; planches: number; schema: number };

const BOUTON =
  "rounded-md border border-brand-field px-2 py-1.5 text-[12px] transition-colors hover:bg-brand-primary/10 motion-reduce:transition-none";

const CHAMP =
  "h-8 w-full rounded-md border border-brand-field bg-brand-bg px-2 text-[13px] outline-none focus:border-brand-primary-dark";

/** Un poids d'octets, dit en mégaoctets — l'unité où ces chiffres parlent. */
function mega(octets: number): string {
  return `${(octets / 1024 / 1024).toFixed(octets > 100 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function quand(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TiroirProjets({ poste }: { poste: PosteDeTravail }) {
  const { projet, ouvrir } = poste;
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [version, setVersion] = useState("");
  const [renomme, setRenomme] = useState<{ de: string; vers: string } | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const [place, setPlace] = useState<{ utilise: number; quota: number } | null>(null);
  const entree = useRef<HTMLInputElement | null>(null);

  const rafraichir = useCallback(() => {
    lister().then(setFiches, () => setFiches([]));
    usage().then(setPlace, () => setPlace(null));
  }, []);
  useEffect(rafraichir, [rafraichir]);

  /** Enregistre le document courant sous un nom, puis rafraîchit la liste. */
  const enregistrerSous = useCallback(
    async (nom: string) => {
      const propre = nom.trim();
      if (!propre || propre === EN_COURS) return;
      await enregistrer(propre, projet);
      rafraichir();
    },
    [projet, rafraichir],
  );

  async function ouvrirFiche(nom: string) {
    const repris = await charger(nom);
    if (repris) ouvrir(repris);
    else setSouci(`« ${nom} » n'a pas pu être relu.`);
  }

  async function surFichier(fichier: File | undefined) {
    if (!fichier) return;
    setSouci(null);
    try {
      ouvrir(await importer(fichier));
    } catch (e) {
      setSouci(e instanceof Error ? e.message : "Ce fichier n'a pas pu être ouvert.");
    }
  }

  return (
    <div className="space-y-4 px-3.5 py-3">
      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Ce projet
        </h3>
        {/* Le nom se saisit dans la barre haute, où il est toujours visible :
            un second champ ici en ferait deux à tenir d'accord. */}
        <p className="truncate text-[13px]">{projet.nom}</p>
        <div className="mt-1.5 flex gap-1">
          <button type="button" onClick={() => enregistrerSous(projet.nom)} className={`flex-1 ${BOUTON}`}>
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => ouvrir(projetNeuf())}
            title="Repartir d'un document vide"
            className={BOUTON}
          >
            Nouveau
          </button>
        </div>

        <div className="mt-1.5 flex gap-1">
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="avant relecture"
            aria-label="Nom de la version"
            className={CHAMP}
          />
          <button
            type="button"
            disabled={!version.trim()}
            onClick={() => {
              enregistrerSous(`${projet.nom} · ${version.trim()}`);
              setVersion("");
            }}
            title="Garder l'état actuel sous un nom, sans quitter le document"
            className={`${BOUTON} shrink-0 disabled:opacity-40`}
          >
            Version
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Enregistrés ({fiches.length})
        </h3>
        {fiches.length === 0 ? (
          <p className="text-[11px] leading-snug text-brand-muted">
            Rien encore. « Enregistrer » range le document sous son nom ; l&rsquo;autosauvegarde,
            elle, ne garde qu&rsquo;un brouillon.
          </p>
        ) : (
          <ul className="space-y-1">
            {fiches.map((f) => (
              <li key={f.nom} className="rounded-md border border-brand-field p-1.5">
                {renomme?.de === f.nom ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={renomme.vers}
                      onChange={(e) => setRenomme({ de: f.nom, vers: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setRenomme(null)}
                      aria-label={`Nouveau nom de ${f.nom}`}
                      className={CHAMP}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await renommer(f.nom, renomme.vers.trim() || f.nom);
                        setRenomme(null);
                        rafraichir();
                      }}
                      className={`${BOUTON} shrink-0`}
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => ouvrirFiche(f.nom)}
                      className="flex w-full items-baseline justify-between gap-2 text-left"
                    >
                      <span className="truncate text-[13px]">{f.nom}</span>
                      <span className="tabulaire shrink-0 text-[10px] text-brand-muted">
                        {f.planches} · {quand(f.enregistreLe)}
                      </span>
                    </button>
                    <div className="mt-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => enregistrerSous(`${f.nom} (copie)`)}
                        title="Enregistrer le document COURANT sous un nouveau nom"
                        className={`${BOUTON} flex-1 py-1`}
                      >
                        Dupliquer
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenomme({ de: f.nom, vers: f.nom })}
                        className={`${BOUTON} flex-1 py-1`}
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await supprimer(f.nom);
                          rafraichir();
                        }}
                        title="Effacer cet enregistrement — le document ouvert n'est pas touché"
                        className={`${BOUTON} flex-1 py-1`}
                      >
                        Effacer
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
          Fichier
        </h3>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => exporter(projet)}
            className={`${BOUTON} flex flex-1 items-center justify-center gap-1.5`}
          >
            <Download size={14} strokeWidth={1.75} aria-hidden />
            Exporter le projet
          </button>
          <button
            type="button"
            onClick={() => entree.current?.click()}
            className={`${BOUTON} flex flex-1 items-center justify-center gap-1.5`}
          >
            <Upload size={14} strokeWidth={1.75} aria-hidden />
            Importer un projet
          </button>
        </div>
        <input
          ref={entree}
          type="file"
          accept=".llstudio,.zip,application/zip"
          onChange={(e) => {
            surFichier(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="hidden"
        />
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-brand-muted">
          <FolderOpen size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          Un fichier « .llstudio » emporte le projet ET ses photos. C&rsquo;est ce qui passe d&rsquo;un
          navigateur à l&rsquo;autre, et ce qui reste si les données du site sont effacées.
        </p>
        {souci && (
          <p role="alert" className="mt-1.5 text-[11px] leading-snug text-brand-accent-ink">
            {souci}
          </p>
        )}
      </section>

      {place && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">
            Sur cet appareil
          </h3>
          <p className="tabulaire text-[12px] text-brand-soft">
            {mega(place.utilise)} utilisés{place.quota > 0 ? ` sur ${mega(place.quota)}` : ""}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-brand-muted">
            Une séance enregistrée seconde par seconde pèse à elle seule quelques
            mégaoctets, et chaque version en garde sa copie. Efface les versions dont tu
            n&rsquo;as plus besoin.
          </p>
        </section>
      )}
    </div>
  );
}
