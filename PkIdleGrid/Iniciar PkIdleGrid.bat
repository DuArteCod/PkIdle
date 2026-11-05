@echo off
cd /d "%~dp0"
title PkIdleGrid

rem Verifica as dependencias principais para nao usar uma instalacao incompleta
if not exist "%~dp0node_modules\electron\dist\electron.exe" goto instala
if not exist "%~dp0node_modules\electron\package.json" goto instala
if not exist "%~dp0node_modules\@tailwindcss\cli\package.json" goto instala
if not exist "%~dp0node_modules\tailwindcss\package.json" goto instala
goto abre

:instala
echo ========================================================
echo   Instalando dependencias do PkIdleGrid...
echo   Isso acontece apenas na primeira vez. Aguarde...
echo ========================================================
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo [ERRO] O Node.js nao foi encontrado no seu computador!
  echo Baixe e instale a versao LTS em: https://nodejs.org
  echo Apos instalar, execute este arquivo novamente.
  echo.
  pause
  exit /b
)
call npm ci
if %errorlevel% neq 0 (
  echo.
  echo [ERRO] Nao foi possivel instalar as dependencias.
  echo Verifique a conexao com a internet e tente novamente.
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo.
  echo Falha ao preparar o Electron. Verifique sua conexao.
  pause
  exit /b
)

:abre
rem Limpa variavel que forca o Electron a rodar como Node
set "ELECTRON_RUN_AS_NODE="

rem Inicia o aplicativo diretamente como processo desacoplado de janela.
rem A janela preta do prompt de comando (CMD) fecha imediatamente!
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit
