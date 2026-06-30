import { safeStorage } from "electron";
import type {
  AuthProfileRepository,
  SecretValue,
  UserAuthProfile
} from "@tapir/core";

export class SafeStorageAuthProfileRepository implements AuthProfileRepository {
  constructor(private inner: AuthProfileRepository) {}

  async upsertApiKeyHeader(input: {
    workspaceId: string;
    serverInstanceId: string;
    name: string;
    headerName: string;
    secretValue: string;
  }): Promise<UserAuthProfile> {
    return this.inner.upsertApiKeyHeader({
      ...input,
      secretValue: protectSecret(input.secretValue)
    });
  }

  async getForServer(serverInstanceId: string): Promise<{ profile: UserAuthProfile; secret: SecretValue } | null> {
    const result = await this.inner.getForServer(serverInstanceId);
    if (!result) return null;
    return {
      profile: result.profile,
      secret: {
        ...result.secret,
        encryptedOrPlainValue: unprotectSecret(result.secret.encryptedOrPlainValue)
      }
    };
  }
}

function protectSecret(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value;
  return `safeStorage:v1:${safeStorage.encryptString(value).toString("base64")}`;
}

function unprotectSecret(value: string): string {
  if (!value.startsWith("safeStorage:v1:")) return value;
  return safeStorage.decryptString(Buffer.from(value.slice("safeStorage:v1:".length), "base64"));
}
