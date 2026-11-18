# ANES Browser Agent — native messaging kaydını kaldırır.
# Kullanım: powershell -ExecutionPolicy Bypass -File unregister.ps1
$ErrorActionPreference = "Stop"

$HostName = "com.webtelya.anes.ai"
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
if (Test-Path $RegPath) {
    Remove-Item -Path $RegPath -Recurse -Force
    Write-Host "Kayit kaldirildi: $RegPath"
} else {
    Write-Host "Kayit zaten yok: $RegPath"
}
