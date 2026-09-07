// components/contenu/Corps.jsx
//
// LE CORPS D'UNE PAGE DE CONTENU : la prose et ses blocs.
//
// Le découpage vient de @locomotionlab/contenu, le même module qui construit
// l'index des blocs : ce que le build a relevé est exactement ce que la page
// rend, aux mêmes endroits. Les balises ne traversent donc jamais le parseur
// Markdown, qui les couperait au premier paragraphe vide.

import { decouperLeCorps } from "@locomotionlab/contenu";
import {
  CarteBillet,
  Note,
  Protocole,
  VersProtocole,
  VersNote,
} from "@locomotionlab/ui/contenu";

import { blocs, parSlug, urlDe } from "@/lib/contenu";
import { amorce } from "@/lib/blog";
import { TYPE_AU_SINGULIER } from "@/lib/blogRegistre";
import { dateLisible } from "@/lib/lisible";
import PostLiveTracking from "@/components/PostLiveTrackingLazy";
import Prose from "./Prose";

// `Replay` et `VersBillet` ne sont pas des blocs : ils ne vont pas dans
// l'index et ne se citent pas. Le premier est là parce qu'une sortie OFF est
// racontée dans un billet et que son replay lui appartient ; le second parce
// qu'une page Aventure renvoie au carnet de bord plutôt que de raconter.
const BALISES = ["Note", "Protocole", "VersProtocole", "VersNote", "Replay", "VersBillet"];

/** Une liste écrite en chaîne séparée par des virgules. */
function liste(valeur) {
  return (valeur ?? "")
    .split(",")
    .map((element) => element.trim())
    .filter(Boolean);
}

// `corps` permet de rendre un MORCEAU du corps de la page — le contenu d'une
// section libre d'aventure, par exemple — avec les mêmes balises que la page
// entière. Sans lui, c'est le corps complet qui est rendu.
export default function Corps({ page, corps: texte, citation, appelDeReference: Ref }) {
  const segments = decouperLeCorps(texte ?? page.corps, BALISES);

  return (
    <>
      {segments.map((segment, rang) => {
        if (segment.type === "texte") {
          return <Prose key={rang} texte={segment.texte} citation={citation} />;
        }

        const { nom, attributs, corps } = segment;

        if (nom === "Replay") {
          return (
            <div key={rang} className="my-8">
              <PostLiveTracking {...attributs} />
            </div>
          );
        }

        // Le billet introuvable arrête le build en nommant le slug fautif :
        // une page Aventure ne doit pas pouvoir renvoyer dans le vide.
        if (nom === "VersBillet") {
          const billet = parSlug("billet", attributs.slug);
          if (!billet) {
            throw new Error(
              `<VersBillet slug="${attributs.slug ?? ""}"> dans ${page.chemin} : aucun billet de ce slug.`,
            );
          }
          const { titre, type, chapeau, date } = billet.frontmatter;
          return (
            <div key={rang} className="my-8">
              <CarteBillet
                url={urlDe(billet)}
                titre={titre}
                surtitre={TYPE_AU_SINGULIER[type]}
                extrait={chapeau && chapeau !== "TODO" ? chapeau : amorce(billet.corps)}
                date={dateLisible(date)}
              />
            </div>
          );
        }

        if (nom === "VersProtocole" || nom === "VersNote") {
          const bloc = blocs.carte(attributs.id, page.chemin);
          const Carte = nom === "VersProtocole" ? VersProtocole : VersNote;
          return (
            <div key={rang} className="my-8">
              <Carte bloc={bloc} />
            </div>
          );
        }

        // Les refs d'un bloc sont numérotées comme celles de la prose : elles
        // entrent dans le même registre, dans l'ordre où on les lit.
        const references = Ref
          ? liste(attributs.refs).map((cle) => <Ref key={cle} cle={cle} />)
          : null;

        if (nom === "Note") {
          return (
            <Note key={rang} id={attributs.id} titre={attributs.titre}>
              <Prose texte={corps} citation={citation} taille="herite" />
            </Note>
          );
        }

        // Le vécu de la séance part dans son encart ; tout le reste du corps
        // reste le protocole, y compris l'objectif long que l'auteur a écrit.
        const paragraphes = corps.split(/\n\s*\n/);
        const sensations = paragraphes.filter((bloc) => /^Sensations\s*:/i.test(bloc.trim()));
        const protocole = paragraphes.filter((bloc) => !/^Sensations\s*:/i.test(bloc.trim()));

        return (
          <Protocole
            key={rang}
            id={attributs.id}
            titre={attributs.titre}
            objectif={attributs.objectif}
            sensations={
              sensations.length > 0 ? (
                <Prose
                  texte={sensations.join("\n\n").replace(/^Sensations\s*:\s*/i, "")}
                  citation={citation}
                  taille="herite"
                />
              ) : undefined
            }
            references={references}
          >
            <Prose texte={protocole.join("\n\n")} citation={citation} taille="herite" />
          </Protocole>
        );
      })}
    </>
  );
}
