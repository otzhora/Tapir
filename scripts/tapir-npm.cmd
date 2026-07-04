@echo off
setlocal EnableExtensions

call "%~dp0tapir-windows-env.cmd"
if defined TAPIR_NPM_CMD (
  "%TAPIR_NPM_CMD%" %*
) else (
  npm.cmd %*
)
exit /b %ERRORLEVEL%
