@echo off
cd /d "%~dp0"

echo ╔══════════════════════════════════════════════════╗
echo ║      Fiber360 - Expo Web Server Launcher        ║
echo ╚══════════════════════════════════════════════════╝
echo.

set BUILD_DIR=web-prod
set PORT=8081

:: ── Step 1: Kill any existing process on port 8081 ──
echo [1/4] Checking for existing server on port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo       Killing process PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Step 2: Check build and rebuild if needed ──
echo [2/4] Checking build output...
if not exist "%BUILD_DIR%\index.html" (
    echo       No build found. Running web export...
    call npx expo export --platform web --output-dir %BUILD_DIR%
    if %errorlevel% neq 0 (
        echo       [ERROR] Build failed! Check the logs above.
        pause
        exit /b 1
    )
) else (
    echo       [OK] Build exists (%BUILD_DIR%/index.html)
)

:: ── Step 3: Apply HTML patches (idempotent) ──
echo [3/4] Applying HTML patches (DOM warning suppression)...
node patch-html.mjs "%BUILD_DIR%\index.html"

:: ── Step 4: Start server (Node.js) ──
echo [4/4] Starting server...
echo.
echo   ┌─────────────────────────────────────────────────────┐
echo   │  🌐  Fiber360 Expo Web Server                       │
echo   │                                                     │
echo   │  ➜  http://localhost:%PORT%/                         │
echo   │                                                     │
echo   │  ➜  Open in browser and click                       │
echo   │      "Continue in Demo Mode"                        │
echo   │                                                     │
echo   │  Press Ctrl+C to stop the server                    │
echo   └─────────────────────────────────────────────────────┘
echo.

:: Try Node.js server first, then fall back to Python
node "%~dp0serve-web.mjs" %BUILD_DIR% %PORT%

if %errorlevel% neq 0 (
    echo [*] Node.js unavailable. Trying Python...
    cd "%BUILD_DIR%"
    python -m http.server %PORT%
)

echo.
echo ─────────────────────────────────────────────────────
echo   💡  For emulator / device development:
echo      npx expo start
echo      npx expo run:android    (or: npx expo run:ios)
echo ─────────────────────────────────────────────────────
pause
