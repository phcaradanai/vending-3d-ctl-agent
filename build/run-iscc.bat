@echo off
cd /d D:\Projects\adm-chura3inter\vending-3d-ctl-agent\build
"%LOCALAPPDATA%\Programs\Inno Setup 7\ISCC.exe" installer.iss
echo EXIT_CODE=%ERRORLEVEL%
