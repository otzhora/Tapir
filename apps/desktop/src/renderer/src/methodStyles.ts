export function methodClass(method: string): string {
  const base = "inline-grid h-6 w-[58px] place-items-center rounded border border-transparent bg-[var(--tapir-bg-control)] text-[11px] font-black text-[var(--tapir-text-soft)]";
  const variants: Record<string, string> = {
    GET: "border-[var(--tapir-method-get-border)] bg-[var(--tapir-method-get-bg)] text-[var(--tapir-method-get-text)]",
    POST: "border-[var(--tapir-method-post-border)] bg-[var(--tapir-method-post-bg)] text-[var(--tapir-method-post-text)]",
    PUT: "border-[var(--tapir-method-put-border)] bg-[var(--tapir-method-put-bg)] text-[var(--tapir-method-put-text)]",
    PATCH: "border-[var(--tapir-method-patch-border)] bg-[var(--tapir-method-patch-bg)] text-[var(--tapir-method-patch-text)]",
    DELETE: "border-[var(--tapir-method-delete-border)] bg-[var(--tapir-method-delete-bg)] text-[var(--tapir-method-delete-text)]"
  };
  return `${base} ${variants[method] ?? ""}`;
}
