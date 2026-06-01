import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Camera,
  Database,
  ExternalLink,
  Maximize2,
  Loader2,
  Minus,
  LogIn,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import type { TodoNode } from "../../domain/nodes";
import { NotionBackend, type NotionDatabaseOption } from "../../backend/notion-backend";
import {
  exportBackendSettingsPayload,
  importBackendSettingsPayload,
  loadBackendSettings,
  saveBackendSettings,
} from "../../backend/settings";
import type { BackendSettings, BackendType } from "../../backend/types";
import { useTodoStore } from "../../store/todo-store";
import { Modal } from "../ui/Modal";

type ScannerMode = "settings" | "database";

type DbChunkPayload = {
  app: "cascade-todo";
  kind: "db-chunk";
  version: 1;
  transferId: string;
  index: number;
  total: number;
  encoding: "gzip-base64url" | "plain-base64url";
  data: string;
};

type DbImportState =
  | { status: "idle"; scanned: number; total: number; message: string }
  | { status: "scanning"; scanned: number; total: number; message: string }
  | { status: "success"; scanned: number; total: number; importedCount: number; message: string }
  | { status: "failure"; scanned: number; total: number; message: string };

type PersistedDbImportSession = {
  chunks: DbChunkPayload[];
  state: DbImportState;
};

const DB_IMPORT_SESSION_KEY = "cascade.dbQrImportSession";

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

type JsonTransferState =
  | null
  | {
      target: "settings" | "database";
      action: "import" | "export";
      text: string;
    };

export function BackendSettingsPanel({ onClose, onSaved }: Props) {
  const nodes = useTodoStore((state) => state.nodes);
  const replaceAllNodes = useTodoStore((state) => state.replaceAllNodes);
  const [settings, setSettings] = useState<BackendSettings>(() => loadBackendSettings());
  const [databases, setDatabases] = useState<NotionDatabaseOption[]>([]);
  const [parentPageId, setParentPageId] = useState("");
  const [status, setStatus] = useState("");
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [creatingDatabase, setCreatingDatabase] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<ScannerMode>("settings");
  const [scannerStatus, setScannerStatus] = useState("");
  const [dbQrCodes, setDbQrCodes] = useState<string[]>([]);
  const [activeDbQrIndex, setActiveDbQrIndex] = useState(0);
  const [dbImportProgress, setDbImportProgress] = useState("");
  const [dbImportState, setDbImportState] = useState<DbImportState>({
    status: "idle",
    scanned: 0,
    total: 0,
    message: "",
  });
  const [expandedQr, setExpandedQr] = useState<{ title: string; url: string } | null>(null);
  const [qrZoom, setQrZoom] = useState(1);
  const [jsonTransfer, setJsonTransfer] = useState<JsonTransferState>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const importInProgressRef = useRef(false);
  const scannedDbChunksRef = useRef(new Map<string, Map<number, DbChunkPayload>>());

  useEffect(() => {
    console.log("Test")
    const savedSession = loadDbImportSession();
    if (!savedSession) return;

    const chunksByTransfer = new Map<string, Map<number, DbChunkPayload>>();
    for (const chunk of savedSession.chunks) {
      const chunks = chunksByTransfer.get(chunk.transferId) ?? new Map();
      chunks.set(chunk.index, chunk);
      chunksByTransfer.set(chunk.transferId, chunks);
    }
    scannedDbChunksRef.current = chunksByTransfer;
    setDbImportState(savedSession.state);
    setDbImportProgress(savedSession.state.message);
    if (savedSession.state.status === "scanning") {
      setScannerMode("database");
      setScannerStatus("Recovered an interrupted database import.");
      setScannerOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!scannerOpen) return;
    let cancelled = false;
    let animationFrame = 0;

    async function startScanner() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setScannerStatus("Live camera scanning needs HTTPS on this browser. Use Take/upload QR photo instead.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        scanStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const tick = async () => {
          if (cancelled || !videoRef.current || !canvasRef.current) return;
          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const canvas = canvasRef.current;
            const width = videoRef.current.videoWidth;
            const height = videoRef.current.videoHeight;
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context?.drawImage(videoRef.current, 0, 0, width, height);
            const imageData = context?.getImageData(0, 0, width, height);
            const payload = imageData ? await decodeQrImageData(imageData) : undefined;
            if (payload && !importInProgressRef.current) {
              try {
                importInProgressRef.current = true;
                const complete = await handleScannedPayload(payload);
                if (complete) return;
              } catch (error) {
                console.error("QR payload import failed", error);
                const message = error instanceof Error ? error.message : "Could not import this QR code.";
                setStatus(message);
                if (scannerMode === "database") {
                  setDbImportState((current) => ({
                    status: "failure",
                    scanned: current.scanned,
                    total: current.total,
                    message,
                  }));
                }
              } finally {
                importInProgressRef.current = false;
              }
            }
          }
          animationFrame = requestAnimationFrame(tick);
        };
        animationFrame = requestAnimationFrame(tick);
      } catch (error) {
        console.error("QR scan failed", error);
        setScannerStatus(
          error instanceof Error
            ? `${error.message}. Use Take/upload QR photo instead.`
            : "Could not start live camera scanning. Use Take/upload QR photo instead.",
        );
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      stopScannerStream(scanStreamRef.current);
      scanStreamRef.current = null;
    };
  }, [onSaved, scannerMode, scannerOpen]);

  async function handleScannedPayload(payload: string) {
    if (scannerMode === "settings") {
      const importedSettings = importBackendSettingsPayload(payload);
      setSettings(importedSettings);
      saveBackendSettings(importedSettings);
      setStatus("Settings imported from QR code.");
      setScannerOpen(false);
      onSaved();
      return true;
    }

    const chunk = JSON.parse(payload) as DbChunkPayload;
    if (
      chunk.app !== "cascade-todo" ||
      chunk.kind !== "db-chunk" ||
      chunk.version !== 1 ||
      chunk.index < 0 ||
      chunk.index >= chunk.total
    ) {
      throw new Error("This QR code is not a Cascade Todo database transfer chunk.");
    }

    const chunksByIndex = scannedDbChunksRef.current.get(chunk.transferId) ?? new Map();
    chunksByIndex.set(chunk.index, chunk);
    scannedDbChunksRef.current.set(chunk.transferId, chunksByIndex);
    const progressMessage = `Scanned ${chunksByIndex.size} / ${chunk.total} database QR codes.`;
    setDbImportProgress(progressMessage);
    setDbImportState({
      status: "scanning",
      scanned: chunksByIndex.size,
      total: chunk.total,
      message: progressMessage,
    });
    saveDbImportSession(scannedDbChunksRef.current, {
      status: "scanning",
      scanned: chunksByIndex.size,
      total: chunk.total,
      message: progressMessage,
    });

    if (chunksByIndex.size < chunk.total) return false;

    const chunks = Array.from({ length: chunk.total }, (_, index) => chunksByIndex.get(index));
    if (chunks.some((item) => !item)) throw new Error("A database QR chunk is missing.");
    const encoded = chunks.map((item) => item!.data).join("");
    const json = await decodeTransferData(encoded, chunk.encoding);
    const parsed = JSON.parse(json) as { app?: string; kind?: string; version?: number; nodes?: TodoNode[] };
    if (parsed.app !== "cascade-todo" || parsed.kind !== "node-db" || parsed.version !== 1 || !parsed.nodes) {
      throw new Error("The database transfer payload is invalid.");
    }

    replaceAllNodes(parsed.nodes);
    const message = `Imported ${parsed.nodes.length} tasks from QR transfer.`;
    setStatus(message);
    setDbImportState({
      status: "success",
      scanned: chunk.total,
      total: chunk.total,
      importedCount: parsed.nodes.length,
      message,
    });
    clearDbImportSession();
    return true;
  }

  function update<K extends keyof BackendSettings>(key: K, value: BackendSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function getNotionBackend() {
    return new NotionBackend(settings);
  }

  async function loadDatabases() {
    setLoadingDatabases(true);
    setStatus("");
    try {
      const nextDatabases = await getNotionBackend().listDatabases();
      setDatabases(nextDatabases);
      setStatus(nextDatabases.length ? "Notion databases loaded." : "No shared databases found.");
    } catch (error) {
      console.error("Notion database list failed", error);
      setStatus(error instanceof Error ? error.message : "Could not load Notion databases.");
    } finally {
      setLoadingDatabases(false);
    }
  }

  async function createDatabase() {
    setCreatingDatabase(true);
    setStatus("");
    try {
      const database = await getNotionBackend().createCascadeDatabase(parentPageId);
      setDatabases((current) => [database, ...current.filter((item) => item.id !== database.id)]);
      update("notion_database_id", database.id);
      setStatus(`Created "${database.title}". Save settings to use it.`);
    } catch (error) {
      console.error("Notion database creation failed", error);
      setStatus(error instanceof Error ? error.message : "Could not create the Notion database.");
    } finally {
      setCreatingDatabase(false);
    }
  }

  async function generateQrCode() {
    setStatus("");
    try {
      const { default: QRCode } = await import("qrcode");
      const nextUrl = await QRCode.toDataURL(exportBackendSettingsPayload(settings), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });
      setQrCodeUrl(nextUrl);
      setStatus("QR code ready. It contains your backend settings and token.");
    } catch (error) {
      console.error("QR code creation failed", error);
      setStatus(error instanceof Error ? error.message : "Could not create QR code.");
    }
  }

  async function generateDatabaseQrCodes() {
    setStatus("");
    setDbQrCodes([]);
    setActiveDbQrIndex(0);
    try {
      const encoded = await encodeTransferData(
        JSON.stringify({
          app: "cascade-todo",
          kind: "node-db",
          version: 1,
          nodes,
        }),
      );
      const chunkSize = 820;
      const chunks = encoded.data.match(new RegExp(`.{1,${chunkSize}}`, "g")) ?? [];
      const transferId = createTransferId();
      const { default: QRCode } = await import("qrcode");
      const urls = await Promise.all(
        chunks.map((data, index) =>
          QRCode.toDataURL(
            JSON.stringify({
              app: "cascade-todo",
              kind: "db-chunk",
              version: 1,
              transferId,
              index,
              total: chunks.length,
              encoding: encoded.encoding,
              data,
            } satisfies DbChunkPayload),
            {
              errorCorrectionLevel: "M",
              margin: 1,
              width: 260,
            },
          ),
        ),
      );
      setDbQrCodes(urls);
      setStatus(`Database QR transfer ready: ${urls.length} code${urls.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Database QR transfer creation failed", error);
      setStatus(error instanceof Error ? error.message : "Could not create database QR transfer.");
    }
  }

  function openScanner(mode: ScannerMode) {
    scannedDbChunksRef.current.clear();
    clearDbImportSession();
    importInProgressRef.current = false;
    setDbImportProgress("");
    setScannerStatus("");
    setDbImportState({
      status: "idle",
      scanned: 0,
      total: 0,
      message: "",
    });
    setScannerMode(mode);
    setScannerOpen(true);
  }

  function openExpandedQr(title: string, url: string) {
    setExpandedQr({ title, url });
    setQrZoom(1);
  }

  function openJsonExport(target: "settings" | "database") {
    if (target === "settings") {
      setJsonTransfer({
        target,
        action: "export",
        text: exportBackendSettingsPayload(settings),
      });
      return;
    }

    setJsonTransfer({
      target,
      action: "export",
      text: JSON.stringify(
        {
          app: "cascade-todo",
          kind: "node-db",
          version: 1,
          nodes,
        },
        null,
        2,
      ),
    });
  }

  function openJsonImport(target: "settings" | "database") {
    setJsonTransfer({
      target,
      action: "import",
      text: "",
    });
  }

  function applyJsonImport() {
    if (!jsonTransfer || jsonTransfer.action !== "import") return;
    const payload = jsonTransfer.text.trim();
    if (!payload) {
      setStatus("JSON input is empty.");
      return;
    }

    try {
      if (jsonTransfer.target === "settings") {
        const importedSettings = importBackendSettingsPayload(payload);
        setSettings(importedSettings);
        saveBackendSettings(importedSettings);
        setStatus("Settings imported from JSON.");
        onSaved();
      } else {
        const parsed = JSON.parse(payload) as {
          app?: string;
          kind?: string;
          version?: number;
          nodes?: TodoNode[];
        };
        if (
          parsed.app !== "cascade-todo" ||
          parsed.kind !== "node-db" ||
          parsed.version !== 1 ||
          !Array.isArray(parsed.nodes)
        ) {
          throw new Error("Invalid database JSON payload.");
        }
        replaceAllNodes(parsed.nodes);
        setStatus(`Imported ${parsed.nodes.length} tasks from JSON.`);
      }
      setJsonTransfer(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import JSON payload.";
      setStatus(message);
    }
  }

  async function copyJsonPayload() {
    if (!jsonTransfer) return;
    try {
      await navigator.clipboard.writeText(jsonTransfer.text);
      setStatus("JSON copied to clipboard.");
    } catch {
      setStatus("Clipboard copy failed. You can still select and copy the text manually.");
    }
  }

  async function scanImageFile(file: File) {
    if (importInProgressRef.current) return;
    importInProgressRef.current = true;
    stopScannerStream(scanStreamRef.current);
    scanStreamRef.current = null;
    const receivedMessage = `Image selected: ${file.name || "camera photo"}. Scanning QR...`;
    setStatus(receivedMessage);
    setScannerStatus(receivedMessage);
    try {
      const payload = await decodeQrFile(file);
      if (!payload) {
        setStatus("No QR code found in that image.");
        setScannerStatus("No QR code found in that image. Try a sharper or closer photo.");
        return;
      }
      setScannerStatus("QR code decoded. Importing...");
      await handleScannedPayload(payload);
    } catch (error) {
      console.error("QR image scan failed", error);
      const message = error instanceof Error ? error.message : "Could not scan that QR image.";
      setStatus(message);
      setScannerStatus(message);
      if (scannerMode === "database") {
        setDbImportState((current) => ({
          status: "failure",
          scanned: current.scanned,
          total: current.total,
          message,
        }));
      }
    } finally {
      importInProgressRef.current = false;
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    saveBackendSettings(settings);
    onSaved();
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        overlayClassName="settings-layer"
        contentClassName="settings-panel"
        ariaLabel="Backend settings"
      >
        <header className="settings-header">
          <div>
            <LogIn size={18} />
            <h2>Login and storage</h2>
          </div>
          <button className="modal-icon-button" type="button" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <form className="settings-form" onSubmit={submit}>
          <label className="field-label">
            Backend
            <select
              value={settings.backend_type}
              onChange={(event) => update("backend_type", event.target.value as BackendType)}
            >
              <option value="local">Local browser storage</option>
              <option value="notion">Notion</option>
            </select>
          </label>

          {settings.backend_type === "notion" && (
            <div className="notion-settings">
              <p>
                Direct browser access to Notion can be blocked by CORS. If that happens, this
                backend shape can stay and a tiny proxy can handle the API calls later.
              </p>
              <a
                className="settings-link"
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                <span>Create or manage a Notion integration token</span>
              </a>
              <label className="field-label">
                Integration token
                <input
                  type="password"
                  placeholder="secret_..."
                  value={settings.auth ?? ""}
                  onChange={(event) => update("auth", event.target.value)}
                />
              </label>

              <div className="database-picker">
                <div className="database-picker-heading">
                  <span>Database</span>
                  <button
                    type="button"
                    onClick={loadDatabases}
                    disabled={!settings.auth || loadingDatabases}
                  >
                    {loadingDatabases ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                    <span>Refresh</span>
                  </button>
                </div>
                <select
                  value={settings.notion_database_id ?? ""}
                  onChange={(event) => update("notion_database_id", event.target.value)}
                >
                  <option value="">
                    {databases.length ? "Select a Notion database" : "Refresh to load databases"}
                  </option>
                  {databases.map((database) => (
                    <option value={database.id} key={database.id}>
                      {database.title}
                    </option>
                  ))}
                </select>
                {settings.notion_database_id && (
                  <code className="selected-database-id">{settings.notion_database_id}</code>
                )}
              </div>

              <div className="database-create-box">
                <h3>Create the database</h3>
                <p>
                  Share a parent Notion page with your integration, paste that page ID, then let the
                  app create the Cascade Todo database schema.
                </p>
                <label className="field-label">
                  Parent page ID
                  <input
                    placeholder="Page ID that will contain the database"
                    value={parentPageId}
                    onChange={(event) => setParentPageId(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="create-database-button"
                  onClick={createDatabase}
                  disabled={!settings.auth || !parentPageId.trim() || creatingDatabase}
                >
                  {creatingDatabase ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                  <span>Create Cascade Todo database</span>
                </button>
              </div>

              <label className="field-label">
                Database ID
                <input
                  placeholder="Notion database ID"
                  value={settings.notion_database_id ?? ""}
                  onChange={(event) => update("notion_database_id", event.target.value)}
                />
              </label>
              <label className="field-label">
                Notion API version
                <input
                  value={settings.notion_api_version ?? "2022-06-28"}
                  onChange={(event) => update("notion_api_version", event.target.value)}
                />
              </label>
              {status && <p className="settings-status">{status}</p>}
            </div>
          )}

          <div className="settings-transfer-box">
            <h3>Copy settings to another device</h3>
            <p>
              The QR code includes backend type, auth token, database ID, and API version. Show it
              only on devices you trust.
            </p>
            <div className="settings-transfer-actions">
              <button type="button" onClick={generateQrCode}>
                <QrCode size={15} />
                <span>Show QR code</span>
              </button>
              <button type="button" onClick={() => openScanner("settings")}>
                <Camera size={15} />
                <span>Scan QR code</span>
              </button>
              <button type="button" onClick={() => openJsonExport("settings")}>
                <span>Export JSON</span>
              </button>
              <button type="button" onClick={() => openJsonImport("settings")}>
                <span>Import JSON</span>
              </button>
            </div>
            {qrCodeUrl && (
              <div className="settings-qr-code">
                <img src={qrCodeUrl} alt="Backend settings QR code" />
                <button type="button" aria-label="Expand settings QR code" onClick={() => openExpandedQr("Settings QR code", qrCodeUrl)}>
                  <Maximize2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="settings-transfer-box">
            <h3>Transfer local database</h3>
            <p>
              Exports the current task database as compressed, chunked QR codes. This is experimental
              and best for small databases.
            </p>
            <div className="settings-transfer-actions">
              <button type="button" onClick={generateDatabaseQrCodes}>
                <QrCode size={15} />
                <span>Generate DB QR</span>
              </button>
              <button type="button" onClick={() => openScanner("database")}>
                <Camera size={15} />
                <span>Scan DB QR</span>
              </button>
              <button type="button" onClick={() => openJsonExport("database")}>
                <span>Export JSON</span>
              </button>
              <button type="button" onClick={() => openJsonImport("database")}>
                <span>Import JSON</span>
              </button>
            </div>
            {dbQrCodes.length > 0 && (
              <div className="settings-qr-sequence">
                <div className="settings-qr-sequence-header">
                  <span>
                    QR {activeDbQrIndex + 1} / {dbQrCodes.length}
                  </span>
                  <div>
                    <button
                      type="button"
                      disabled={activeDbQrIndex === 0}
                      onClick={() => setActiveDbQrIndex((index) => Math.max(0, index - 1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={activeDbQrIndex === dbQrCodes.length - 1}
                      onClick={() =>
                        setActiveDbQrIndex((index) => Math.min(dbQrCodes.length - 1, index + 1))
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="settings-qr-code">
                  <img src={dbQrCodes[activeDbQrIndex]} alt="Database transfer QR code" />
                  <button
                    type="button"
                    aria-label="Expand database QR code"
                    onClick={() =>
                      openExpandedQr(
                        `Database QR ${activeDbQrIndex + 1} / ${dbQrCodes.length}`,
                        dbQrCodes[activeDbQrIndex],
                      )
                    }
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {status && settings.backend_type !== "notion" && <p className="settings-status">{status}</p>}

          <footer className="settings-footer">
            <div>
              <Database size={16} />
              <span>{settings.backend_type === "notion" ? "Notion backend" : "Local backend"}</span>
            </div>
            <button type="submit">
              <Save size={16} />
              <span>Save</span>
            </button>
          </footer>
        </form>
      </Modal>
      <Modal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        overlayClassName="qr-scanner-layer"
        contentClassName="qr-scanner"
        ariaLabel="Scan settings QR code"
      >
            <header>
              <h2>{scannerMode === "settings" ? "Scan settings" : "Scan database"}</h2>
              <button type="button" className="modal-icon-button" aria-label="Close scanner" onClick={() => setScannerOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <video ref={videoRef} playsInline muted />
            <canvas ref={canvasRef} hidden />
            <div className="qr-upload-actions">
              <label className="qr-upload-button" onClick={(event) => event.stopPropagation()}>
                <Camera size={15} />
                <span>Take QR photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onClick={() => {
                    setScannerStatus("Opening camera...");
                  }}
                  onChange={(event) => {
                    event.stopPropagation();
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file) {
                      setScannerStatus("No image selected.");
                      return;
                    }
                    void scanImageFile(file).finally(() => {
                      input.value = "";
                    });
                  }}
                />
              </label>
              <label className="qr-upload-button" onClick={(event) => event.stopPropagation()}>
                <Camera size={15} />
                <span>Upload QR photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onClick={() => {
                    setScannerStatus("Waiting for image selection...");
                  }}
                  onChange={(event) => {
                    event.stopPropagation();
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file) {
                      setScannerStatus("No image selected.");
                      return;
                    }
                    console.log("Selected file for QR scanning:", file);
                    void scanImageFile(file).finally(() => {
                      input.value = "";
                    });
                  }}
                />
              </label>
            </div>
            <p>
              {scannerMode === "settings"
                ? scannerStatus || "Point the camera at a Cascade Todo settings QR code."
                : scannerStatus ||
                  dbImportProgress ||
                  "Point the camera at each database QR code in any order."}
            </p>
            {scannerMode === "database" && (
              <div className="db-import-panel" data-status={dbImportState.status}>
                <div className="db-import-progress-row">
                  <span>
                    {dbImportState.total
                      ? `${dbImportState.scanned} / ${dbImportState.total}`
                      : "Waiting for first QR"}
                  </span>
                  <span>{dbImportState.status}</span>
                </div>
                <progress
                  value={dbImportState.total ? dbImportState.scanned : 0}
                  max={dbImportState.total || 1}
                />
                <p>
                  {dbImportState.status === "success"
                    ? `${dbImportState.importedCount} tasks imported.`
                    : dbImportState.message || "Scan database QR codes in any order."}
                </p>
                {dbImportState.status === "success" && (
                  <button type="button" onClick={() => setScannerOpen(false)}>
                    Close
                  </button>
                )}
              </div>
            )}
      </Modal>
      <Modal
        open={Boolean(expandedQr)}
        onClose={() => setExpandedQr(null)}
        overlayClassName="qr-expanded-layer"
        contentClassName="qr-expanded-modal"
        ariaLabel={expandedQr?.title ?? "Expanded QR"}
      >
          {expandedQr ? (
            <>
            <header>
              <h2>{expandedQr.title}</h2>
              <button type="button" className="modal-icon-button" aria-label="Close expanded QR code" onClick={() => setExpandedQr(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="qr-expanded-stage">
              <img
                src={expandedQr.url}
                alt={expandedQr.title}
                style={{ width: `${Math.round(300 * qrZoom)}px` }}
              />
            </div>
            <footer>
              <button type="button" onClick={() => setQrZoom((zoom) => Math.max(0.8, zoom - 0.2))}>
                <Minus size={16} />
                <span>Zoom out</span>
              </button>
              <span>{Math.round(qrZoom * 100)}%</span>
              <button type="button" onClick={() => setQrZoom((zoom) => Math.min(2.4, zoom + 0.2))}>
                <Plus size={16} />
                <span>Zoom in</span>
              </button>
            </footer>
            </>
          ) : null}
      </Modal>
      <Modal
        open={Boolean(jsonTransfer)}
        onClose={() => setJsonTransfer(null)}
        overlayClassName="json-transfer-layer"
        contentClassName="json-transfer-modal"
        ariaLabel="JSON transfer"
      >
          {jsonTransfer ? (
            <>
            <header>
              <h2>
                {jsonTransfer.action === "export" ? "Export JSON" : "Import JSON"}{" "}
                {jsonTransfer.target === "settings" ? "settings" : "database"}
              </h2>
              <button type="button" className="modal-icon-button" aria-label="Close JSON transfer" onClick={() => setJsonTransfer(null)}>
                <X size={18} />
              </button>
            </header>
            <textarea
              value={jsonTransfer.text}
              readOnly={jsonTransfer.action === "export"}
              onChange={(event) =>
                setJsonTransfer((current) => (current ? { ...current, text: event.target.value } : current))
              }
              placeholder="Paste JSON payload here..."
            />
            <footer>
              {jsonTransfer.action === "export" ? (
                <button type="button" onClick={copyJsonPayload}>
                  Copy
                </button>
              ) : null}
              {jsonTransfer.action === "import" ? (
                <button type="button" onClick={applyJsonImport}>
                  Import JSON
                </button>
              ) : null}
              <button type="button" onClick={() => setJsonTransfer(null)}>
                Close
              </button>
            </footer>
            </>
          ) : null}
      </Modal>
    </>
  );
}

function stopScannerStream(stream?: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function createTransferId() {
  return `transfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function encodeTransferData(text: string): Promise<{
  data: string;
  encoding: DbChunkPayload["encoding"];
}> {
  if ("CompressionStream" in window) {
    const compressed = await streamToUint8Array(
      new Blob([new TextEncoder().encode(text)])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    );
    return { data: bytesToBase64Url(compressed), encoding: "gzip-base64url" };
  }

  return { data: bytesToBase64Url(new TextEncoder().encode(text)), encoding: "plain-base64url" };
}

async function decodeTransferData(encoded: string, encoding: DbChunkPayload["encoding"]) {
  const bytes = base64UrlToBytes(encoded);
  if (encoding === "gzip-base64url") {
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot decompress the database transfer.");
    }
    const decompressed = await streamToUint8Array(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    );
    return new TextDecoder().decode(decompressed);
  }
  return new TextDecoder().decode(bytes);
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
  }

  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function saveDbImportSession(chunksByTransfer: Map<string, Map<number, DbChunkPayload>>, state: DbImportState) {
  const chunks = Array.from(chunksByTransfer.values()).flatMap((chunksByIndex) =>
    Array.from(chunksByIndex.values()),
  );
  sessionStorage.setItem(
    DB_IMPORT_SESSION_KEY,
    JSON.stringify({
      chunks,
      state,
    } satisfies PersistedDbImportSession),
  );
}

function loadDbImportSession() {
  const raw = sessionStorage.getItem(DB_IMPORT_SESSION_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PersistedDbImportSession;
  } catch {
    sessionStorage.removeItem(DB_IMPORT_SESSION_KEY);
    return undefined;
  }
}

function clearDbImportSession() {
  sessionStorage.removeItem(DB_IMPORT_SESSION_KEY);
}

async function decodeQrFile(file: File) {
  console.error("QR file selected", {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  });
  try {
    const bitmap = await createImageBitmap(file);
    try {
      console.error("QR bitmap created", {
        width: bitmap.width,
        height: bitmap.height,
      });
      return await decodeQrFromDrawable(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.error("Bitmap decode path failed, trying img fallback", error);
    const image = await loadImageFromFile(file);
    return decodeQrFromDrawable(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
  }
}

function sampleImageData(imageData: ImageData) {
  const step = Math.max(4, Math.floor(imageData.data.length / 160));
  const rgba: number[][] = [];
  let minLuma = 255;
  let maxLuma = 0;
  let sumLuma = 0;
  let sampled = 0;

  for (let index = 0; index < imageData.data.length; index += step) {
    const pixelIndex = index - (index % 4);
    const r = imageData.data[pixelIndex] ?? 0;
    const g = imageData.data[pixelIndex + 1] ?? 0;
    const b = imageData.data[pixelIndex + 2] ?? 0;
    const a = imageData.data[pixelIndex + 3] ?? 0;
    if (rgba.length < 12) rgba.push([r, g, b, a]);
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    sumLuma += luma;
    sampled += 1;
  }

  return {
    firstRgba: rgba,
    sampledPixels: sampled,
    minLuma,
    maxLuma,
    avgLuma: sampled ? Math.round(sumLuma / sampled) : 0,
  };
}

async function decodeQrImageData(imageData: ImageData) {
  const { default: jsQR } = await import("jsqr");
  return jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  })?.data;
}

async function decodeQrFromDrawable(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const attempts = [
    { rotation: 0, width, height },
    { rotation: 90, width: height, height: width },
    { rotation: 180, width, height },
    { rotation: 270, width: height, height: width },
  ];

  for (const attempt of attempts) {
    const canvas = document.createElement("canvas");
    canvas.width = attempt.width;
    canvas.height = attempt.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) continue;
    context.imageSmoothingEnabled = false;
    try {
      context.translate(attempt.width / 2, attempt.height / 2);
      context.rotate((attempt.rotation * Math.PI) / 180);
      context.drawImage(source, -width / 2, -height / 2, width, height);
    } catch (error) {
      console.error("QR drawImage failed", {
        rotation: attempt.rotation,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        error,
      });
      continue;
    }
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    console.error("QR decode attempt image sample", {
      rotation: attempt.rotation,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      sample: sampleImageData(imageData),
    });
    const payload = await decodeQrImageData(imageData);
    console.error("QR decode attempt result", {
      rotation: attempt.rotation,
      found: Boolean(payload),
      payloadPrefix: payload?.slice(0, 40),
    });
    if (payload) return payload;
  }

  return undefined;
}

async function loadImageFromFile(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Source image could not be decoded."));
    image.src = dataUrl;
  });
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read selected image file."));
    reader.readAsDataURL(file);
  });
}
