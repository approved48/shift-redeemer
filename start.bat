@echo off
title SHiFT Redeemer
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Download it from https://nodejs.org then run this again.
  pause
  exit /b 1
)
node server.js
pause
