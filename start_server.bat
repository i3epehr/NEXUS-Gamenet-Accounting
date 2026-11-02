@echo off
chcp 65001 > nul
title NEXUS GameNet Server Launcher

echo ===================================================
echo       NEXUS GameNet Server - در حال اجرا
echo ===================================================
echo.
echo در حال راه‌اندازی سرور روی پورت 3000...
echo این پنجره را نبندید (می‌توانید آن را Minimize کنید).
echo آدرس دسترسی در مرورگر: http://localhost:3000
echo.

call npm run start

pause
