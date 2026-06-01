import { create } from "zustand";
import { createNode, statusCycle, touch, type NodeStatus, type TodoNode } from "../domain/nodes";
import { getChildren, isDescendant, nextOrder, normalizeSiblingOrder } from "../domain/tree";
import { getBackend } from "../backend/get-backend";
import { seedNodes } from "./seed";

type TodoState = {
  nodes: TodoNode[];
  activeNodeId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addNode: (title: string, parentId?: string | null) => void;
  deleteNode: (id: string) => void;
  updateTitle: (id: string, title: string) => void;
  updateNote: (id: string, note: string) => void;
  addComment: (id: string, comment: string) => void;
  cycleStatus: (id: string) => void;
  setStatus: (id: string, status: NodeStatus) => void;
  toggleCollapse: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  moveAfter: (id: string, targetId: string) => void;
  moveAsChild: (id: string, parentId: string) => void;
  moveToRoot: (id: string) => void;
  setActive: (id: string | null) => void;
  addDependency: (id: string, dependencyId: string) => void;
  addDependencies: (id: string, dependencyIds: string[]) => void;
  removeDependency: (id: string, dependencyId: string) => void;
  replaceAllNodes: (nodes: TodoNode[]) => void;
};

function persist(nodes: TodoNode[]) {
  void getBackend().saveNodes(nodes).catch((error) => {
    console.error("Backend save failed", error);
  });
}

function replaceNode(nodes: TodoNode[], id: string, updater: (node: TodoNode) => TodoNode) {
  return nodes.map((node) => (node.id === id ? updater(node) : node));
}

export const useTodoStore = create<TodoState>((set, get) => ({
  nodes: [],
  activeNodeId: null,
  hydrated: false,

  hydrate: async () => {
    const backend = getBackend();
    try {
      const stored = await backend.loadNodes();
      const nodes = (stored.length ? stored : seedNodes).map((node) => ({
        ...node,
        type: "task" as const,
      }));
      if (!stored.length) await backend.saveNodes(nodes);
      set({ nodes, hydrated: true });
    } catch (error) {
      console.error("Backend load failed", error);
      set({
        nodes: get().nodes.length ? get().nodes : seedNodes.map((node) => ({ ...node, type: "task" as const })),
        hydrated: true,
      });
    }
  },

  addNode: (title, parentId = null) => {
    const node = createNode({
      title,
      parentId,
      type: "task",
      order: nextOrder(parentId, get().nodes),
    });
    const nodes = parentId
      ? [
          ...replaceNode(get().nodes, parentId, (parent) => touch({ ...parent, collapsed: false })),
          node,
        ]
      : [...get().nodes, node];
    persist(nodes);
    set({ nodes, activeNodeId: node.id });
  },

  deleteNode: (id) => {
    const original = get().nodes;
    const toDelete = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of original) {
        if (node.parentId && toDelete.has(node.parentId) && !toDelete.has(node.id)) {
          toDelete.add(node.id);
          grew = true;
        }
      }
    }

    const nodes = original
      .filter((node) => !toDelete.has(node.id))
      .map((node) =>
        touch({
          ...node,
          dependsOnIds: node.dependsOnIds.filter((dependencyId) => !toDelete.has(dependencyId)),
        }),
      );
    persist(nodes);
    set({ nodes, activeNodeId: null });
  },

  updateTitle: (id, title) => {
    const nodes = replaceNode(get().nodes, id, (node) => touch({ ...node, title: title.trim() || "Untitled" }));
    persist(nodes);
    set({ nodes });
  },

  updateNote: (id, note) => {
    const nextNote = note.trim();
    const nodes = replaceNode(get().nodes, id, (node) =>
      touch({ ...node, note: nextNote ? nextNote : undefined }),
    );
    persist(nodes);
    set({ nodes });
  },

  addComment: (id, comment) => {
    const nextComment = comment.trim();
    if (!nextComment) return;
    const nodes = replaceNode(get().nodes, id, (node) =>
      touch({ ...node, comments: [...(node.comments ?? []), nextComment] }),
    );
    persist(nodes);
    set({ nodes });
  },

  cycleStatus: (id) => {
    const nodes = replaceNode(get().nodes, id, (node) => {
      const next = statusCycle[(statusCycle.indexOf(node.status) + 1) % statusCycle.length];
      return touch({
        ...node,
        status: next,
        completedAt: next === "done" ? new Date().toISOString() : undefined,
      });
    });
    persist(nodes);
    set({ nodes });
  },

  setStatus: (id, status) => {
    const nodes = replaceNode(get().nodes, id, (node) =>
      touch({ ...node, status, completedAt: status === "done" ? new Date().toISOString() : undefined }),
    );
    persist(nodes);
    set({ nodes });
  },

  toggleCollapse: (id) => {
    const nodes = replaceNode(get().nodes, id, (node) => touch({ ...node, collapsed: !node.collapsed }));
    persist(nodes);
    set({ nodes });
  },

  expandAll: () => {
    const nodes = get().nodes.map((node) => touch({ ...node, collapsed: false }));
    persist(nodes);
    set({ nodes });
  },

  collapseAll: () => {
    const parentIds = new Set(get().nodes.map((node) => node.parentId).filter(Boolean));
    const nodes = get().nodes.map((node) =>
      parentIds.has(node.id) ? touch({ ...node, collapsed: true }) : node,
    );
    persist(nodes);
    set({ nodes });
  },

  moveUp: (id) => {
    const original = get().nodes;
    const node = original.find((candidate) => candidate.id === id);
    if (!node) return;
    const siblings = getChildren(node.parentId, original);
    const index = siblings.findIndex((candidate) => candidate.id === id);
    if (index <= 0) return;
    [siblings[index - 1].order, siblings[index].order] = [siblings[index].order, siblings[index - 1].order];
    const orders = new Map(siblings.map((sibling) => [sibling.id, sibling.order]));
    const nodes = original.map((candidate) =>
      orders.has(candidate.id) ? touch({ ...candidate, order: orders.get(candidate.id)! }) : candidate,
    );
    persist(nodes);
    set({ nodes });
  },

  moveDown: (id) => {
    const original = get().nodes;
    const node = original.find((candidate) => candidate.id === id);
    if (!node) return;
    const siblings = getChildren(node.parentId, original);
    const index = siblings.findIndex((candidate) => candidate.id === id);
    if (index < 0 || index >= siblings.length - 1) return;
    [siblings[index + 1].order, siblings[index].order] = [siblings[index].order, siblings[index + 1].order];
    const orders = new Map(siblings.map((sibling) => [sibling.id, sibling.order]));
    const nodes = original.map((candidate) =>
      orders.has(candidate.id) ? touch({ ...candidate, order: orders.get(candidate.id)! }) : candidate,
    );
    persist(nodes);
    set({ nodes });
  },

  moveAfter: (id, targetId) => {
    const original = get().nodes;
    const node = original.find((candidate) => candidate.id === id);
    const target = original.find((candidate) => candidate.id === targetId);
    if (!node || !target || node.id === target.id || isDescendant(target.id, node.id, original)) return;

    const targetSiblings = getChildren(target.parentId, original).filter((candidate) => candidate.id !== node.id);
    const targetIndex = targetSiblings.findIndex((candidate) => candidate.id === target.id);
    if (targetIndex < 0) return;

    const reorderedSiblings = [
      ...targetSiblings.slice(0, targetIndex + 1),
      { ...node, parentId: target.parentId },
      ...targetSiblings.slice(targetIndex + 1),
    ];
    const orderById = new Map(reorderedSiblings.map((sibling, index) => [sibling.id, index]));

    let nodes = original.map((candidate) =>
      orderById.has(candidate.id) && (candidate.parentId === target.parentId || candidate.id === node.id)
        ? touch({ ...candidate, parentId: candidate.id === node.id ? target.parentId : candidate.parentId, order: orderById.get(candidate.id)! })
        : candidate,
    );
    if (node.parentId !== target.parentId) {
      nodes = normalizeSiblingOrder(nodes, node.parentId);
    }
    persist(nodes);
    set({ nodes, activeNodeId: node.id });
  },

  moveAsChild: (id, parentId) => {
    const original = get().nodes;
    const node = original.find((candidate) => candidate.id === id);
    const parent = original.find((candidate) => candidate.id === parentId);
    if (!node || !parent || node.id === parent.id || isDescendant(parent.id, node.id, original)) return;

    let nodes = replaceNode(original, parent.id, (candidate) => touch({ ...candidate, collapsed: false }));
    nodes = replaceNode(nodes, node.id, (candidate) =>
      touch({ ...candidate, parentId: parent.id, order: nextOrder(parent.id, original) }),
    );
    if (node.parentId !== parent.id) {
      nodes = normalizeSiblingOrder(nodes, node.parentId);
    }
    persist(nodes);
    set({ nodes, activeNodeId: node.id });
  },

  moveToRoot: (id) => {
    const original = get().nodes;
    const node = original.find((candidate) => candidate.id === id);
    if (!node) return;
    let nodes = replaceNode(original, node.id, (candidate) =>
      touch({ ...candidate, parentId: null, order: nextOrder(null, original) }),
    );
    if (node.parentId !== null) {
      nodes = normalizeSiblingOrder(nodes, node.parentId);
    }
    persist(nodes);
    set({ nodes, activeNodeId: node.id });
  },

  setActive: (id) => set({ activeNodeId: id }),

  addDependency: (id, dependencyId) => {
    const original = get().nodes;
    if (id === dependencyId || isDescendant(dependencyId, id, original)) return;
    const nodes = replaceNode(original, id, (node) =>
      node.dependsOnIds.includes(dependencyId)
        ? node
        : touch({ ...node, dependsOnIds: [...node.dependsOnIds, dependencyId] }),
    );
    persist(nodes);
    set({ nodes });
  },

  addDependencies: (id, dependencyIds) => {
    const original = get().nodes;
    const node = original.find((candidate) => candidate.id === id);
    if (!node) return;
    const validIds = dependencyIds.filter(
      (dependencyId) =>
        dependencyId !== id &&
        !node.dependsOnIds.includes(dependencyId) &&
        !isDescendant(dependencyId, id, original),
    );
    if (!validIds.length) return;
    const nodes = replaceNode(original, id, (candidate) =>
      touch({ ...candidate, dependsOnIds: [...candidate.dependsOnIds, ...validIds] }),
    );
    persist(nodes);
    set({ nodes });
  },

  removeDependency: (id, dependencyId) => {
    const nodes = replaceNode(get().nodes, id, (node) =>
      touch({ ...node, dependsOnIds: node.dependsOnIds.filter((dep) => dep !== dependencyId) }),
    );
    persist(nodes);
    set({ nodes });
  },

  replaceAllNodes: (nodes) => {
    persist(nodes);
    set({ nodes, activeNodeId: null, hydrated: true });
  },
}));
