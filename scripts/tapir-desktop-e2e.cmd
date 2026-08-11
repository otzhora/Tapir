@echo off
setlocal EnableExtensions
call "%~dp0tapir-windows-env.cmd"
cd /d "%~dp0.."
if defined TAPIR_NPM_CMD (
  call "%TAPIR_NPM_CMD%" run e2e:desktop
) else (
  call npm.cmd run e2e:desktop
)
exit /b %ERRORLEVEL%
