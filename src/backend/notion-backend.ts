import type { NodeStatus, TodoNode } from "../domain/nodes";
import type { BackendSettings, TodoBackend } from "./types";

type NotionText = {
  plain_text?: string;
};

type NotionPage = {
  id: string;
  properties: Record<string, unknown>;
};

type NotionDatabase = {
  id: string;
  title?: NotionText[];
};

type NotionQueryResponse = {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionSearchResponse = {
  results: NotionDatabase[];
  has_more?: boolean;
  next_cursor?: string | null;
};

export type NotionDatabaseOption = {
  id: string;
  title: string;
};

const PROPERTY = {
  title: "Name",
  nodeId: "Node ID",
  type: "Type",
  status: "Task Status",
  parentId: "Parent ID",
  order: "Order",
  note: "Description",
  dependsOnIds: "Depends On IDs",
  comments: "Comments",
  collapsed: "Collapsed",
  createdAt: "Created At",
  updatedAt: "Updated At",
  completedAt: "Completed At",
} as const;

const NOTION_API_BASE_URL = import.meta.env.DEV ? "/notion-api" : "https://api.notion.com/v1";

function getPlainText(property: unknown) {
  if (!property || typeof property !== "object") return "";
  const record = property as Record<string, unknown>;
  const texts = (record.rich_text ?? record.title) as NotionText[] | undefined;
  return texts?.map((text) => text.plain_text ?? "").join("") ?? "";
}

function getSelectName(property: unknown) {
  if (!property || typeof property !== "object") return undefined;
  return ((property as Record<string, { name?: string } | undefined>).select)?.name;
}

function getNumber(property: unknown) {
  if (!property || typeof property !== "object") return 0;
  return ((property as Record<string, number | null>).number) ?? 0;
}

function getCheckbox(property: unknown) {
  if (!property || typeof property !== "object") return false;
  return Boolean((property as Record<string, boolean | undefined>).checkbox);
}

function getDate(property: unknown) {
  if (!property || typeof property !== "object") return undefined;
  const date = (property as Record<string, { start?: string } | null>).date;
  return date?.start;
}

function parseJsonList(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function textProperty(content: string) {
  return {
    rich_text: content ? [{ type: "text", text: { content } }] : [],
  };
}

function titleProperty(content: string) {
  return {
    title: [{ type: "text", text: { content: content || "Untitled" } }],
  };
}

function dateProperty(value?: string) {
  return value ? { date: { start: value } } : { date: null };
}

function mapPageToNode(page: NotionPage): TodoNode {
  const properties = page.properties;
  const nodeId = getPlainText(properties[PROPERTY.nodeId]) || page.id;
  const status = getSelectName(properties[PROPERTY.status]) as NodeStatus | undefined;
  return {
    id: nodeId,
    type: "task",
    title: getPlainText(properties[PROPERTY.title]) || "Untitled",
    note: getPlainText(properties[PROPERTY.note]) || undefined,
    parentId: getPlainText(properties[PROPERTY.parentId]) || null,
    order: getNumber(properties[PROPERTY.order]),
    status: status ?? "todo",
    dependsOnIds: parseJsonList(getPlainText(properties[PROPERTY.dependsOnIds])),
    comments: parseJsonList(getPlainText(properties[PROPERTY.comments])),
    collapsed: getCheckbox(properties[PROPERTY.collapsed]),
    createdAt: getDate(properties[PROPERTY.createdAt]) ?? new Date().toISOString(),
    updatedAt: getDate(properties[PROPERTY.updatedAt]) ?? new Date().toISOString(),
    completedAt: getDate(properties[PROPERTY.completedAt]),
  };
}

function mapNodeToProperties(node: TodoNode) {
  return {
    [PROPERTY.title]: titleProperty(node.title),
    [PROPERTY.nodeId]: textProperty(node.id),
    [PROPERTY.type]: { select: { name: node.type } },
    [PROPERTY.status]: { select: { name: node.status } },
    [PROPERTY.parentId]: textProperty(node.parentId ?? ""),
    [PROPERTY.order]: { number: node.order },
    [PROPERTY.note]: textProperty(node.note ?? ""),
    [PROPERTY.dependsOnIds]: textProperty(JSON.stringify(node.dependsOnIds)),
    [PROPERTY.comments]: textProperty(JSON.stringify(node.comments ?? [])),
    [PROPERTY.collapsed]: { checkbox: Boolean(node.collapsed) },
    [PROPERTY.createdAt]: dateProperty(node.createdAt),
    [PROPERTY.updatedAt]: dateProperty(node.updatedAt),
    [PROPERTY.completedAt]: dateProperty(node.completedAt),
  };
}

export class NotionBackend implements TodoBackend {
  readonly metadata = {
    type: "notion" as const,
    label: "Notion",
    needsAuth: true,
  };

  constructor(private readonly settings: BackendSettings) {}

  async loadNodes() {
    const pages = await this.queryAllPages();
    return pages.map(mapPageToNode).sort((a, b) => a.order - b.order);
  }

  async saveNodes(nodes: TodoNode[]) {
    const existingPages = await this.queryAllPages();
    const pageByNodeId = new Map(
      existingPages.map((page) => [getPlainText(page.properties[PROPERTY.nodeId]) || page.id, page]),
    );
    const nodeIds = new Set(nodes.map((node) => node.id));

    for (const node of nodes) {
      const existing = pageByNodeId.get(node.id);
      if (existing) {
        await this.upsertExistingPage(existing.id, node);
      } else {
        await this.request("/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { database_id: this.databaseId },
            properties: mapNodeToProperties(node),
          }),
        });
      }
    }

    for (const [nodeId, page] of pageByNodeId) {
      if (!nodeIds.has(nodeId)) {
        await this.request(`/pages/${page.id}`, {
          method: "PATCH",
          body: JSON.stringify({ archived: true }),
        });
      }
    }
  }

  private async upsertExistingPage(pageId: string, node: TodoNode) {
    const properties = mapNodeToProperties(node);
    try {
      await this.updatePage(pageId, { properties, archived: false });
      return;
    } catch (error) {
      if (!isArchivedEditError(error)) throw error;
    }

    try {
      await this.updatePage(pageId, { archived: false });
      await this.updatePage(pageId, { properties });
      return;
    } catch (error) {
      console.error("Notion page restore failed, creating replacement row", { pageId, error });
    }

    await this.request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties,
      }),
    });
  }

  private async updatePage(pageId: string, body: Record<string, unknown>) {
    await this.request(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async listDatabases(query = ""): Promise<NotionDatabaseOption[]> {
    const databases: NotionDatabaseOption[] = [];
    let start_cursor: string | undefined;

    do {
      const response = await this.request<NotionSearchResponse>("/search", {
        method: "POST",
        body: JSON.stringify({
          query: query.trim() || undefined,
          filter: { value: "database", property: "object" },
          page_size: 50,
          start_cursor,
        }),
      });
      databases.push(
        ...response.results.map((database) => ({
          id: database.id,
          title: database.title?.map((text) => text.plain_text ?? "").join("") || "Untitled database",
        })),
      );
      start_cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined;
    } while (start_cursor);

    return databases;
  }

  async createCascadeDatabase(parentPageId: string, title = "Cascade Todo") {
    const parentId = parentPageId.trim();
    if (!parentId) throw new Error("A Notion parent page ID is required to create the database.");

    const response = await this.request<NotionDatabase>("/databases", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentId },
        title: [{ type: "text", text: { content: title } }],
        properties: {
          [PROPERTY.title]: { title: {} },
          [PROPERTY.nodeId]: { rich_text: {} },
          [PROPERTY.type]: {
            select: { options: [{ name: "task", color: "blue" }] },
          },
          [PROPERTY.status]: {
            select: {
              options: [
                { name: "todo", color: "gray" },
                { name: "in_progress", color: "blue" },
                { name: "done", color: "green" },
                { name: "blocked", color: "yellow" },
                { name: "issue", color: "red" },
              ],
            },
          },
          [PROPERTY.parentId]: { rich_text: {} },
          [PROPERTY.order]: { number: { format: "number" } },
          [PROPERTY.note]: { rich_text: {} },
          [PROPERTY.dependsOnIds]: { rich_text: {} },
          [PROPERTY.comments]: { rich_text: {} },
          [PROPERTY.collapsed]: { checkbox: {} },
          [PROPERTY.createdAt]: { date: {} },
          [PROPERTY.updatedAt]: { date: {} },
          [PROPERTY.completedAt]: { date: {} },
        },
      }),
    });

    return {
      id: response.id,
      title: response.title?.map((text) => text.plain_text ?? "").join("") || title,
    };
  }

  private get token() {
    const token = this.settings.auth?.trim();
    if (!token) throw new Error("Notion backend is missing an integration token.");
    return token;
  }

  private get databaseId() {
    const databaseId = this.settings.notion_database_id?.trim();
    if (!databaseId) throw new Error("Notion backend is missing a database ID.");
    return databaseId;
  }

  private async queryAllPages() {
    const pages: NotionPage[] = [];
    let start_cursor: string | undefined;

    do {
      const response = await this.request<NotionQueryResponse>(`/databases/${this.databaseId}/query`, {
        method: "POST",
        body: JSON.stringify(start_cursor ? { start_cursor } : {}),
      });
      pages.push(...response.results);
      start_cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined;
    } while (start_cursor);

    return pages;
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Notion-Version": this.settings.notion_api_version || "2022-06-28",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion request failed (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
  }
}

function isArchivedEditError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("archived") && message.includes("can't edit block");
}
