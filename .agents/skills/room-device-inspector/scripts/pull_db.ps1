param(
    [string]$DeviceSerial = "",
    [string]$OutputDir = ".local_db"
)

$adbArgs = if ($DeviceSerial) { @("-s", $DeviceSerial) } else { @() }

Write-Host "Enviando comando para exportar e descriptografar Room DB no dispositivo..." -ForegroundColor Cyan
& adb @adbArgs shell am broadcast -a com.lucasdeeiroz.autoreply.EXPORT_DB -n com.lucasdeeiroz.autoreply/.receivers.RoomInspectorReceiver

Start-Sleep -Seconds 2

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$remoteDbPath = "/sdcard/Android/data/com.lucasdeeiroz.autoreply/files/autoreply_plain.db"
$remoteSummaryPath = "/sdcard/Android/data/com.lucasdeeiroz.autoreply/files/autoreply_summary.json"
$localDbPath = Join-Path $OutputDir "autoreply_plain.db"
$localSummaryPath = Join-Path $OutputDir "autoreply_summary.json"

Write-Host "Baixando banco descriptografado ($remoteDbPath)..." -ForegroundColor Cyan
& adb @adbArgs pull $remoteDbPath $localDbPath
& adb @adbArgs pull $remoteSummaryPath $localSummaryPath

if (Test-Path $localDbPath) {
    $bytes = (Get-Item $localDbPath).Length
    Write-Host "Banco Room baixado com sucesso em '$localDbPath' ($bytes bytes)!" -ForegroundColor Green
    if (Test-Path $localSummaryPath) {
        Write-Host "`nResumo Estatistico do Banco:" -ForegroundColor Yellow
        Get-Content $localSummaryPath | Write-Host
    }
} else {
    Write-Host "Falha ao obter o banco. Verifique se o app esta instalado e rodando." -ForegroundColor Red
    exit 1
}
