import { isRecord } from "./guards.js";

export interface ExternalReferenceLimits {
  maxDepth: number;
  maxDocuments: number;
  requireSameOrigin: boolean;
}

export function resolveRefsInValue(
  root: unknown,
  value: unknown,
  seen = new Set<string>(),
  cache = new Map<string, unknown>()
): unknown {
  const resolved = resolveRef(root, value, seen, cache);
  if (Array.isArray(resolved)) return resolved.map((item) => resolveRefsInValue(root, item, new Set(seen), cache));
  if (!isRecord(resolved)) return resolved;
  return Object.fromEntries(Object.entries(resolved).map(([key, item]) => [key, resolveRefsInValue(root, item, new Set(seen), cache)]));
}

export function resolveRef(
  root: unknown,
  value: unknown,
  seen = new Set<string>(),
  cache = new Map<string, unknown>()
): unknown {
  if (!isRecord(value) || typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) return value;
  const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$ref"));
  if (cache.has(value.$ref)) return mergeRefSiblings(cache.get(value.$ref), siblings);
  if (seen.has(value.$ref)) return value;
  seen.add(value.$ref);
  const target = value.$ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => isRecord(current) ? current[segment] : undefined, root);
  const resolved = target === undefined ? value : resolveRef(root, target, seen, cache);
  cache.set(value.$ref, resolved);
  return mergeRefSiblings(resolved, siblings);
}

function mergeRefSiblings(resolved: unknown, siblings: Record<string, unknown>): unknown {
  return Object.keys(siblings).length > 0 && isRecord(resolved) ? { ...resolved, ...siblings } : resolved;
}

export async function resolveExternalReferences(
  root: unknown,
  documentUrl: string,
  loadDocument: (url: string) => Promise<unknown>,
  limits: ExternalReferenceLimits = { maxDepth: 16, maxDocuments: 16, requireSameOrigin: true }
): Promise<unknown> {
  const rootUrl = withoutHash(new URL(documentUrl));
  const documents = new Map<string, unknown>([[rootUrl.toString(), root]]);
  const resolvedRefs = new Map<string, unknown>();
  const activeRefs = new Set<string>();

  const visit = async (value: unknown, baseUrl: URL, referenceDepth: number): Promise<unknown> => {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) result.push(await visit(item, baseUrl, referenceDepth));
      return result;
    }
    if (!isRecord(value)) return value;
    if (typeof value.$ref === "string") {
      if (referenceDepth >= limits.maxDepth) throw new Error(`OpenAPI reference depth exceeds Tapir's limit of ${limits.maxDepth}: ${value.$ref}`);
      const targetUrl = new URL(value.$ref, baseUrl);
      if (!["http:", "https:"].includes(targetUrl.protocol)) throw new Error(`OpenAPI reference uses unsafe scheme ${targetUrl.protocol}: ${value.$ref}`);
      if (limits.requireSameOrigin && targetUrl.origin !== rootUrl.origin) throw new Error(`OpenAPI reference crosses origins from ${rootUrl.origin} to ${targetUrl.origin}. Tapir only resolves same-origin references.`);
      const key = targetUrl.toString();
      if (activeRefs.has(key)) return { $ref: key, "x-tapir-circular-ref": true };
      const siblings = Object.fromEntries(Object.entries(value).filter(([name]) => name !== "$ref"));
      const cached = resolvedRefs.get(key);
      if (cached !== undefined) return mergeRefSiblings(cached, await visit(siblings, baseUrl, referenceDepth + 1) as Record<string, unknown>);

      const targetDocumentUrl = withoutHash(targetUrl);
      const targetDocumentKey = targetDocumentUrl.toString();
      let targetDocument = documents.get(targetDocumentKey);
      if (targetDocument === undefined) {
        if (documents.size >= limits.maxDocuments) throw new Error(`OpenAPI references exceed Tapir's limit of ${limits.maxDocuments} documents.`);
        targetDocument = await loadDocument(targetDocumentKey);
        documents.set(targetDocumentKey, targetDocument);
      }
      const target = resolveJsonPointer(targetDocument, targetUrl.hash);
      if (target === undefined) throw new Error(`OpenAPI reference target was not found: ${key}`);
      activeRefs.add(key);
      try {
        const resolved = await visit(target, targetDocumentUrl, referenceDepth + 1);
        resolvedRefs.set(key, resolved);
        return mergeRefSiblings(resolved, await visit(siblings, baseUrl, referenceDepth + 1) as Record<string, unknown>);
      } finally {
        activeRefs.delete(key);
      }
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await visit(item, baseUrl, referenceDepth);
    return result;
  };

  return visit(root, rootUrl, 0);
}

function withoutHash(url: URL): URL {
  const result = new URL(url);
  result.hash = "";
  return result;
}

function resolveJsonPointer(document: unknown, hash: string): unknown {
  if (!hash || hash === "#") return document;
  if (!hash.startsWith("#/")) return undefined;
  return hash.slice(2).split("/")
    .map((part) => decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => isRecord(current) || Array.isArray(current) ? current[segment as keyof typeof current] : undefined, document);
}
