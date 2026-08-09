import type {
  AuthProfileRepository,
  SecretValue,
  UserAuthProfile
} from "@tapir/core";
import { protectLocalValue, unprotectLocalValue } from "./safeStorageCodec";

export class SafeStorageAuthProfileRepository implements AuthProfileRepository {
  constructor(private inner: AuthProfileRepository) {}

  async upsert(input: Parameters<AuthProfileRepository["upsert"]>[0]): Promise<UserAuthProfile> {
    return this.inner.upsert({
      ...input,
      secretValue: protectLocalValue(input.secretValue)
    });
  }

  async listForServer(serverInstanceId: string): Promise<Array<{ profile: UserAuthProfile; secret: SecretValue }>> {
    const results = await this.inner.listForServer(serverInstanceId);
    return results.map((result) => ({
      profile: result.profile,
      secret: { ...result.secret, encryptedOrPlainValue: unprotectLocalValue(result.secret.encryptedOrPlainValue) }
    }));
  }

  async delete(serverInstanceId: string, schemeKey: string): Promise<void> {
    await this.inner.delete(serverInstanceId, schemeKey);
  }
}
