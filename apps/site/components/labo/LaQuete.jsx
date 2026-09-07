// components/labo/LaQuete.jsx
//
// LA QUÊTE : pourquoi la robustesse plutôt que la performance.
//
// Source unique du texte : la page /quete et la section « La quête » du Labo
// rendent toutes deux ce composant. Les `id` des parties sont la seule chose
// qu'il déclare en plus du texte — le sommaire du Labo les lit ici.

import { Accroche } from "@locomotionlab/ui/contenu";

/** Les parties, dans l'ordre : le sommaire du Labo est dérivé de cette liste. */
export const PARTIES = [
  { id: "q-constat", titre: "Le constat" },
  { id: "q-robustesse", titre: "La robustesse" },
  { id: "q-methode", titre: "La méthode" },
  { id: "q-labo", titre: "Un laboratoire accessible à tou·te·s" },
];

export const EXERGUE = "Pourquoi la robustesse plutôt que la performance.";

function Partie({ id, titre, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h3 className="m-0 mb-2.5 font-heading text-xl font-bold leading-snug">{titre}</h3>
      <p className="m-0">{children}</p>
    </section>
  );
}

export default function LaQuete() {
  return (
    <div className="max-w-[38em] space-y-9 font-lora text-lecture leading-loose text-brand-ink hyphens-auto [text-wrap:pretty]">
      <Partie {...PARTIES[0]}>
        Nos corps ont été façonnés par des millions d&rsquo;années de marche, de course, de
        portage et d&rsquo;inconfort, et nous les faisons vivre assis, au chaud l&rsquo;hiver,
        sous la clim l&rsquo;été, suralimentés et sous-stimulés. Cette discordance évolutive
        entre ce pour quoi nous sommes construits et ce que nous vivons a un coût : des
        organismes fragiles, usés avant même d&rsquo;avoir servi.
      </Partie>

      <Partie {...PARTIES[1]}>
        L&rsquo;évolution des êtres vivants, végétaux comme animaux, s&rsquo;est toujours
        déroulée dans l&rsquo;incertitude : manque de ressources, nouveaux prédateurs,
        températures inhabituelles, bactéries ou virus mortels... Cette instabilité permanente a
        forgé des organismes à la fois adaptés, adaptables et profondément résilients. Cette
        caractéristique a un nom : la robustesse, un concept que le biologiste Olivier Hamant a
        remis au cœur du débat (<em>Antidote au culte de la performance</em>, 2023), et qui,
        appliqué à la physiologie humaine, est le cœur battant du labo. Elle s&rsquo;oppose par
        essence à la performance à tout prix, cette optimisation perpétuelle qui régit le monde
        humain moderne et le rend incapable de faire face à l&rsquo;incertitude. La robustesse
        n&rsquo;est pourtant pas l&rsquo;ennemie de la performance. Le guépard vit en économie
        permanente mais reste capable de pointes à plus de 100 km/h pour chasser quand sa survie
        l&rsquo;exige. L&rsquo;Humain peut élever sa température corporelle à plus de 40°C
        annihiler une infection ou virus. Mais perdurer trop longtemps dans ces modes de
        performance conduit à la mort, par hyperthermie pour le guépard, et par dénaturation des
        enzymes pour l&rsquo;Humain. Voici l&rsquo;essence de la robustesse : construire un
        système solide, où chaque qualité est entretenue, et où la performance peut
        s&rsquo;exprimer ponctuellement, sans jamais hypothéquer la globalité du système.
      </Partie>

      <Partie {...PARTIES[2]}>
        La robustesse se développe par essai-erreur. Comprendre, explorer. Explorer, comprendre.
        Une boucle de rétroaction permanente : décortiquer les concepts, lire les études,
        expérimenter en situation réelle, douter, découvrir des pratiques de manière fortuite,
        les expliquer a posteriori… C&rsquo;est la philosophie qui guide le développement de ce
        laboratoire théorico-expérimental, dans toutes ses dimensions.
      </Partie>

      <Partie {...PARTIES[3]}>
        La vocation du Locomotion Lab est d&rsquo;explorer et d&rsquo;ouvrir des voies méconnues
        mais profondément engrammées dans l&rsquo;ADN humain, et de les rendre accessibles à
        tou·te·s pour retrouver une certaine concordance évolutive. La connaissance n&rsquo;a
        jamais été aussi abondante, et il convient plus que jamais de se réapproprier sa santé et
        son bien-être pour faire face aux incertitudes de demain. Redevenir robustes côte à côte,
        main dans la main. Car seul on va plus vite, mais ensemble on va plus loin. Et
        c&rsquo;est peu dire que cet adage est profondément robuste.
      </Partie>
    </div>
  );
}

/** L'exergue de la quête, en romain maigre derrière un filet ocre. */
export function ExergueDeLaQuete() {
  return (
    <div className="border-l-[3px] border-brand-accent pl-4.5">
      <Accroche>{EXERGUE}</Accroche>
    </div>
  );
}
