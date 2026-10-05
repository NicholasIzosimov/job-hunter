@echo off
cd /d "%~dp0"
title Job Hunter
node server.js
if errorlevel 1 pause
