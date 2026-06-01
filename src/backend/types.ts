import type { TodoNode } from "../domain/nodes";

export type BackendType = "local" | "notion";

export type BackendSettings = {
  backend_type: BackendType;
  auth?: string;
  notion_database_id?: string;
  notion_api_version?: string;
};

export type BackendMetadata = {
  type: BackendType;
  label: string;
  needsAuth: boolean;
};

export interface TodoBackend {
  readonly metadata: BackendMetadata;
  loadNodes(): Promise<TodoNode[]>;
  saveNodes(nodes: TodoNode[]): Promise<void>;
}
