import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import type {
  TapirIpcChannel,
  TapirIpcRequest,
  TapirIpcResponse
} from "@tapir/core";
import { TapirApplicationService } from "@tapir/core";
import { BasicOpenApiNormalizer, FetchOpenApiDiscoveryService } from "@tapir/openapi";
import { createLocalTapirStorage } from "@tapir/storage";
import { FetchHttpExecutor } from "./fetchHttpExecutor";
import { toIpcPayload } from "./ipcSerialization";
import { SafeStorageAuthProfileRepository } from "./safeStorageAuthProfileRepository";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const discovery = new FetchOpenApiDiscoveryService();
const normalizer = new BasicOpenApiNormalizer();

let tapir: TapirApplicationService;

async function createServices() {
  const dataDir = join(app.getPath("userData"), "tapir-data");
  mkdirSync(dataDir, { recursive: true });
  const storage = await createLocalTapirStorage(join(dataDir, "tapir.sqlite"), {
    nativeBinding: electronBetterSqliteBindingPath()
  });
  return new TapirApplicationService({
    ...storage,
    authProfiles: new SafeStorageAuthProfileRepository(storage.authProfiles),
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

function createWindow(): void {
  const window = new BrowserWindow({
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
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  return createServices();
}).then((createdServices) => {
  tapir = createdServices;
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpc(): void {
  handle("tapir:getInitialState", async () => tapir.getInitialState());
  handle("tapir:addServer", async (input) => tapir.addServer(input));
  handle("tapir:refreshServerSchema", async (input) => tapir.refreshServerSchema(input));
  handle("tapir:saveApiKeyHeader", async (input) => tapir.saveApiKeyHeader(input));
  handle("tapir:saveServerVariables", async (input) => tapir.saveServerVariables(input));
  handle("tapir:previewOperation", async (input) => tapir.previewOperation(input));
  handle("tapir:callOperation", async (input) => tapir.callOperation(input));
  handle("tapir:listHistory", async (serverId) => tapir.listHistory(serverId));
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
  ipcMain.handle(channel, async (_event, request: TapirIpcRequest<Channel>) => {
    const response = await handler(request);
    return toIpcPayload(response);
  });
}
