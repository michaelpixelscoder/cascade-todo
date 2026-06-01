import { LocalBackend } from "./local-backend";
import { NotionBackend } from "./notion-backend";
import { loadBackendSettings } from "./settings";
import type { TodoBackend } from "./types";

export function getBackend(): TodoBackend {
  const settings = loadBackendSettings();
  if (settings.backend_type === "notion") {
    return new NotionBackend(settings);
  }
  return new LocalBackend();
}
