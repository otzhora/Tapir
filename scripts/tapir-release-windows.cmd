@echo off
setlocal EnableExtensions

call "%~dp0tapir-windows-env.cmd"
cd /d "%~dp0.."
if defined TAPIR_NPM_CMD (
  "%TAPIR_NPM_CMD%" run release:win -- %*
) else (
  npm.cmd run release:win -- %*
)
exit /b %ERRORLEVEL%
