import type { BackendSettings, BackendType } from "./types";

const DEFAULT_BACKEND_TYPE: BackendType = "local";
const DEFAULT_NOTION_API_VERSION = "2022-06-28";
const SETTINGS_TRANSFER_VERSION = 1;

const STORAGE_KEYS = {
  backendType: "cascade.backend_type",
  auth: "cascade.backend.auth",
  notionDatabaseId: "cascade.backend.notion.database_id",
  notionApiVersion: "cascade.backend.notion.api_version",
} as const;

function cleanBackendType(value: string | null): BackendType {
  return value === "notion" ? "notion" : DEFAULT_BACKEND_TYPE;
}

export function loadBackendSettings(): BackendSettings {
  return {
    backend_type: cleanBackendType(localStorage.getItem(STORAGE_KEYS.backendType)),
    auth: localStorage.getItem(STORAGE_KEYS.auth) ?? undefined,
    notion_database_id: localStorage.getItem(STORAGE_KEYS.notionDatabaseId) ?? undefined,
    notion_api_version:
      localStorage.getItem(STORAGE_KEYS.notionApiVersion) ?? DEFAULT_NOTION_API_VERSION,
  };
}

export function saveBackendSettings(settings: BackendSettings) {
  localStorage.setItem(STORAGE_KEYS.backendType, settings.backend_type);

  if (settings.auth) localStorage.setItem(STORAGE_KEYS.auth, settings.auth);
  else localStorage.removeItem(STORAGE_KEYS.auth);

  if (settings.notion_database_id) {
    localStorage.setItem(STORAGE_KEYS.notionDatabaseId, settings.notion_database_id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.notionDatabaseId);
  }

  localStorage.setItem(
    STORAGE_KEYS.notionApiVersion,
    settings.notion_api_version || DEFAULT_NOTION_API_VERSION,
  );
}

export function exportBackendSettingsPayload(settings = loadBackendSettings()) {
  return JSON.stringify({
    app: "cascade-todo",
    kind: "backend-settings",
    version: SETTINGS_TRANSFER_VERSION,
    settings,
  });
}

export function importBackendSettingsPayload(payload: string): BackendSettings {
  const parsed = JSON.parse(payload) as {
    app?: string;
    kind?: string;
    version?: number;
    settings?: BackendSettings;
  };

  if (
    parsed.app !== "cascade-todo" ||
    parsed.kind !== "backend-settings" ||
    parsed.version !== SETTINGS_TRANSFER_VERSION ||
    !parsed.settings
  ) {
    throw new Error("This QR code does not contain Cascade Todo backend settings.");
  }

  const settings = parsed.settings;
  return {
    backend_type: cleanBackendType(settings.backend_type),
    auth: settings.auth,
    notion_database_id: settings.notion_database_id,
    notion_api_version: settings.notion_api_version || DEFAULT_NOTION_API_VERSION,
  };
}

export const backendSettingsStorageKeys = STORAGE_KEYS;
