import { db, LocalBackend } from "../backend/local-backend";

const localBackend = new LocalBackend();

export { db };

export function loadNodes() {
  return localBackend.loadNodes();
}

export function saveNodes(nodes: Parameters<LocalBackend["saveNodes"]>[0]) {
  return localBackend.saveNodes(nodes);
}
