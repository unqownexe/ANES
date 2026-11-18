# ANES Browser Agent — sabit Chrome eklenti anahtarı üretir.
# Bu projede anahtar sabittir; betik yalnız anahtarı yeniden üretmek/doğrulamak
# gerekirse kullanılır. Üretilen özel anahtar ASLA depoya eklenmez.
# Kullanım: powershell -ExecutionPolicy Bypass -File tools\make-key.ps1 [-Out key.pem]
param(
    [string]$Out = ""
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$pub = $rsa.ExportSubjectPublicKeyInfo()
$b64 = [Convert]::ToBase64String($pub)

# Chrome eklenti kimliği: genel anahtarın SHA-256 özetinin ilk 16 baytı,
# her baytın 0-9a-f aralığına eşlenmesiyle oluşur.
$hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($pub)
$map = "0123456789abcdef"
$id = ""
for ($i = 0; $i -lt 16; $i++) {
    $id += $map[($hash[$i] -shr 4) -band 0xF]
    $id += $map[$hash[$i] -band 0xF]
}
Write-Host "Public key (manifest.json > key):"
Write-Host $b64
Write-Host ""
Write-Host "Extension ID: $id"
if ($Out) {
    $pem = $rsa.ExportRSAPrivateKeyPem()
    Set-Content -Path $Out -Value $pem -Encoding ascii
    Write-Host "Private key written to $Out (keep it secret)."
}
$rsa.Dispose()
