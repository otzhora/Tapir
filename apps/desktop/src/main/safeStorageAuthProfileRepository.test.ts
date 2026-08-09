import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfileRepository, SecretValue, UserAuthProfile } from "@tapir/core";

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
  decryptString: vi.fn((value: Buffer) => value.toString("utf8").replace(/^encrypted:/, ""))
}));

vi.mock("electron", () => ({
  safeStorage: safeStorageMock
}));

const { SafeStorageAuthProfileRepository } = await import("./safeStorageAuthProfileRepository");

describe("SafeStorageAuthProfileRepository", () => {
  beforeEach(() => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    safeStorageMock.encryptString.mockClear();
    safeStorageMock.decryptString.mockClear();
  });

  it("encrypts API key secrets before delegating to storage", async () => {
    const inner = new MemoryAuthProfileRepository();
    const repository = new SafeStorageAuthProfileRepository(inner);

    await repository.upsert({
      workspaceId: "workspace-1",
      serverInstanceId: "server-1",
      schemeKey: "ApiKeyAuth",
      type: "apiKey",
      name: "API key",
      parameterName: "x-api-key",
      location: "header",
      secretValue: "secret"
    });

    expect(inner.lastUpsert?.secretValue).toBe("safeStorage:v1:ZW5jcnlwdGVkOnNlY3JldA==");
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith("secret");
  });

  it("decrypts protected secrets when reading an auth profile", async () => {
    const inner = new MemoryAuthProfileRepository();
    inner.savedSecret = {
      id: "secret-1",
      authProfileId: "profile-1",
      encryptedOrPlainValue: "safeStorage:v1:ZW5jcnlwdGVkOnNlY3JldA==",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    };

    await expect(new SafeStorageAuthProfileRepository(inner).listForServer("server-1")).resolves.toMatchObject([{
      secret: { encryptedOrPlainValue: "secret" }
    }]);
  });

  it("refuses to save new secrets when OS encryption is unavailable", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);

    await expect(new SafeStorageAuthProfileRepository(new MemoryAuthProfileRepository()).upsert({
      workspaceId: "workspace-1",
      serverInstanceId: "server-1",
      schemeKey: "ApiKeyAuth",
      type: "apiKey",
      name: "API key",
      parameterName: "x-api-key",
      location: "header",
      secretValue: "secret"
    })).rejects.toThrow("OS-backed encryption is unavailable");
  });
});

class MemoryAuthProfileRepository implements AuthProfileRepository {
  lastUpsert: Parameters<AuthProfileRepository["upsert"]>[0] | null = null;
  savedSecret: SecretValue = {
    id: "secret-1",
    authProfileId: "profile-1",
    encryptedOrPlainValue: "plain-secret",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };

  async upsert(input: Parameters<AuthProfileRepository["upsert"]>[0]): Promise<UserAuthProfile> {
    this.lastUpsert = input;
    return profile(input);
  }

  async listForServer(): Promise<Array<{ profile: UserAuthProfile; secret: SecretValue }>> {
    return [{
      profile: profile({
        workspaceId: "workspace-1",
        serverInstanceId: "server-1",
        schemeKey: "ApiKeyAuth",
        type: "apiKey",
        name: "API key",
        parameterName: "x-api-key",
        location: "header",
        secretValue: ""
      }),
      secret: this.savedSecret
    }];
  }

  async delete(): Promise<void> {}
}

function profile(input: Parameters<AuthProfileRepository["upsert"]>[0]): UserAuthProfile {
  return {
    id: "profile-1",
    workspaceId: input.workspaceId,
    serverInstanceId: input.serverInstanceId,
    name: input.name,
    type: input.type,
    configJson: JSON.stringify({ schemeKey: input.schemeKey, parameterName: input.parameterName, location: input.location, username: input.username }),
    secretRef: "secret-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}
