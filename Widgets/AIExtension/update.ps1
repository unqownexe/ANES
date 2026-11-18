# ANES AIExtension — GitHub'dan guncelleme.
# ANES acilista ve 30 dakikada bir -Quiet ile cagirir.
# Elle calistirmak icin update.bat kullanin.
param([switch]$Quiet)

$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$root   = $PSScriptRoot
$status = Join-Path $env:TEMP "anes_ext_update.status"

function Set-Status([string]$text) {
    try {
        [IO.File]::WriteAllText($status, $text, (New-Object System.Text.UTF8Encoding($false)))
    } catch {}
}

function Say([string]$text) {
    if (-not $Quiet) { Write-Host $text }
}

function Get-VerParts([string]$v) {
    $m = [regex]::Match($v, '^\d+(\.\d+){0,3}')
    if (-not $m.Success) { return @(0, 0, 0, 0) }
    $p = @($m.Value.Split('.') | ForEach-Object { [int]$_ })
    while ($p.Count -lt 4) { $p += 0 }
    return $p
}

function Compare-Ver([string]$a, [string]$b) {
    $x = Get-VerParts $a
    $y = Get-VerParts $b
    for ($i = 0; $i -lt 4; $i++) {
        if ($x[$i] -ne $y[$i]) { return ($x[$i] - $y[$i]) }
    }
    return 0
}

try {
    $manifestPath = Join-Path $root "manifest.json"
    if (-not (Test-Path $manifestPath)) { throw "manifest.json bulunamadi" }
    $localVer = [string](Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json).version
    if ([string]::IsNullOrWhiteSpace($localVer)) { $localVer = "0.0.0" }
    Say ("Yerel surum  : " + $localVer)

    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $url = "https://raw.githubusercontent.com/unqownexe/ANES/refs/heads/main/Widgets/AIExtension/version.json?t=" + $stamp
    Say "GitHub kontrol ediliyor..."
    $meta = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20

    $remoteVer = [string]$meta.lastVersion
    if ([string]::IsNullOrWhiteSpace($remoteVer)) { throw "version.json surum icermiyor" }
    Say ("GitHub surumu: " + $remoteVer)

    if ((Compare-Ver $remoteVer $localVer) -le 0) {
        Set-Status ("CURRENT " + $localVer)
        Say "Eklenti zaten guncel."
        exit 0
    }

    $link = [string]$meta.downloadLink
    if ([string]::IsNullOrWhiteSpace($link)) {
        $link = "https://raw.githubusercontent.com/unqownexe/ANES/refs/heads/main/Widgets/AIExtension/downloads/AIExtension-" + $remoteVer + ".zip"
    }

    $tmp = Join-Path $env:TEMP ("anes_ext_" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $zip = Join-Path $tmp "AIExtension.zip"
    Say "Indiriliyor..."
    Invoke-WebRequest -Uri $link -OutFile $zip -UseBasicParsing -TimeoutSec 180

    $sha = [string]$meta.sha256
    if (-not [string]::IsNullOrWhiteSpace($sha)) {
        $got = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($got -ne $sha.ToLowerInvariant()) { throw "sha256 uyusmadi" }
        Say "sha256 dogrulandi."
    }

    $files = Join-Path $tmp "files"
    Expand-Archive -LiteralPath $zip -DestinationPath $files -Force
    if (-not (Test-Path (Join-Path $files "manifest.json"))) {
        throw "paket gecersiz (manifest.json yok)"
    }

    Say "Dosyalar kopyalaniyor..."
    robocopy $files $root /E /NFL /NDL /NJH /NJS /NP /R:3 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw ("dosyalar kopyalanamadi (robocopy " + $LASTEXITCODE + ")") }

    # Yerel surum bilgisi (bir sonraki karsilastirma icin).
    $meta | ConvertTo-Json -Depth 8 |
        Set-Content -LiteralPath (Join-Path $root "version.json") -Encoding UTF8

    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Set-Status ("UPDATED " + $remoteVer)
    Say ("Guncellendi: " + $localVer + " -> " + $remoteVer)
    Say "Chrome > chrome://extensions > eklentiyi Yenile."
    exit 0
}
catch {
    $msg = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "bilinmeyen hata" }
    Set-Status ("ERROR " + $msg)
    Say ("HATA: " + $msg)
    exit 1
}
