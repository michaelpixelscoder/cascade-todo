import type { TodoNode } from "./nodes";

export function getDependencyState(node: TodoNode, allNodes: TodoNode[]) {
  const deps = node.dependsOnIds
    .map((id) => allNodes.find((candidate) => candidate.id === id))
    .filter((dep): dep is TodoNode => Boolean(dep));

  const incompleteDeps = deps.filter((dep) => dep.status !== "done");

  return {
    dependencies: deps,
    incompleteDeps,
    isBlockedByDependency: incompleteDeps.length > 0,
  };
}

export function getDependents(nodeId: string, allNodes: TodoNode[]) {
  return allNodes.filter((node) => node.dependsOnIds.includes(nodeId));
}
