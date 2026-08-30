# setup.ps1 - Setup local venv for Python workers
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[1/4] Creando virtualenv en python-workers/.venv..." -ForegroundColor Cyan
python -m venv .venv

Write-Host "[2/4] Actualizando pip..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip

Write-Host "[3/4] Instalando dependencias de requirements.txt..." -ForegroundColor Cyan
& ".\.venv\Scripts\pip.exe" install -r requirements.txt

Write-Host "[4/4] Verificando imports críticos..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -c "import yt_dlp, ffmpeg, faster_whisper, curl_cffi, PIL; print('>>> TODOS LOS MODULOS PYTHON ESTAN LISTOS <<<')"

Write-Host ">>> ENTORNO PYTHON DE PULSARIA COMPLETAMENTE CONFIGURADO <<<" -ForegroundColor Green
