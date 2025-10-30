import bibliography from "../content/bibliography.json";
import Tooltip from "./Tooltip";

export default function Citation({ id, children }) {
  const ref = bibliography[id];

  if (!ref) {
    console.warn(`Référence ${id} non trouvée dans bibliography.json`);
    return <span>{children || id}</span>;
  }

  // Construction automatique du texte à afficher dans le tooltip
  const formatted = [
    `${ref.author} (${ref.year})`,
    ref.title ? `${ref.title}` : "",
    ref.journal
      ? `${ref.journal}${ref.volume ? `, ${ref.volume}` : ""}${
          ref.pages ? `, ${ref.pages}` : ""
        }.`
      : ref.publisher
      ? `${ref.publisher}.`
      : "",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Tooltip text={formatted} link={ref.link}>
      {children || `${ref.author.split(" ").slice(-1)[0]}, ${ref.year}`}
    </Tooltip>
  );
}
