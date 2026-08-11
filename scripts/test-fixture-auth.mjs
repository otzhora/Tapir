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

  await verifyFixture("Node", `http://127.0.0.1:${nodePort}`, "/openapi.json", {
    apiKeyScheme: "ApiKeyAuth", apiKey: "tapir-node-secret",
    bearerScheme: "BearerAuth", bearerToken: "tapir-node-token",
    basicScheme: "BasicAuth", username: "tapir", password: "tapir-node-password",
    queryScheme: "QueryApiKeyAuth", queryApiKey: "tapir-node-query-secret",
    cookieScheme: "CookieApiKeyAuth", cookieApiKey: "tapir-node-session"
  });
  await verifyFixture(".NET", `http://127.0.0.1:${dotnetPort}`, "/swagger/v1/swagger.json", {
    apiKeyScheme: "ApiKey", apiKey: "tapir-dotnet-secret",
    bearerScheme: "Bearer", bearerToken: "tapir-dotnet-token",
    basicScheme: "Basic", username: "tapir", password: "tapir-dotnet-password",
    queryScheme: "QueryApiKey", queryApiKey: "tapir-dotnet-query-secret",
    cookieScheme: "CookieApiKey", cookieApiKey: "tapir-dotnet-session"
  });
  console.log("Fixture authentication smoke tests passed.");
} finally {
  for (const child of children) stop(child);
}

async function verifyFixture(name, baseUrl, specPath, auth) {
  const { apiKeyScheme, apiKey, bearerScheme, bearerToken, basicScheme, username, password, queryScheme, queryApiKey, cookieScheme, cookieApiKey } = auth;
  const specResponse = await fetch(`${baseUrl}${specPath}`);
  assert(specResponse.ok, `${name} OpenAPI document returned ${specResponse.status}.`);
  const spec = await specResponse.json();
  const operation = spec.paths?.["/auth/api-key"]?.get;
  assert(spec.components?.securitySchemes?.[apiKeyScheme]?.type === "apiKey", `${name} API-key scheme is missing.`);
  assert(spec.components.securitySchemes[apiKeyScheme].in === "header", `${name} API-key scheme is not a header.`);
  assert(spec.components.securitySchemes[apiKeyScheme].name === "x-api-key", `${name} API-key header name is incorrect.`);
  assert(operation?.security?.some((requirement) => apiKeyScheme in requirement), `${name} auth operation does not require the API-key scheme.`);

  const missing = await fetch(`${baseUrl}/auth/api-key`);
  assert(missing.status === 401, `${name} missing credential returned ${missing.status}, expected 401.`);
  const invalid = await fetch(`${baseUrl}/auth/api-key`, { headers: { "x-api-key": "wrong" } });
  assert(invalid.status === 401, `${name} invalid credential returned ${invalid.status}, expected 401.`);
  const accepted = await fetch(`${baseUrl}/auth/api-key`, { headers: { "x-api-key": apiKey } });
  assert(accepted.status === 200, `${name} valid credential returned ${accepted.status}, expected 200.`);
  const payload = await accepted.json();
  assert(payload.authenticated === true && payload.scheme === "apiKey", `${name} authenticated response is incorrect.`);

  const bearerOperation = spec.paths?.["/auth/bearer"]?.get;
  const bearerDefinition = spec.components?.securitySchemes?.[bearerScheme];
  assert(bearerDefinition?.type === "http" && bearerDefinition.scheme?.toLowerCase() === "bearer", `${name} bearer scheme is missing.`);
  assert(bearerOperation?.security?.some((requirement) => bearerScheme in requirement), `${name} bearer operation does not require the bearer scheme.`);
  const missingBearer = await fetch(`${baseUrl}/auth/bearer`);
  assert(missingBearer.status === 401, `${name} missing bearer credential returned ${missingBearer.status}, expected 401.`);
  const acceptedBearer = await fetch(`${baseUrl}/auth/bearer`, { headers: { authorization: `Bearer ${bearerToken}` } });
  assert(acceptedBearer.status === 200, `${name} valid bearer credential returned ${acceptedBearer.status}, expected 200.`);
  const bearerPayload = await acceptedBearer.json();
  assert(bearerPayload.authenticated === true && bearerPayload.scheme === "bearer", `${name} bearer response is incorrect.`);

  const basicDefinition = spec.components?.securitySchemes?.[basicScheme];
  assert(basicDefinition?.type === "http" && basicDefinition.scheme?.toLowerCase() === "basic", `${name} basic scheme is missing.`);
  assert(hasRequirement(spec, "/auth/basic", basicScheme), `${name} basic operation does not require basic authentication.`);
  assert((await fetch(`${baseUrl}/auth/basic`)).status === 401, `${name} missing basic credentials were accepted.`);
  const basicAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  assert((await fetch(`${baseUrl}/auth/basic`, { headers: { authorization: basicAuthorization } })).status === 200, `${name} valid basic credentials were rejected.`);

  assertApiKeyScheme(spec, name, queryScheme, "query", "api_key");
  assert(hasRequirement(spec, "/auth/query-api-key", queryScheme), `${name} query API-key operation has incorrect security.`);
  assert((await fetch(`${baseUrl}/auth/query-api-key?api_key=wrong`)).status === 401, `${name} invalid query API key was accepted.`);
  assert((await fetch(`${baseUrl}/auth/query-api-key?api_key=${encodeURIComponent(queryApiKey)}`)).status === 200, `${name} valid query API key was rejected.`);

  assertApiKeyScheme(spec, name, cookieScheme, "cookie", "tapir_session");
  assert(hasRequirement(spec, "/auth/cookie-api-key", cookieScheme), `${name} cookie API-key operation has incorrect security.`);
  assert((await fetch(`${baseUrl}/auth/cookie-api-key`)).status === 401, `${name} missing cookie API key was accepted.`);
  assert((await fetch(`${baseUrl}/auth/cookie-api-key`, { headers: { cookie: `tapir_session=${cookieApiKey}` } })).status === 200, `${name} valid cookie API key was rejected.`);

  const alternative = spec.paths?.["/auth/alternative"]?.get?.security;
  assert(alternative?.some((requirement) => Object.keys(requirement).length === 1 && apiKeyScheme in requirement), `${name} alternative auth is missing its API-key option.`);
  assert(alternative?.some((requirement) => Object.keys(requirement).length === 1 && bearerScheme in requirement), `${name} alternative auth is missing its bearer option.`);
  assert((await fetch(`${baseUrl}/auth/alternative`)).status === 401, `${name} alternative auth accepted an anonymous request.`);
  assert((await fetch(`${baseUrl}/auth/alternative`, { headers: { "x-api-key": apiKey } })).status === 200, `${name} alternative auth rejected its API-key option.`);
  assert((await fetch(`${baseUrl}/auth/alternative`, { headers: { authorization: `Bearer ${bearerToken}` } })).status === 200, `${name} alternative auth rejected its bearer option.`);

  const combined = spec.paths?.["/auth/combined"]?.get?.security;
  assert(combined?.some((requirement) => apiKeyScheme in requirement && basicScheme in requirement), `${name} combined auth is not an AND requirement.`);
  assert((await fetch(`${baseUrl}/auth/combined`, { headers: { "x-api-key": apiKey } })).status === 401, `${name} combined auth accepted only one credential.`);
  assert((await fetch(`${baseUrl}/auth/combined`, { headers: { "x-api-key": apiKey, authorization: basicAuthorization } })).status === 200, `${name} combined auth rejected both valid credentials.`);

  const optional = spec.paths?.["/auth/optional"]?.get?.security;
  assert(optional?.some((requirement) => Object.keys(requirement).length === 0), `${name} optional auth is missing its anonymous alternative.`);
  const anonymous = await fetch(`${baseUrl}/auth/optional`);
  assert(anonymous.status === 200 && (await anonymous.json()).scheme === "anonymous", `${name} optional auth rejected an anonymous request.`);
}

function hasRequirement(spec, pathName, schemeName) {
  return spec.paths?.[pathName]?.get?.security?.some((requirement) => schemeName in requirement);
}

function assertApiKeyScheme(spec, fixtureName, schemeName, location, parameterName) {
  const scheme = spec.components?.securitySchemes?.[schemeName];
  assert(scheme?.type === "apiKey", `${fixtureName} ${location} API-key scheme is missing.`);
  assert(scheme.in === location && scheme.name === parameterName, `${fixtureName} ${location} API-key scheme metadata is incorrect.`);
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
