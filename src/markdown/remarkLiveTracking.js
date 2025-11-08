import { visit } from "unist-util-visit";

/**
 * Remplace <livetracking /> par un nœud Markdown standard
 * que ReactMarkdown pourra ensuite interpréter comme bloc.
 */
export default function remarkLiveTracking() {
  return (tree) => {
    visit(tree, "html", (node, index, parent) => {
      if (!node.value) return;
      const value = node.value.trim();
      if (value === "<livetracking />" || value === "<livetracking>") {
        parent.children[index] = {
          type: "paragraph",
          children: [{ type: "text", value: "[[LIVE_TRACKING_BLOCK]]" }],
        };
      }
    });
  };
}
