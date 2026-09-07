// components/contenu/Corps.jsx
//
// LE CORPS D'UNE PAGE DE CONTENU : la prose et ses blocs.
//
// Le découpage vient de @locomotionlab/contenu, le même module qui construit
// l'index des blocs : ce que le build a relevé est exactement ce que la page
// rend, aux mêmes endroits. Les balises ne traversent donc jamais le parseur
// Markdown, qui les couperait au premier paragraphe vide.

import { decouperLeCorps } from "@locomotionlab/contenu";
import { Note, Protocole, VersProtocole, VersNote } from "@locomotionlab/ui/contenu";

import { blocs } from "@/lib/contenu";
import Prose from "./Prose";

const BALISES = ["Note", "Protocole", "VersProtocole", "VersNote"];

/** Une liste écrite en chaîne séparée par des virgules. */
function liste(valeur) {
  return (valeur ?? "")
    .split(",")
    .map((element) => element.trim())
    .filter(Boolean);
}

export default function Corps({ page, citation, appelDeReference: Ref }) {
  const segments = decouperLeCorps(page.corps, BALISES);

  return (
    <>
      {segments.map((segment, rang) => {
        if (segment.type === "texte") {
          return <Prose key={rang} texte={segment.texte} citation={citation} />;
        }

        const { nom, attributs, corps } = segment;

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
            statut={attributs.statut}
            n={Number(attributs.n)}
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
