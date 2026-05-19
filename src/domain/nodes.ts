export type NodeType = "task";
export type NodeStatus = "todo" | "in_progress" | "done" | "blocked" | "issue";

export type TodoNode = {
  id: string;
  type: NodeType;
  title: string;
  note?: string;
  parentId: string | null;
  order: number;
  status: NodeStatus;
  dependsOnIds: string[];
  comments?: string[];
  collapsed?: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export const statusCycle: NodeStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "issue",
  "done",
];

export function createNode(input: {
  title: string;
  type?: NodeType;
  parentId?: string | null;
  order: number;
  status?: NodeStatus;
  note?: string;
  dependsOnIds?: string[];
}): TodoNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: input.type ?? "task",
    title: input.title.trim() || "Untitled",
    note: input.note,
    parentId: input.parentId ?? null,
    order: input.order,
    status: input.status ?? "todo",
    dependsOnIds: input.dependsOnIds ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function touch(node: TodoNode): TodoNode {
  return { ...node, updatedAt: new Date().toISOString() };
}
