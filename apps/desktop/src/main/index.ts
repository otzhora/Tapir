import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type {
  TapirIpcChannel,
  TapirIpcRequest,
  TapirIpcResponse
} from "@tapir/core";
import { parseTapirIpcRequest, TapirApplicationService } from "@tapir/core";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import { createLocalTapirStorage, type SqliteDatabase } from "@tapir/storage";
import { FetchHttpExecutor } from "./fetchHttpExecutor";
import { assertTrustedRendererUrl, validateDevRendererUrl } from "./ipcSecurity";
import { toIpcPayload } from "./ipcSerialization";
import { SafeStorageAuthProfileRepository } from "./safeStorageAuthProfileRepository";
import { SafeStorageHistoryRepository, SafeStorageRequestDraftRepository } from "./safeStorageDataRepositories";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const discovery = new FetchOpenApiDiscoveryService();
const normalizer = new BasicOpenApiNormalizer();

if (process.env.TAPIR_E2E_USER_DATA) {
  app.setPath("userData", process.env.TAPIR_E2E_USER_DATA);
}

let tapir: TapirApplicationService;
let database: SqliteDatabase | null = null;
const trustedRendererUrls = new Map<number, string>();

async function createServices() {
  const dataDir = join(app.getPath("userData"), "tapir-data");
  mkdirSync(dataDir, { recursive: true });
  const storage = await createLocalTapirStorage(join(dataDir, "tapir.sqlite"), {
    nativeBinding: electronBetterSqliteBindingPath()
  });
  database = storage.db;
  const requestDrafts = new SafeStorageRequestDraftRepository(storage.requestDrafts);
  return new TapirApplicationService({
    ...storage,
    authProfiles: new SafeStorageAuthProfileRepository(storage.authProfiles),
    history: new SafeStorageHistoryRepository(storage.history),
    requestDrafts,
    discovery,
    normalizer,
    http: new FetchHttpExecutor()
  });
}

function electronBetterSqliteBindingPath(): string {
  const packageRoot = dirname(require.resolve("better-sqlite3/package.json"));
  const nativeBinding = join(
    packageRoot,
    "bin",
    `${process.platform}-${process.arch}-${process.versions.modules}`,
    "better-sqlite3.node"
  );

  if (!existsSync(nativeBinding)) {
    throw new Error(
      `Missing better-sqlite3 Electron native binding at ${nativeBinding}. ` +
      "Run `npm run rebuild:native:electron` from the repository root."
    );
  }

  return nativeBinding;
}

async function createWindow(show = true): Promise<BrowserWindow> {
  const devRendererUrl = process.env.ELECTRON_RENDERER_URL
    ? validateDevRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged)
    : null;
  const window = new BrowserWindow({
    show,
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Tapir",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#17191d",
      symbolColor: "#a8b0b7",
      height: 44
    },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  const rendererUrl = devRendererUrl ?? pathToFileURL(join(__dirname, "../renderer/index.html")).toString();
  const webContentsId = window.webContents.id;
  trustedRendererUrls.set(webContentsId, rendererUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== rendererUrl) event.preventDefault();
  });
  window.on("closed", () => trustedRendererUrls.delete(webContentsId));

  if (devRendererUrl) {
    await window.loadURL(devRendererUrl);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return window;
}

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    await app.whenReady();
    tapir = await createServices();
    if (process.env.TAPIR_PACKAGED_SMOKE === "1") {
      registerIpc();
      await runPackagedSmoke();
      app.exit(0);
      return;
    }
    registerIpc();
    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    writeSmokeReport({ ok: false, error: message });
    app.exit(1);
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (!database?.open) return;
  database.close();
  database = null;
});

async function runPackagedSmoke(): Promise<void> {
  if (!app.isPackaged) throw new Error("Packaged smoke mode requires a packaged Electron application.");
  const baseUrl = process.env.TAPIR_SMOKE_BASE_URL;
  if (!baseUrl) throw new Error("TAPIR_SMOKE_BASE_URL is required in packaged smoke mode.");
  const smokeWindow = await createWindow(false);
  const rendererUrl = smokeWindow.webContents.getURL();
  const added = await tapir.addServer({ baseUrl });
  const operation = added.normalized.operations.find((candidate) => candidate.operationId === "getHealth")
    ?? added.normalized.operations.find((candidate) => candidate.method === "GET" && candidate.securityRequirements.length === 0);
  if (!operation) throw new Error("Packaged smoke fixture has no unauthenticated GET operation.");
  const call = await tapir.callOperation({ serverId: added.server.id, operationId: operation.operationId, values: {} });
  const state = await tapir.getInitialState();
  const history = await tapir.listHistory({ workspaceId: state.workspace.id, limit: 10 });
  const databasePath = join(app.getPath("userData"), "tapir-data", "tapir.sqlite");
  writeSmokeReport({
    ok: true,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
    databasePath,
    databaseExists: existsSync(databasePath),
    rendererUrl,
    rendererLoaded: rendererUrl.startsWith("file:") && rendererUrl.endsWith("/renderer/index.html"),
    nativeModulesAbi: process.versions.modules,
    nativeBindingPath: electronBetterSqliteBindingPath(),
    serverId: added.server.id,
    specUrl: added.server.specUrl,
    operationId: operation.operationId,
    responseStatus: call.response.status,
    responseBody: call.response.body,
    historyCount: history.entries.length
  });
  smokeWindow.destroy();
}

function writeSmokeReport(value: Record<string, unknown>): void {
  const reportPath = process.env.TAPIR_SMOKE_REPORT;
  if (!reportPath) return;
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(value, null, 2), "utf8");
}

function registerIpc(): void {
  handle("tapir:getInitialState", async () => tapir.getInitialState());
  handle("tapir:addServer", async (input) => tapir.addServer(input));
  handle("tapir:refreshServerSchema", async (input) => tapir.refreshServerSchema(input));
  handle("tapir:rediscoverServerSchema", async (input) => tapir.rediscoverServerSchema(input));
  handle("tapir:updateServerConfiguration", async (input) => tapir.updateServerConfiguration(input));
  handle("tapir:deleteServer", async (serverId) => tapir.deleteServer(serverId));
  handle("tapir:saveAuthentication", async (input) => tapir.saveAuthentication(input));
  handle("tapir:deleteAuthentication", async (input) => tapir.deleteAuthentication(input));
  handle("tapir:saveServerVariables", async (input) => tapir.saveServerVariables(input));
  handle("tapir:previewOperation", async (input) => tapir.previewOperation(input));
  handle("tapir:callOperation", async (input) => tapir.callOperation(input));
  handle("tapir:listHistory", async (input) => tapir.listHistory(input));
  handle("tapir:deleteHistoryEntry", async (input) => tapir.deleteHistoryEntry(input.workspaceId, input.id));
  handle("tapir:clearHistory", async (input) => tapir.clearHistory(input));
  handle("tapir:listRequestDrafts", async (input) => tapir.listRequestDrafts(input));
  handle("tapir:createRequestDraft", async (input) => tapir.createRequestDraft(input));
  handle("tapir:updateRequestDraft", async (input) => tapir.updateRequestDraft(input));
  handle("tapir:deleteRequestDraft", async (id) => tapir.deleteRequestDraft(id));
  handle("tapir:previewCustomRequest", async (input) => tapir.previewCustomRequest(input));
  handle("tapir:callCustomRequest", async (input) => tapir.callCustomRequest(input));
}

function handle<Channel extends TapirIpcChannel>(
  channel: Channel,
  handler: (request: TapirIpcRequest<Channel>) => Promise<TapirIpcResponse<Channel>>
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, request: unknown) => {
    assertTrustedRenderer(event);
    const response = await handler(parseTapirIpcRequest(channel, request));
    return toIpcPayload(response);
  });
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  if (!event.senderFrame || event.senderFrame.routingId !== event.sender.mainFrame.routingId) {
    throw new Error("Blocked IPC call from an untrusted renderer.");
  }
  assertTrustedRendererUrl(event.senderFrame.url, trustedRendererUrls.get(event.sender.id));
}
