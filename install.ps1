$ErrorActionPreference = "Stop"

$Repository = "vestia-dev/recon"
$ReleaseRoot = "https://github.com/$Repository/releases"
$Version = $env:RECON_VERSION
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Invoke-RestMethod "https://api.github.com/repos/$Repository/releases/latest").tag_name
}
$Version = $Version.TrimStart("v")

$Architecture = if ($env:PROCESSOR_ARCHITEW6432) {
  $env:PROCESSOR_ARCHITEW6432
} else {
  $env:PROCESSOR_ARCHITECTURE
}
$Architecture = switch ($Architecture.ToUpperInvariant()) {
  "AMD64" { "x64" }
  "ARM64" { "arm64" }
  default { throw "Recon does not support this CPU architecture." }
}

$Artifact = "recon-windows-$Architecture.exe"
$Release = "$ReleaseRoot/download/v$Version"
$InstallDirectory = if ($env:RECON_INSTALL_DIR) {
  $env:RECON_INSTALL_DIR
} else {
  Join-Path $env:LOCALAPPDATA "Programs\Recon"
}
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "recon-$([guid]::NewGuid())"

try {
  New-Item -ItemType Directory -Force $TemporaryDirectory | Out-Null
  $Executable = Join-Path $TemporaryDirectory "recon.exe"
  $Checksums = Join-Path $TemporaryDirectory "checksums.txt"
  Invoke-WebRequest "$Release/$Artifact" -OutFile $Executable
  Invoke-WebRequest "$Release/checksums.txt" -OutFile $Checksums

  $ChecksumLine = Get-Content $Checksums | Where-Object { $_ -match "\s+$([regex]::Escape($Artifact))$" } | Select-Object -First 1
  if (-not $ChecksumLine) { throw "The release does not contain a checksum for $Artifact." }
  $Expected = ($ChecksumLine -split "\s+")[0]
  $Actual = (Get-FileHash -Algorithm SHA256 $Executable).Hash
  if ($Actual -ne $Expected) { throw "Checksum verification failed for $Artifact." }

  New-Item -ItemType Directory -Force $InstallDirectory | Out-Null
  Move-Item -Force $Executable (Join-Path $InstallDirectory "recon.exe")

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($UserPath -split ";") -notcontains $InstallDirectory) {
    [Environment]::SetEnvironmentVariable("Path", "$InstallDirectory;$UserPath", "User")
    Write-Host "Added $InstallDirectory to your user PATH; restart your terminal to use it."
  }
  Write-Host "Installed Recon $Version to $InstallDirectory\recon.exe"
} finally {
  Remove-Item -Recurse -Force $TemporaryDirectory -ErrorAction SilentlyContinue
}
