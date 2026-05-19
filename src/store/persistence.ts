import Dexie, { type Table } from "dexie";
import type { TodoNode } from "../domain/nodes";

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

export async function loadNodes() {
  return db.nodes.orderBy("order").toArray();
}

export async function saveNodes(nodes: TodoNode[]) {
  await db.transaction("rw", db.nodes, async () => {
    await db.nodes.clear();
    await db.nodes.bulkPut(nodes);
  });
}
