# Agent Notes

## Windows shell and npm

This workspace is on Windows. Codex is configured in `C:\Users\rogac\.codex\config.toml` to use the real Windows PowerShell executable:

`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

Do not change the shell back to the WindowsApps PowerShell alias. This path has been unreliable from Codex:

`C:\Users\rogac\AppData\Local\Microsoft\WindowsApps\pwsh.exe`

If an already-running thread still fails before commands run with `CreateProcessAsUserW failed: 5`, it probably cached the old shell path. Pass the real PowerShell path explicitly for that thread, or start a fresh Codex session.

Do not spend time debugging `npm.ps1` execution-policy failures. PowerShell may prefer the unsigned `npm.ps1` shim, and elevated shells may also have a reduced PATH. Use the repo `.cmd` launchers:

```cmd
scripts\tapir-npm.cmd test
scripts\tapir-npm.cmd run typecheck
scripts\tapir-desktop-dev.cmd
scripts\tapir-desktop-build.cmd
```

The desktop dev/build commands can hit the Codex sandbox error `Cannot read directory "../../../../..": Access is denied.` When that happens, rerun the same repo launcher with elevated permission.

## better-sqlite3 ABI

`better-sqlite3` is a native module. Normal Node and Electron use different ABIs, so tests rebuild it for Node and then restore the Electron build. Always use `scripts\tapir-npm.cmd test` or `npm test`; do not manually run only the workspace tests after rebuilding native modules for Node.
