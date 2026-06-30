import { isRecord } from "./guards.js";

export function resolveRefsInValue(root: unknown, value: unknown, seen = new Set<string>()): unknown {
  const resolved = resolveRef(root, value, seen);
  if (Array.isArray(resolved)) return resolved.map((item) => resolveRefsInValue(root, item, seen));
  if (!isRecord(resolved)) return resolved;
  return Object.fromEntries(Object.entries(resolved).map(([key, item]) => [key, resolveRefsInValue(root, item, seen)]));
}

export function resolveRef(root: unknown, value: unknown, seen = new Set<string>()): unknown {
  if (!isRecord(value) || typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) return value;
  if (seen.has(value.$ref)) return value;
  seen.add(value.$ref);
  const target = value.$ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => isRecord(current) ? current[segment] : undefined, root);
  return target === undefined ? value : resolveRef(root, target, seen);
}
