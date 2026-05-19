import { useMemo } from "react";
import { getDependencyState } from "../../domain/cascade";
import type { TodoNode } from "../../domain/nodes";
import { flattenTree } from "../../domain/tree";
import { useTodoStore } from "../../store/todo-store";

type DependencyWarningProps = {
  node: TodoNode;
  nodes: TodoNode[];
};

export function DependencyWarning({ node, nodes }: DependencyWarningProps) {
  const moveAfter = useTodoStore((state) => state.moveAfter);
  const state = useMemo(() => getDependencyState(node, nodes), [node, nodes]);
  const orderIssue = useMemo(() => {
    const visibleItems = flattenTree(nodes);
    const visibleIndex = new Map(visibleItems.map((item, index) => [item.node.id, index]));
    const nodeIndex = visibleIndex.get(node.id);
    if (nodeIndex === undefined) return null;

    const misplacedDeps = state.dependencies
      .map((dep) => ({ dep, index: visibleIndex.get(dep.id) }))
      .filter((item): item is { dep: TodoNode; index: number } => item.index !== undefined && item.index > nodeIndex)
      .sort((a, b) => b.index - a.index);

    return misplacedDeps[0]?.dep ?? null;
  }, [node.id, nodes, state.dependencies]);

  if (!orderIssue) return null;

  return (
    <button
      className="resolve-button"
      onClick={(event) => {
        event.stopPropagation();
        moveAfter(node.id, orderIssue.id);
        window.requestAnimationFrame(() => {
          document.querySelector(`[data-node-id="${node.id}"]`)?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
        });
      }}
      title={`Move after ${orderIssue.title}`}
    >
      Fix order
    </button>
  );
}
