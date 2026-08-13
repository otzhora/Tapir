import { redactSensitiveRequest, type PreparedRequest } from "@tapir/core";

export { redactSensitiveRequest };

export type CurlShell = "posix" | "powershell" | "cmd";

export function formatJsonBody(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function formatRequestPreview(request: PreparedRequest | null): string {
  if (!request) return "";
  return JSON.stringify(request, null, 2);
}

export function buildCurlCommand(request: PreparedRequest | null, shell: CurlShell = "posix"): string {
  if (!request) return "";
  const quote = shell === "cmd" ? quoteCmd : shell === "powershell" ? quotePowerShell : quotePosix;
  const executable = shell === "powershell" ? "curl.exe" : "curl";
  const lines = [`${executable} -X ${request.method} ${quote(request.url)}`];
  for (const [name, value] of Object.entries(request.headers)) {
    lines.push(`-H ${quote(`${name}: ${value}`)}`);
  }
  if (request.body) lines.push(`--data-raw ${quote(request.body)}`);
  const continuation = shell === "cmd" ? " ^\r\n  " : shell === "powershell" ? " `\n  " : " \\\n  ";
  return lines.join(continuation);
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteCmd(value: string): string {
  return `"${value.replaceAll("%", "%%").replaceAll("\"", "\\\"")}"`;
}
