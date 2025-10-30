import { visit } from "unist-util-visit";

export default function remarkCitations() {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      const regex = /\{\{cite:([\w-]+)\}\}/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(node.value)) !== null) {
        if (match.index > lastIndex)
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) });

        parts.push({
          type: "citation",
          data: { hName: "citation", hProperties: { id: match[1] } },
        });

        lastIndex = match.index + match[0].length;
      }

      if (parts.length) {
        if (lastIndex < node.value.length)
          parts.push({ type: "text", value: node.value.slice(lastIndex) });
        parent.children.splice(index, 1, ...parts);
      }
    });
  };
}
