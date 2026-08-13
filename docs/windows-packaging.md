# Windows Packaging and Updates

Tapir produces an assisted Windows x64 installer, GitHub Releases updater metadata, and a portable ZIP. The installer is currently unsigned, so Windows may show a reputation warning.

## Build

Run:

```cmd
scripts\tapir-package-windows.cmd
```

Local builds use the clean base version. To reproduce CI's dated naming in PowerShell, set `$env:TAPIR_RELEASE_DATE = "YYYYMMDD"` before running the command.

The command builds the production Electron bundles, rebuilds and verifies `better-sqlite3` for Electron, assembles the portable app, and creates the NSIS install wizard. Outputs include:

- `artifacts/installer/Tapir-Setup-<version>-x64.exe`
- `artifacts/installer/*.blockmap`
- `artifacts/installer/latest*.yml` update metadata
- `artifacts/Tapir-<version>-win32-x64/`
- `artifacts/Tapir-<version>-win32-x64.zip`
- `artifacts/release-manifest.json`
- `artifacts/SHA256SUMS.txt`

The install wizard is per-user, offers an installation-directory step, and creates Start menu and desktop shortcuts. Installed and packaged builds read regular GitHub Releases for `otzhora/Tapir`; development builds never contact the update feed. Source versions and Git tags stay clean (`0.0.1` and `v0.0.1`). The release pipeline adds its UTC build date to artifacts and the embedded application version (`0.0.1-YYYYMMDD`).

## Tray and update behavior

Closing Tapir hides the main window while the tray process remains active. Double-click the tray icon, or choose **Open Tapir**, to restore it. **Quit Tapir** exits the process. Both the tray menu and the title-bar update center can check for updates. The title-bar flow lets the user download an available release and restart to install it.

The updater requires the Setup executable, its `.blockmap`, and the generated `latest*.yml` files to be attached to the same GitHub Release. Do not rename those generated updater files after packaging.

## Verification

Run the exact portable artifact through a clean-profile smoke test:

```cmd
scripts\tapir-smoke-packaged-windows.cmd
```

The smoke test verifies archive integrity, embedded version, renderer/preload loading, the Electron ABI native module, SQLite migration, request execution, and persisted history without repository-local runtime files.

Before publishing from a clean worktree, run:

```cmd
scripts\tapir-release-windows.cmd
```

For local development only, `scripts\tapir-release-windows.cmd --allow-dirty` permits uncommitted changes and marks the output as dirty.

## Publish to GitHub Releases

1. Update the workspace versions and changelog.
2. Commit the release on a clean revision.
3. Push a matching clean tag, such as `v0.0.1`. The workflow derives the artifact suffix from the current UTC date.
4. The `Release Windows build` workflow runs the full release gate and creates a GitHub release with the installer, updater metadata, portable ZIP, checksum, and provenance manifests.
5. Install that release and confirm **Tapir updates** reports the installed version. A subsequent higher release tag exercises download and restart-to-install end to end.

Code signing should be added before a broad public release. When signing is configured, sign both the installer and application executable without changing the updater artifact names.
