@echo off
setlocal EnableExtensions

call "%~dp0tapir-windows-env.cmd"
cd /d "%~dp0.."
if defined TAPIR_NPM_CMD (
  "%TAPIR_NPM_CMD%" --workspace @tapir/desktop run build
) else (
  npm.cmd --workspace @tapir/desktop run build
)
exit /b %ERRORLEVEL%
