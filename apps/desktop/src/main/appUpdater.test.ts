import { describe, expect, it, vi } from "vitest";
import { TapirAppUpdater, type ElectronUpdaterLike } from "./appUpdater";

describe("TapirAppUpdater", () => {
  it("reports an available update, download progress, and installs it", async () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const electronUpdater = fakeUpdater(listeners);
    const publish = vi.fn();
    const updater = new TapirAppUpdater(electronUpdater, "0.0.1-20260814", true, publish);

    await updater.check();
    listeners.get("update-available")?.({ version: "0.0.2-20260815" } as never);
    expect(updater.getState()).toMatchObject({ status: "available", availableVersion: "0.0.2-20260815" });

    const download = updater.download();
    listeners.get("download-progress")?.({ percent: 42.4 } as never);
    listeners.get("update-downloaded")?.({ version: "0.0.2-20260815" } as never);
    await download;
    expect(updater.getState()).toMatchObject({ status: "downloaded", downloadPercent: 100 });

    updater.install();
    expect(electronUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(publish).toHaveBeenCalled();
    expect(electronUpdater.allowPrerelease).toBe(false);
  });

  it("keeps update actions disabled in development", async () => {
    const electronUpdater = fakeUpdater(new Map());
    const updater = new TapirAppUpdater(electronUpdater, "0.0.1-20260814", false, vi.fn());
    expect(await updater.check()).toMatchObject({ status: "disabled" });
    expect(electronUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
});

function fakeUpdater(listeners: Map<string, (...args: never[]) => void>): ElectronUpdaterLike {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn((event: string, listener: (...args: never[]) => void) => listeners.set(event, listener)) as ElectronUpdaterLike["on"],
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn()
  };
}
