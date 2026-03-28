param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Suites
)

$ErrorActionPreference = "Stop"

if (-not $Suites -or $Suites.Count -eq 0) {
  $Suites = @("core")
}

$edgeCandidates = @()
$edgeCandidates += Get-ChildItem "C:\Program Files (x86)\Microsoft\Edge\Application" -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName "msedge.exe" }
$edgeCandidates += @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$browserPath = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browserPath) {
  throw "No supported Chromium-based browser was found. Install Edge or Chrome, or run the UI suites with the default Playwright browser setup."
}

$profileRoot = Join-Path $PWD ".tmp-external-browser"
$profilePath = Join-Path $profileRoot ([guid]::NewGuid().ToString("N"))
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ($listener.LocalEndpoint).Port
$listener.Stop()
$browserProcess = $null

New-Item -ItemType Directory -Force -Path $profilePath | Out-Null

try {
  $browserProcess = Start-Process -FilePath $browserPath -ArgumentList @(
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-startup-window",
    "--new-window",
    "--edge-skip-compat-layer-relaunch",
    "--remote-debugging-port=$port",
    "--user-data-dir=$profilePath",
    "about:blank"
  ) -PassThru

  $cdpReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    try {
      $null = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/json/version" -TimeoutSec 2
      $cdpReady = $true
      break
    } catch {
      continue
    }
  }

  if (-not $cdpReady) {
    throw "External browser started, but the CDP endpoint on port $port did not become ready."
  }

  $env:PLAYWRIGHT_CDP_URL = "http://127.0.0.1:$port"
  $env:UI_TEST_RUN_IN_PROCESS = "1"

  & node "test/run-ui-tests.mjs" @Suites
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Remove-Item Env:PLAYWRIGHT_CDP_URL -ErrorAction SilentlyContinue
  Remove-Item Env:UI_TEST_RUN_IN_PROCESS -ErrorAction SilentlyContinue

  if ($browserProcess -and -not $browserProcess.HasExited) {
    Stop-Process -Id $browserProcess.Id -Force -ErrorAction SilentlyContinue
  }

  Remove-Item -LiteralPath $profilePath -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $profileRoot) {
    $remaining = Get-ChildItem -LiteralPath $profileRoot -Force -ErrorAction SilentlyContinue
    if (-not $remaining) {
      Remove-Item -LiteralPath $profileRoot -Force -ErrorAction SilentlyContinue
    }
  }
}
