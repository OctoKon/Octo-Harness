param([switch]$TestOnly)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$target = Join-Path $root "apps/desktop/src-tauri/target"
$tools = Join-Path $target "smoke-tools"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Write-JsonUtf8NoBom {
  param([string]$Path, [object]$Value)
  $json = ConvertTo-Json -InputObject $Value -Depth 5
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $utf8NoBom)
}

function Assert-SafeArchiveEntries {
  param([string]$Destination, [object[]]$Entries)
  $rootPath = [System.IO.Path]::GetFullPath($Destination).TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
  foreach ($entry in $Entries) {
    $entryPath = ([string]$entry.FullName).Replace([char]92, [char]47)
    $segments = $entryPath.Split('/')
    if ($entryPath.StartsWith('/') -or $segments -contains '..' -or @($segments | Where-Object { $_.Contains(':') }).Count -gt 0) {
      throw "The Microsoft WebDriver archive contains an unsafe path."
    }
    $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path $Destination $entryPath))
    if (-not $resolvedPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "The Microsoft WebDriver archive contains an unsafe path."
    }
  }
}

function Test-DriverPreparationGuards {
  $rootPath = Join-Path $env:TEMP "release-driver-guard-test-$([guid]::NewGuid().ToString('N'))"
  Assert-SafeArchiveEntries $rootPath @(
    [pscustomobject]@{ FullName = "msedgedriver.exe" },
    [pscustomobject]@{ FullName = "Driver_Notes/EULA" },
    [pscustomobject]@{ FullName = "Driver_Notes\credits.html" }
  )
  foreach ($unsafe in @("../escape", "..\escape", "nested/../../escape", "/absolute", "C:\absolute")) {
    $rejected = $false
    try { Assert-SafeArchiveEntries $rootPath @([pscustomobject]@{ FullName = $unsafe }) }
    catch { $rejected = $true }
    if (-not $rejected) { throw "The archive guard accepted unsafe path '$unsafe'." }
  }

  $manifestPath = Join-Path $env:TEMP "release-driver-manifest-test-$([guid]::NewGuid().ToString('N')).json"
  try {
    Write-JsonUtf8NoBom $manifestPath ([ordered]@{ schemaVersion = 1 })
    $bytes = [System.IO.File]::ReadAllBytes($manifestPath)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
      throw "The driver manifest must be UTF-8 without a BOM."
    }
    $null = [System.Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -ErrorAction Stop
  }
  finally {
    if (Test-Path -LiteralPath $manifestPath) { Remove-Item -LiteralPath $manifestPath -Force }
  }
}

Test-DriverPreparationGuards
if ($TestOnly) { Write-Output "Driver preparation guard tests passed."; exit 0 }

$inventory = Get-Content (Join-Path $PSScriptRoot "tauri-driver-inventory.json") -Raw | ConvertFrom-Json
$tauriPin = $inventory | Where-Object { $_.name -eq "tauri-driver" }
if (-not $tauriPin -or $tauriPin.version -notmatch '^\d+\.\d+\.\d+$' -or $tauriPin.crateSha256 -notmatch '^[0-9a-f]{64}$') {
  throw "The tauri-driver inventory pin is incomplete."
}

$build = Join-Path $target "smoke-driver-build"
$cargoHome = Join-Path $target "smoke-cargo-home-$([guid]::NewGuid().ToString('N'))"
$previousCargoHome = $env:CARGO_HOME
$env:CARGO_HOME = $cargoHome
try {
  & cargo install tauri-driver --version $tauriPin.version --locked --force --root $tools --target-dir $build
  $cargoExitCode = $LASTEXITCODE
}
finally {
  if ($null -eq $previousCargoHome) { Remove-Item Env:CARGO_HOME -ErrorAction SilentlyContinue }
  else { $env:CARGO_HOME = $previousCargoHome }
}
if ($cargoExitCode -ne 0) { throw "cargo install tauri-driver failed with exit code $cargoExitCode." }

$crateCache = Join-Path $cargoHome "registry/cache"
$crateFiles = @(Get-ChildItem -LiteralPath $crateCache -Filter "tauri-driver-$($tauriPin.version).crate" -File -Recurse)
if ($crateFiles.Count -eq 0) { throw "Cargo did not retain the pinned tauri-driver source archive." }
$crateHashes = @($crateFiles | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } | Select-Object -Unique)
if ($crateHashes.Count -ne 1 -or $crateHashes[0] -ne $tauriPin.crateSha256) {
  throw "The cached tauri-driver source archive does not match the pinned crate checksum."
}

$runtimeGuid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$runtimeKeys = @(
  @{ Path = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeGuid"; Scope = "machine" },
  @{ Path = "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid"; Scope = "machine" },
  @{ Path = "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid"; Scope = "user" }
)
$runtimeRegistration = $null
foreach ($entry in $runtimeKeys) {
  if (Test-Path -LiteralPath $entry.Path) {
    $candidate = Get-ItemProperty -LiteralPath $entry.Path -ErrorAction Stop
    if ($candidate.pv -match '^\d+(?:\.\d+){3}$' -and $candidate.pv -ne "0.0.0.0") {
      $runtimeRegistration = $entry
      $runtimeRegistration.Version = $candidate.pv
      $runtimeRegistration.Location = $candidate.location
      break
    }
  }
}
if (-not $runtimeRegistration) { throw "The Evergreen WebView2 Runtime is not registered." }
$runtimeVersion = $runtimeRegistration.Version
$runtimeFiles = @()
if ($runtimeRegistration.Location) {
  $runtimeFiles += Join-Path (Join-Path $runtimeRegistration.Location $runtimeVersion) "msedgewebview2.exe"
  $runtimeFiles += Join-Path $runtimeRegistration.Location "msedgewebview2.exe"
}
if ($runtimeRegistration.Scope -eq "user" -and $env:LOCALAPPDATA) {
  $runtimeFiles += Join-Path $env:LOCALAPPDATA "Microsoft\EdgeWebView\Application\$runtimeVersion\msedgewebview2.exe"
}
$runtimeFiles += Join-Path ${env:ProgramFiles(x86)} "Microsoft\EdgeWebView\Application\$runtimeVersion\msedgewebview2.exe"
$runtimeFiles += Join-Path $env:ProgramFiles "Microsoft\EdgeWebView\Application\$runtimeVersion\msedgewebview2.exe"
$runtimeExecutable = $runtimeFiles | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $runtimeExecutable) { throw "The registered WebView2 runtime executable was not found." }
$runtimeFileVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($runtimeExecutable).ProductVersion
if ($runtimeFileVersion -ne $runtimeVersion) { throw "The WebView2 registry and executable versions disagree." }

$pageUrl = "https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver"
$page = (Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -TimeoutSec 30).Content
$runtimeBuild = ($runtimeVersion.Split('.')[0..2] -join '.')
$availableVersions = [regex]::Matches($page, 'href="https://msedgedriver\.microsoft\.com/(\d+\.\d+\.\d+\.\d+)/edgedriver_win64\.zip"') |
  ForEach-Object { $_.Groups[1].Value } |
  Where-Object { ($_.Split('.')[0..2] -join '.') -eq $runtimeBuild } |
  Select-Object -Unique
$edgeVersion = $availableVersions | Sort-Object { [version]$_ } -Descending | Select-Object -First 1
if (-not $edgeVersion) { throw "Microsoft's driver catalog has no x64 WebDriver matching WebView2 $runtimeBuild." }

$edgeUrl = "https://msedgedriver.microsoft.com/$edgeVersion/edgedriver_win64.zip"
$edgeDirectory = Join-Path $tools "edge-$edgeVersion"
New-Item -ItemType Directory -Path $edgeDirectory -Force | Out-Null
$edgeArchive = Join-Path $edgeDirectory "edgedriver_win64.zip"
Invoke-WebRequest -Uri $edgeUrl -OutFile $edgeArchive -TimeoutSec 120
$archiveHash = (Get-FileHash -LiteralPath $edgeArchive -Algorithm SHA256).Hash.ToLowerInvariant()

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($edgeArchive)
try {
  foreach ($entry in $zip.Entries) {
    Assert-SafeArchiveEntries $edgeDirectory @($entry)
  }
  if (-not ($zip.Entries | Where-Object { $_.FullName -eq "msedgedriver.exe" })) {
    throw "The Microsoft WebDriver archive is missing msedgedriver.exe."
  }
}
finally { $zip.Dispose() }
Expand-Archive -LiteralPath $edgeArchive -DestinationPath $edgeDirectory -Force
$edgeExecutable = Join-Path $edgeDirectory "msedgedriver.exe"
$edgeFileVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($edgeExecutable).ProductVersion
if ($edgeFileVersion -ne $edgeVersion) { throw "The downloaded WebDriver bytes have an unexpected file version." }
$edgeHash = (Get-FileHash -LiteralPath $edgeExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
$tauriExecutable = Join-Path $tools "bin/tauri-driver.exe"
if (-not (Test-Path -LiteralPath $tauriExecutable -PathType Leaf)) { throw "The pinned tauri-driver executable is missing." }
$tauriHash = (Get-FileHash -LiteralPath $tauriExecutable -Algorithm SHA256).Hash.ToLowerInvariant()

$manifest = [ordered]@{
  schemaVersion = 1
  preparedAtUtc = [DateTime]::UtcNow.ToString("o")
  tauriDriver = [ordered]@{
    version = $tauriPin.version
    crateUrl = "https://crates.io/api/v1/crates/tauri-driver/$($tauriPin.version)/download"
    crateSha256 = $tauriPin.crateSha256
    binarySha256 = $tauriHash
  }
  webview2 = [ordered]@{
    distribution = "Evergreen"
    runtimeVersion = $runtimeVersion
    registryScope = $runtimeRegistration.Scope
  }
  edgeDriver = [ordered]@{
    version = $edgeVersion
    sourcePage = $pageUrl
    downloadUrl = $edgeUrl
    archiveSha256 = $archiveHash
    binarySha256 = $edgeHash
  }
}
$manifestPath = Join-Path $tools "driver-manifest.json"
Write-JsonUtf8NoBom $manifestPath $manifest
Write-Output "Qualified tauri-driver $($tauriPin.version) and WebDriver $edgeVersion for Evergreen WebView2 $runtimeVersion."
