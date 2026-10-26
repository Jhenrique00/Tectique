@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\nodemailer\package.json (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
if not exist frontend\node_modules\vite (
  call npm.cmd ci --prefix frontend
  if errorlevel 1 goto failed
)
call npm.cmd run build
if errorlevel 1 goto failed
echo.
echo Tectique sera iniciada em http://127.0.0.1:8000
echo Para encerrar com seguranca, pressione Ctrl+C uma vez.
echo.
node --import tsx scripts/start.ts
if errorlevel 1 goto failed
echo.
echo Tectique finalizada. Pode fechar esta janela.
pause
exit /b 0
:failed
echo.
echo Nao foi possivel concluir. Confira o erro acima.
pause
exit /b 1
