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

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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
    id: createId(),
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
