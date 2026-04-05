param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaytestArgs
)

$env:PLAYWRIGHT_HEADFUL = "1"
if (-not $env:PLAYWRIGHT_SLOW_MO) {
  $env:PLAYWRIGHT_SLOW_MO = "150"
}

node scripts/playtest-watch.mjs @PlaytestArgs
exit $LASTEXITCODE
