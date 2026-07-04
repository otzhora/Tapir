export function methodClass(method: string): string {
  const base = "inline-grid h-6 w-[58px] place-items-center rounded border border-transparent bg-[#29323b] text-[11px] font-black text-[#d8e0dd]";
  const variants: Record<string, string> = {
    GET: "border-[#245f52] bg-[#123a33] text-[#49d9ae]",
    POST: "border-[#675221] bg-[#3a3215] text-[#ffd166]",
    PUT: "border-[#255c7e] bg-[#16344a] text-[#65c7ff]",
    PATCH: "border-[#4b3f6f] bg-[#2f2844] text-[#c4a7ff]",
    DELETE: "border-[#713636] bg-[#411f1f] text-[#ff8b7c]"
  };
  return `${base} ${variants[method] ?? ""}`;
}
