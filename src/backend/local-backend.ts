import Dexie, { type Table } from "dexie";
import type { TodoNode } from "../domain/nodes";
import type { TodoBackend } from "./types";

class CascadeTodoDb extends Dexie {
  nodes!: Table<TodoNode, string>;

  constructor() {
    super("cascade-todo");
    this.version(1).stores({
      nodes: "id, parentId, order, status, updatedAt",
    });
  }
}

export const db = new CascadeTodoDb();

export class LocalBackend implements TodoBackend {
  readonly metadata = {
    type: "local" as const,
    label: "Local browser storage",
    needsAuth: false,
  };

  async loadNodes() {
    return db.nodes.orderBy("order").toArray();
  }

  async saveNodes(nodes: TodoNode[]) {
    await db.transaction("rw", db.nodes, async () => {
      await db.nodes.clear();
      await db.nodes.bulkPut(nodes);
    });
  }
}
