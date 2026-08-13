import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(root, "artifacts", "e2e-electron");
const profileDir = await mkdtemp(path.join(os.tmpdir(), "tapir-electron-e2e-"));
const dotnetOutputDir = path.join(profileDir, "dotnet-fixture");
const nodePort = await availablePort();
const dotnetPort = await availablePort();
const nodeBaseUrl = `http://127.0.0.1:${nodePort}`;
const dotnetBaseUrl = `http://127.0.0.1:${dotnetPort}`;
const children = [];
const rendererErrors = [];
const startedAt = Date.now();
let electronApp = null;
let page = null;

await mkdir(artifactsDir, { recursive: true });

try {
  const dotnetProject = path.join(root, "test-projects", "dotnet-swagger-api", "Tapir.DotNetSwaggerApi.csproj");
  const dotnetBuild = spawnSync("dotnet", ["build", dotnetProject, "--configuration", "Release", "--output", dotnetOutputDir, "--no-restore"], {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
  if (dotnetBuild.status !== 0) throw new Error(`Could not build the isolated .NET fixture.\n${dotnetBuild.stdout}${dotnetBuild.stderr}`);
  children.push(startProcess(process.execPath, ["server.js"], path.join(root, "test-projects", "node-swagger-api"), { PORT: String(nodePort) }));
  children.push(startProcess("dotnet", [path.join(dotnetOutputDir, "Tapir.DotNetSwaggerApi.dll")], dotnetOutputDir, { ASPNETCORE_URLS: dotnetBaseUrl }));
  await Promise.all([
    waitForHttp(`${nodeBaseUrl}/health`, children[0], "Node fixture"),
    waitForHttp(`${dotnetBaseUrl}/health`, children[1], ".NET fixture")
  ]);

  ({ electronApp, page } = await launchTapir(profileDir));
  await exerciseFirstRun(page);
  await electronApp.close();
  electronApp = null;
  page = null;

  ({ electronApp, page } = await launchTapir(profileDir));
  await exerciseRestart(page);
  await page.screenshot({ path: path.join(artifactsDir, "last-run.png") });
  assert.equal(rendererErrors.length, 0, `Renderer errors:\n${rendererErrors.join("\n")}`);

  const report = {
    schemaVersion: 1,
    outcome: "passed",
    durationMs: Date.now() - startedAt,
    workflows: [
      "automatic Node OpenAPI discovery",
      "pending API-key save on Send",
      "request duplicate and rename",
      "history restore",
      "cURL import and custom request",
      "explicit .NET OpenAPI URL",
      "server rename and delete cancellation",
      "cold restart persistence"
    ],
    fixtures: ["node", "dotnet"]
  };
  await writeFile(path.join(artifactsDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Electron E2E passed: ${report.workflows.length} workflows across Node and .NET fixtures.`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(artifactsDir, "failure.png") }).catch(() => undefined);
  }
  const childOutput = children.map((child) => child.output).filter(Boolean).join("\n");
  if (childOutput) console.error(childOutput);
  throw error;
} finally {
  if (electronApp) await electronApp.close().catch(() => undefined);
  for (const child of children) stopProcess(child);
  await rm(profileDir, { recursive: true, force: true });
}

async function launchTapir(userDataDir) {
  const executablePath = process.platform === "win32"
    ? path.join(root, "node_modules", "electron", "dist", "electron.exe")
    : path.join(root, "node_modules", "electron", "dist", "electron");
  const mainPath = path.join(root, "apps", "desktop", "out", "main", "index.js");
  const env = { ...process.env, TAPIR_E2E_USER_DATA: userDataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [mainPath], cwd: root, env });
  const mainWindow = await app.firstWindow({ timeout: 30_000 });
  mainWindow.on("pageerror", (error) => rendererErrors.push(error.stack ?? error.message));
  await mainWindow.waitForLoadState("domcontentloaded");
  await mainWindow.getByText("Tapir", { exact: true }).first().waitFor({ state: "visible" });
  return { electronApp: app, page: mainWindow };
}

async function exerciseFirstRun(window) {
  await addServer(window, nodeBaseUrl);
  await window.getByText("Tapir Node Adoption API", { exact: true }).first().waitFor({ state: "visible" });

  const operationSearch = window.getByLabel("Search operations");
  await operationSearch.fill("getApiKeyIdentity");
  await window.getByRole("button", { name: /Verify an API key/ }).click();
  await window.locator("button.tab-button").filter({ hasText: "Authorization" }).click();
  const credential = window.getByLabel("Authentication credential");
  await credential.fill("tapir-node-secret");
  await window.getByText(/Unsaved credential/).waitFor({ state: "visible" });
  await window.getByRole("button", { name: "Send", exact: true }).click();
  await window.getByText(/Credential saved/).waitFor({ state: "visible" });
  await window.locator(".response-status").filter({ hasText: /200\s+Success/ }).waitFor({ state: "visible" });
  assert.equal(await credential.inputValue(), "", "Credential input was not cleared after a successful save.");
  await window.getByRole("button", { name: "Preview", exact: true }).click();
  const preparedRequest = await window.locator(".json-editor-host[aria-label='cURL'] .cm-content").innerText();
  assert(!preparedRequest.includes("tapir-node-secret"), "The Node API key is visible in the prepared-request preview.");

  const activeTab = window.locator(".request-tab").first();
  await activeTab.click({ button: "right" });
  await window.getByRole("menuitem", { name: /Duplicate request/ }).click();
  assert.equal(await window.locator(".request-tab").count(), 2, "Duplicating the request did not create a second tab.");
  await window.locator(".request-tab").last().click({ button: "right" });
  await window.getByRole("menuitem", { name: /Rename request/ }).click();
  await window.getByLabel("Request name").fill("Node API-key check copy");

  await window.locator(".request-tab").first().click();
  await window.getByRole("button", { name: "Request history", exact: true }).click();
  await window.locator("[title='Restore this run in the current tab']").first().click();
  await window.getByLabel("Request name").waitFor({ state: "visible" });

  await importCurl(window, `curl '${nodeBaseUrl}/health'`);
  await window.getByRole("button", { name: "Send", exact: true }).click();
  await window.getByText("tapir-node-adoption-api", { exact: false }).first().waitFor({ state: "visible" });

  await addServer(window, dotnetBaseUrl, `${dotnetBaseUrl}/swagger/v1/swagger.json`);
  await window.getByText("Tapir .NET Logistics API", { exact: true }).first().waitFor({ state: "visible" });
  await window.getByLabel("Search operations").fill("GetHealth");
  await window.getByRole("button", { name: /Get API health/ }).first().click();
  await window.getByRole("button", { name: "Send", exact: true }).click();
  await window.getByText("tapir-dotnet-logistics-api", { exact: false }).first().waitFor({ state: "visible" });

  await window.getByLabel("Search operations").fill("");
  const dotnetServerRow = window.getByTitle(/^Tapir \.NET Logistics API/).locator("..");
  await dotnetServerRow.getByTitle("Configure server").click();
  const nameInput = window.getByPlaceholder("Example API");
  await nameInput.fill("E2E .NET API");
  await window.getByRole("button", { name: /Save configuration/ }).click();
  await window.getByText("Server configuration saved.").waitFor({ state: "visible" });
  window.once("dialog", (dialog) => dialog.dismiss());
  await window.getByRole("button", { name: "Delete", exact: true }).click();
  await window.getByText("E2E .NET API", { exact: true }).first().waitFor({ state: "visible" });
}

async function exerciseRestart(window) {
  await window.getByText("Tapir Node Adoption API", { exact: true }).first().waitFor({ state: "visible" });
  await window.getByText("E2E .NET API", { exact: true }).first().waitFor({ state: "visible" });
  await window.getByTitle(/^Tapir Node Adoption API/).click();
  await window.getByLabel("Search operations").fill("getApiKeyIdentity");
  await window.getByTitle(/^GET \/auth\/api-key/).last().click();
  await window.getByRole("button", { name: "Request history", exact: true }).click();
  const restoredRequest = window.locator("[title='Restore this run in the current tab']").first();
  await restoredRequest.waitFor({ state: "visible" });
  await restoredRequest.click();
  await window.locator("button.tab-button").filter({ hasText: "Authorization" }).click();
  await window.getByText(/Credential configured/).waitFor({ state: "visible" });
}

async function addServer(window, baseUrl, specUrl = "") {
  const baseUrlInput = window.getByLabel("Server base URL");
  if (!await baseUrlInput.isVisible()) await window.getByRole("button", { name: "Add server", exact: true }).click();
  await baseUrlInput.fill(baseUrl);
  await window.getByLabel(/OpenAPI URL/).fill(specUrl);
  const dialog = window.getByRole("dialog", { name: "Add server" });
  await dialog.getByRole("button", { name: "Add server", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
}

async function importCurl(window, command) {
  await window.getByRole("button", { name: "Import cURL", exact: true }).click();
  await window.getByLabel("Browser cURL").locator("[contenteditable='true']").fill(command);
  await window.getByRole("button", { name: "Keep original URL", exact: true }).click();
  await window.getByRole("button", { name: /Import request/ }).click();
  await window.getByLabel("Request name").waitFor({ state: "visible" });
}

function startProcess(command, args, cwd, extraEnv) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.output = "";
  child.stdout.on("data", (chunk) => { child.output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { child.output += chunk.toString(); });
  return child;
}

async function waitForHttp(url, child, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited during startup.\n${child.output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}.\n${child.output}`);
}

function stopProcess(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolvePort(port) : reject(new Error("Could not allocate a fixture port.")));
    });
  });
}
