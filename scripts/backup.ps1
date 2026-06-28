# backup.ps1 — Comprime la base de datos SQLite con timestamp y mantiene los últimos 30
# Uso: .\scripts\backup.ps1
# O automatizar con el Programador de tareas de Windows

param(
    [string]$DbPath    = "$PSScriptRoot\..\data\mermas.sqlite",
    [string]$BackupDir = "$PSScriptRoot\..\data\backups",
    [int]$Retain       = 30
)

# Resolver rutas absolutas
$DbPath    = [System.IO.Path]::GetFullPath($DbPath)
$BackupDir = [System.IO.Path]::GetFullPath($BackupDir)

if (-not (Test-Path $DbPath)) {
    Write-Error "No se encontró la base de datos: $DbPath"
    exit 1
}

# Crear directorio de backups si no existe
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$timestamp  = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$backupName = "mermas_$timestamp.zip"
$backupPath = Join-Path $BackupDir $backupName

# Comprimir
Compress-Archive -Path $DbPath -DestinationPath $backupPath -CompressionLevel Optimal
Write-Host "Backup creado: $backupPath"

# Eliminar los más antiguos si superamos el límite
$backups = Get-ChildItem -Path $BackupDir -Filter 'mermas_*.zip' |
    Sort-Object LastWriteTime -Descending

if ($backups.Count -gt $Retain) {
    $aEliminar = $backups | Select-Object -Skip $Retain
    foreach ($f in $aEliminar) {
        Remove-Item $f.FullName -Force
        Write-Host "Eliminado backup antiguo: $($f.Name)"
    }
}

Write-Host "Total backups: $([Math]::Min($backups.Count, $Retain)) / $Retain"
