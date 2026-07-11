import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const nodePort = await availablePort();
const dotnetPort = await availablePort();
const children = [];

try {
  const dotnetProject = path.join(root, "test-projects", "dotnet-swagger-api", "Tapir.DotNetSwaggerApi.csproj");
  const build = spawnSync("dotnet", ["build", dotnetProject, "--configuration", "Release", "--no-restore"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`Could not build the .NET fixture.\n${build.stdout}${build.stderr}`);
  children.push(start("node", ["server.js"], "test-projects/node-swagger-api", { PORT: String(nodePort) }));
  children.push(start("dotnet", ["bin/Release/net8.0/Tapir.DotNetSwaggerApi.dll"], "test-projects/dotnet-swagger-api", { ASPNETCORE_URLS: `http://127.0.0.1:${dotnetPort}` }));

  await Promise.all([
    waitFor(`http://127.0.0.1:${nodePort}/health`, children[0]),
    waitFor(`http://127.0.0.1:${dotnetPort}/health`, children[1])
  ]);

  await verifyFixture("Node", `http://127.0.0.1:${nodePort}`, "/openapi.json", "ApiKeyAuth", "tapir-node-secret");
  await verifyFixture(".NET", `http://127.0.0.1:${dotnetPort}`, "/swagger/v1/swagger.json", "ApiKey", "tapir-dotnet-secret");
  console.log("Fixture authentication smoke tests passed.");
} finally {
  for (const child of children) stop(child);
}

async function verifyFixture(name, baseUrl, specPath, schemeName, apiKey) {
  const specResponse = await fetch(`${baseUrl}${specPath}`);
  assert(specResponse.ok, `${name} OpenAPI document returned ${specResponse.status}.`);
  const spec = await specResponse.json();
  const operation = spec.paths?.["/auth/api-key"]?.get;
  assert(spec.components?.securitySchemes?.[schemeName]?.type === "apiKey", `${name} API-key scheme is missing.`);
  assert(spec.components.securitySchemes[schemeName].in === "header", `${name} API-key scheme is not a header.`);
  assert(spec.components.securitySchemes[schemeName].name === "x-api-key", `${name} API-key header name is incorrect.`);
  assert(operation?.security?.some((requirement) => schemeName in requirement), `${name} auth operation does not require the API-key scheme.`);

  const missing = await fetch(`${baseUrl}/auth/api-key`);
  assert(missing.status === 401, `${name} missing credential returned ${missing.status}, expected 401.`);
  const invalid = await fetch(`${baseUrl}/auth/api-key`, { headers: { "x-api-key": "wrong" } });
  assert(invalid.status === 401, `${name} invalid credential returned ${invalid.status}, expected 401.`);
  const accepted = await fetch(`${baseUrl}/auth/api-key`, { headers: { "x-api-key": apiKey } });
  assert(accepted.status === 200, `${name} valid credential returned ${accepted.status}, expected 200.`);
  const payload = await accepted.json();
  assert(payload.authenticated === true && payload.scheme === "apiKey", `${name} authenticated response is incorrect.`);
}

function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd: path.join(root, cwd), env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.output = "";
  child.stdout.on("data", (chunk) => { child.output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { child.output += chunk.toString(); });
  return child;
}

async function waitFor(url, child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Fixture exited before startup.\n${child.output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}.\n${child.output}`);
}

function stop(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  child.kill("SIGTERM");
  child.stdout.destroy();
  child.stderr.destroy();
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error("Could not allocate a fixture port.")));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
