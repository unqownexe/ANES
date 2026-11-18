# ANES Browser Agent — Chrome native messaging ana bilgisayarını kaydeder.
# ANES > Ayarlar > AI > Tarayıcı Kontrolü > Kur da aynı işlemi yapar.
# Kullanım: powershell -ExecutionPolicy Bypass -File register.ps1
$ErrorActionPreference = "Stop"

$ExtensionId = "iakcbidfjppimplgjafglfolifgdgcpm"
$HostName = "com.webtelya.anes.ai"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Exe = Join-Path $Here "bin\anes_native_host.exe"

if (-not (Test-Path $Exe)) {
    Write-Host "Native host derleniyor..."
    & (Join-Path $Here "build_native_host.bat")
    if (-not (Test-Path $Exe)) {
        throw "anes_native_host.exe bulunamadi. Once build_native_host.bat calistirin."
    }
}

$ManifestPath = Join-Path $Here "$HostName.json"
$Manifest = [ordered]@{
    name = $HostName
    description = "ANES Browser Agent native messaging host"
    path = $Exe
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$Json = $Manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($ManifestPath, $Json, [System.Text.UTF8Encoding]::new($false))

$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Path $RegPath -Force | Out-Null
Set-Item -Path $RegPath -Value $ManifestPath

Write-Host ""
Write-Host "ANES Browser Agent kaydedildi."
Write-Host "  Manifest : $ManifestPath"
Write-Host "  Host     : $Exe"
Write-Host "  Kayit    : $RegPath"
Write-Host "  Eklenti  : $ExtensionId"
Write-Host ""
Write-Host "Chrome'da chrome://extensions > Paketlenmemis oge yukle ile AIExtension klasorunu secin."
