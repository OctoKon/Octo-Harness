$ErrorActionPreference = "Stop"

if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64) {
  throw "The pinned Node runtime is for Windows x64."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pins = Get-Content (Join-Path $root "runtime-pins.json") -Raw | ConvertFrom-Json
$nodeVersion = (Get-Content (Join-Path $root ".node-version") -Raw).Trim()
if ($nodeVersion -notmatch '^\d+\.\d+\.\d+$' -or $nodeVersion -ne $pins.node.version -or $pins.node.target -ne "win-x64") {
  throw "The Node version file and runtime pin disagree."
}
$expectedUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"
if ($pins.node.url -ne $expectedUrl -or $pins.node.sha256 -notmatch '^[0-9a-f]{64}$') {
  throw "The Node runtime pin is not a valid official Windows x64 archive."
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempPrefix = $tempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$temp = Join-Path $tempRoot ("splyce-node-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $temp "node.zip"
$extract = Join-Path $temp "unpacked"
$target = Join-Path $root "apps/desktop/src-tauri/resources/engine/node.exe"
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  Invoke-WebRequest -Uri $pins.node.url -OutFile $archive -TimeoutSec 120 -UseBasicParsing
  $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $pins.node.sha256) {
    throw "Node archive SHA-256 mismatch: $actualHash"
  }

  Expand-Archive -LiteralPath $archive -DestinationPath $extract
  $source = Join-Path $extract "node-v$nodeVersion-win-x64/node.exe"
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "The pinned Node archive did not contain its expected executable."
  }

  New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Output "Prepared the checksum-verified Node $nodeVersion runtime."
}
finally {
  if ([IO.Path]::GetFullPath($temp).StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $temp -Recurse -Force
  }
}
