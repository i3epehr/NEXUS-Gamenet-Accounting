@echo off
chcp 65001 > nul
title NEXUS GameNet Server Launcher
set NEXUS_AUTO_RESTART=1

echo ===================================================
echo       NEXUS GameNet Server - در حال اجرا
echo ===================================================
echo.
echo در حال راه‌اندازی سرور روی پورت 3000...
echo این پنجره را نبندید (می‌توانید آن را Minimize کنید).
echo آدرس دسترسی در مرورگر: http://localhost:3000
echo.

:loop
call npm run start
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% equ 0 (
    echo.
    echo ===================================================
    echo سرور بروزرسانی شد. در حال راه‌اندازی مجدد خودکار...
    echo ===================================================
    timeout /t 2 /nobreak > nul 2>&1
    goto loop
)
if %EXITCODE% equ 100 (
    echo.
    echo در حال راه‌اندازی مجدد خودکار سرور...
    timeout /t 2 /nobreak > nul 2>&1
    goto loop
)

echo.
echo سرور با کد %EXITCODE% متوقف شد.
pause
