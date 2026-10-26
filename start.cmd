@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  node tools/server.mjs 8000
) else (
  echo 未找到 Node.js，尝试使用 Python...
  start "" http://localhost:8000
  python -m http.server 8000
)
