import type { AppUpdateState } from "@tapir/core";

interface UpdateInfoLike {
  version: string;
}

interface DownloadProgressLike {
  percent: number;
}

export interface ElectronUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: "checking-for-update", listener: () => void): unknown;
  on(event: "update-not-available" | "update-available" | "update-downloaded", listener: (info: UpdateInfoLike) => void): unknown;
  on(event: "download-progress", listener: (progress: DownloadProgressLike) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export class TapirAppUpdater {
  private state: AppUpdateState;

  constructor(
    private readonly updater: ElectronUpdaterLike,
    currentVersion: string,
    private readonly enabled: boolean,
    private readonly publish: (state: AppUpdateState) => void
  ) {
    this.state = enabled
      ? { currentVersion, status: "idle" }
      : { currentVersion, status: "disabled", message: "Updates are available in installed builds." };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    // Date-suffixed artifacts belong to regular releases, not isolated prerelease channels.
    // This lets each installed dated build follow the repository's normal latest release.
    updater.allowPrerelease = false;
    this.listen();
  }

  getState(): AppUpdateState {
    return { ...this.state };
  }

  async check(): Promise<AppUpdateState> {
    if (!this.enabled) return this.getState();
    this.setState({ status: "checking", message: "Checking GitHub Releases…", downloadPercent: undefined });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.fail(error, "Update check failed");
    }
    return this.getState();
  }

  async download(): Promise<AppUpdateState> {
    if (!this.enabled || (this.state.status !== "available" && this.state.status !== "error")) return this.getState();
    this.setState({ status: "downloading", message: "Downloading update…", downloadPercent: 0 });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.fail(error, "Update download failed");
    }
    return this.getState();
  }

  install(): void {
    if (this.enabled && this.state.status === "downloaded") this.updater.quitAndInstall(false, true);
  }

  private listen(): void {
    this.updater.on("checking-for-update", () => this.setState({ status: "checking", message: "Checking GitHub Releases…" }));
    this.updater.on("update-not-available", () => this.setState({ status: "up-to-date", message: "Tapir is up to date.", availableVersion: undefined, downloadPercent: undefined }));
    this.updater.on("update-available", (info) => this.setState({ status: "available", availableVersion: info.version, message: `Tapir ${info.version} is available.`, downloadPercent: undefined }));
    this.updater.on("download-progress", (progress) => this.setState({ status: "downloading", downloadPercent: Math.max(0, Math.min(100, progress.percent)), message: `Downloading update… ${Math.round(progress.percent)}%` }));
    this.updater.on("update-downloaded", (info) => this.setState({ status: "downloaded", availableVersion: info.version, downloadPercent: 100, message: "Update downloaded. Restart Tapir to install it." }));
    this.updater.on("error", (error) => this.fail(error, this.state.status === "downloading" ? "Update download failed" : "Update check failed"));
  }

  private fail(error: unknown, summary: string): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.setState({ status: "error", message: `${summary}: ${detail}`, downloadPercent: undefined });
  }

  private setState(changes: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...changes };
    this.publish(this.getState());
  }
}
