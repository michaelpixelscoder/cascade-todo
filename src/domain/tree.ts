import type { TodoNode } from "./nodes";

export type TreeItem = {
  node: TodoNode;
  depth: number;
  hasChildren: boolean;
};

export function getChildren(parentId: string | null, nodes: TodoNode[]) {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function flattenTree(nodes: TodoNode[]) {
  const result: TreeItem[] = [];

  function visit(parentId: string | null, depth: number) {
    for (const node of getChildren(parentId, nodes)) {
      const children = getChildren(node.id, nodes);
      result.push({ node, depth, hasChildren: children.length > 0 });
      if (!node.collapsed) {
        visit(node.id, depth + 1);
      }
    }
  }

  visit(null, 0);
  return result;
}

export function nextOrder(parentId: string | null, nodes: TodoNode[]) {
  const siblings = getChildren(parentId, nodes);
  return siblings.length ? Math.max(...siblings.map((node) => node.order)) + 1 : 0;
}

export function normalizeSiblingOrder(nodes: TodoNode[], parentId: string | null) {
  const siblings = getChildren(parentId, nodes);
  const byId = new Map(siblings.map((node, index) => [node.id, index]));
  return nodes.map((node) =>
    node.parentId === parentId && byId.has(node.id)
      ? { ...node, order: byId.get(node.id)! }
      : node,
  );
}

export function isDescendant(nodeId: string, possibleAncestorId: string, nodes: TodoNode[]) {
  let current = nodes.find((node) => node.id === nodeId);
  while (current?.parentId) {
    if (current.parentId === possibleAncestorId) return true;
    current = nodes.find((node) => node.id === current?.parentId);
  }
  return false;
}
