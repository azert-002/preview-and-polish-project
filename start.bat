@echo off
setlocal
cd /d "%~dp0"
title Beyond Words Academy - Local System

echo ======================================================================
echo           Beyond Words Academy - Local Management System
echo           Mode: Protected Local Database (100%% Offline)
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 goto :no_node

if exist "node_modules\.bin\vite.cmd" goto :launch

echo [INFO] Installing required packages...
echo This is only needed for the first run, please wait.
echo.
call npm install --prefer-offline --no-audit
if %errorlevel% neq 0 goto :install_failed
echo [SUCCESS] Packages installed successfully!
echo.

:launch
echo ======================================================================
echo  Default Director Login:
echo    Username: admin
echo    Password: admin
echo ======================================================================
echo.
echo Starting local server and opening browser...
echo Keep this window open while using the system.
echo.

call npm run dev -- --open
pause
exit /b 0

:no_node
echo [ERROR] Node.js is not installed on this computer!
echo Please download and install Node.js from: https://nodejs.org
echo.
pause
exit /b 1

:install_failed
echo.
echo [ERROR] Failed to install packages.
pause
exit /b 1
