param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Suites
)

if (-not $Suites -or $Suites.Count -eq 0) {
  $Suites = @("core")
}

$env:PLAYWRIGHT_HEADFUL = "1"
if (-not $env:PLAYWRIGHT_SLOW_MO) {
  $env:PLAYWRIGHT_SLOW_MO = "150"
}
if (-not $env:UI_TEST_CONCURRENCY) {
  $env:UI_TEST_CONCURRENCY = "1"
}

node test/run-ui-tests.mjs @Suites
exit $LASTEXITCODE
