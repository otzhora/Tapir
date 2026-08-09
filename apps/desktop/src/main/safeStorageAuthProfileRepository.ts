import { safeStorage } from "electron";
import type {
  AuthProfileRepository,
  SecretValue,
  UserAuthProfile
} from "@tapir/core";

export class SafeStorageAuthProfileRepository implements AuthProfileRepository {
  constructor(private inner: AuthProfileRepository) {}

  async upsert(input: Parameters<AuthProfileRepository["upsert"]>[0]): Promise<UserAuthProfile> {
    return this.inner.upsert({
      ...input,
      secretValue: protectSecret(input.secretValue)
    });
  }

  async listForServer(serverInstanceId: string): Promise<Array<{ profile: UserAuthProfile; secret: SecretValue }>> {
    const results = await this.inner.listForServer(serverInstanceId);
    return results.map((result) => ({
      profile: result.profile,
      secret: { ...result.secret, encryptedOrPlainValue: unprotectSecret(result.secret.encryptedOrPlainValue) }
    }));
  }

  async delete(serverInstanceId: string, schemeKey: string): Promise<void> {
    await this.inner.delete(serverInstanceId, schemeKey);
  }
}

function protectSecret(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Tapir cannot save this secret because OS-backed encryption is unavailable.");
  }
  return `safeStorage:v1:${safeStorage.encryptString(value).toString("base64")}`;
}

function unprotectSecret(value: string): string {
  if (!value.startsWith("safeStorage:v1:")) return value;
  return safeStorage.decryptString(Buffer.from(value.slice("safeStorage:v1:".length), "base64"));
}
