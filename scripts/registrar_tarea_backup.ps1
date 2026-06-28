# registrar_tarea_backup.ps1
# Ejecutar UNA SOLA VEZ (como administrador o con el usuario actual).
# Registra la tarea programada de backup invisible diario a las 23:00.

$TaskName   = "AutoMermas_Backup_Diario"
$ScriptPath = Join-Path $PSScriptRoot "backup.ps1"

$Action = New-ScheduledTaskAction `
    -Execute  "powershell.exe" `
    -Argument ("-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"" + $ScriptPath + "`"")

$Trigger = New-ScheduledTaskTrigger -Daily -At "23:00"

$Settings = New-ScheduledTaskSettingsSet `
    -Hidden `
    -ExecutionTimeLimit  (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -MultipleInstances   IgnoreNew

$Principal = New-ScheduledTaskPrincipal `
    -UserId    ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel  Highest

Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $Action `
    -Trigger   $Trigger `
    -Settings  $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Tarea '$TaskName' registrada." -ForegroundColor Green
Write-Host "  Ejecucion: diaria a las 23:00 — ventana oculta." -ForegroundColor Gray
Write-Host "  Script:    $ScriptPath" -ForegroundColor Gray
