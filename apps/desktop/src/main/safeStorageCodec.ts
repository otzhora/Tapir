import { safeStorage } from "electron";

const prefix = "safeStorage:v1:";

export function protectLocalValue(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Tapir cannot save sensitive local data because OS-backed encryption is unavailable.");
  }
  return `${prefix}${safeStorage.encryptString(value).toString("base64")}`;
}

export function unprotectLocalValue(value: string): string {
  if (!value.startsWith(prefix)) return value;
  return safeStorage.decryptString(Buffer.from(value.slice(prefix.length), "base64"));
}
