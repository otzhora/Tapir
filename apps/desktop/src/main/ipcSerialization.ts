export function toIpcPayload<Value>(value: Value): Value {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as Value;
}
