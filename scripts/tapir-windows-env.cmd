@echo off
set "TAPIR_NODE_HOME="
set "TAPIR_USERS_ROOT=%SystemDrive%\Users"
if not exist "%TAPIR_USERS_ROOT%" set "TAPIR_USERS_ROOT=C:\Users"

rem Repair the Node/npm PATH for shells that do not inherit the user's normal PATH.
if exist "%USERPROFILE%\scoop\apps\nodejs\current\npm.cmd" set "TAPIR_NODE_HOME=%USERPROFILE%\scoop\apps\nodejs\current"

if not defined TAPIR_NODE_HOME (
  for /d %%D in ("%TAPIR_USERS_ROOT%"\*) do (
    if not defined TAPIR_NODE_HOME if exist "%%~fD\scoop\apps\nodejs\current\npm.cmd" set "TAPIR_NODE_HOME=%%~fD\scoop\apps\nodejs\current"
    if not defined TAPIR_NODE_HOME (
      for /d %%N in ("%%~fD\scoop\apps\nodejs"\*) do (
        if exist "%%~fN\npm.cmd" set "TAPIR_NODE_HOME=%%~fN"
      )
    )
  )
)

if defined TAPIR_NODE_HOME (
  for %%D in ("%TAPIR_NODE_HOME%\..\..\..\shims") do set "TAPIR_SCOOP_SHIMS=%%~fD"
  set "TAPIR_NPM_CMD=%TAPIR_NODE_HOME%\npm.cmd"
)

set "TAPIR_NODE_PATHS=%TAPIR_NODE_HOME%;%TAPIR_NODE_HOME%\bin;%TAPIR_SCOOP_SHIMS%;%ProgramFiles%\nodejs"
set "PATH=%TAPIR_NODE_PATHS%;%PATH%"
