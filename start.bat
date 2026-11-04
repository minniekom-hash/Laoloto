@echo off
rem เปิดเว็บใบ้หวยลาว + เซิร์ฟเวอร์อัปเดตผลอัตโนมัติ
cd /d "%~dp0"

powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 8931 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden -FilePath python -ArgumentList 'serve.py' -WorkingDirectory '%~dp0' }"

ping -n 3 127.0.0.1 >nul
start "" "http://127.0.0.1:8931/"
