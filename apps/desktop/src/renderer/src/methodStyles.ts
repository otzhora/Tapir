export function methodClass(method: string): string {
  const base = "inline-grid h-6 w-[58px] place-items-center rounded bg-[#2a323b] text-[11px] font-black text-[#d4dcda]";
  const variants: Record<string, string> = {
    GET: "bg-[#123a33] text-[#43e2b2]",
    POST: "bg-[#3a3215] text-[#ffd166]",
    PUT: "bg-[#16344a] text-[#65c7ff]",
    PATCH: "bg-[#2f2844] text-[#c4a7ff]",
    DELETE: "bg-[#411f1f] text-[#ff8b7c]"
  };
  return `${base} ${variants[method] ?? ""}`;
}
