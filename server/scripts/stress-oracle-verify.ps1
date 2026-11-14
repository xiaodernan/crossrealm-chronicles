# stress-oracle-verify.ps1 — Lore Oracle stress gate (W-Z86, 2026-11-16)
#
# Boots throwaway: ① local-stub-llm.mjs (deterministic fake upstream, 20 ms, Streamed SSE)
#                  ② ai-service (eureka/config disabled) wired to the stub
# then hammers /api/ai/* with scripts/stress-oracle.mjs (mixed scenario).
# Any 5xx -> RED; errRate > MaxFailRate -> RED; rpsApprox < MinRps -> RED.
# Kills ONLY its own PIDs (stub node + this java ai-service) - never sweeps java.
#
# Sibling to stress-load.mjs / stress-verify.ps1. Usage:
#   powershell -ExecutionPolicy Bypass -File .\server\scripts\stress-oracle-verify.ps1
#   powershell -ExecutionPolicy Bypass -File .\server\scripts\stress-oracle-verify.ps1 -Concurrency 60 -DurationSec 20

param(
    [int]$StubPort = 28884,
    [int]$OraclePort = 28883,
    [int]$Concurrency = 40,
    [int]$DurationSec = 16,
    [double]$MaxFailRate = 0.02,
    [int]$MinRps = 150,
    [ValidateSet('mixed', 'readBurst', 'answerBurst')]
    [string]$Scenario = 'mixed'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$logDir = Join-Path $env:TEMP "crossrealm-oracle-stress-$PID"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Write-Output "stress-oracle-verify: log dir = $logDir"

function Test-PortFree([int]$p) {
    # Windows keeps closed listeners in TIME_WAIT for ~2 min; that's not "busy",
    # nobody can accept() on them — only a LISTENING state means a real occupant.
    $c = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    return -not ($c | Where-Object { $_.State -eq 'Listen' })
}
if (-not (Test-PortFree $StubPort)) { throw "stress-oracle-verify: stub port $StubPort busy - free it or pass -StubPort" }
if (-not (Test-PortFree $OraclePort)) { throw "stress-oracle-verify: oracle port $OraclePort busy - free it or pass -OraclePort" }

$jar = Join-Path $root 'server\ai-service\target\ai-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) {
    Write-Output 'stress-oracle-verify: jar missing - building (skipTests) ...'
    & mvn -q -o -f "server\pom.xml" -pl ai-service -am package '-DskipTests' | Out-Null
}
if (-not (Test-Path $jar)) { throw 'stress-oracle-verify: build did not produce the jar' }

$stub = $null
$oracle = $null
$ScriptFailed = $false
$oracleLog = Join-Path $logDir 'ai-service.log'
$oracleErr = Join-Path $logDir 'ai-service.err.log'

try {
    Write-Output 'stress-oracle-verify: starting stub ...'
    $stub = Start-Process -FilePath 'node' -ArgumentList (Join-Path $root 'scripts\local-stub-llm.mjs'), "--port=$StubPort" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'stub.log') -RedirectStandardError (Join-Path $logDir 'stub.err.log')
    Start-Sleep -Seconds 1

    Write-Output 'stress-oracle-verify: starting ai-service (stub-backed) ...'
    $env:SERVER_PORT = "$OraclePort"
    $env:EUREKA_CLIENT_ENABLED = 'false'
    $env:SPRING_CLOUD_CONFIG_ENABLED = 'false'
    $env:LLM_API_KEY = 'stub-test-key'
    $env:LLM_BASE_URL = "http://127.0.0.1:$StubPort/v1"
    $env:LLM_MODEL = 'gpt-6-sol'
    $oracle = Start-Process -FilePath 'java' -ArgumentList '-jar', $jar -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $oracleLog -RedirectStandardError $oracleErr

    # ── wait for readiness: lore health (404 -> oracle not up yet; 200 -> up)
    $deadline = (Get-Date).AddSeconds(60)
    $up = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$OraclePort/api/ai/lore/health" -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $up = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $up) {
        Get-Content $oracleLog -Encoding UTF8 -Tail 12
        throw 'stress-oracle-verify: oracle never became healthy (see log above)'
    }

    # ── the gate
    Write-Output "stress-oracle-verify: hammering ($Scenario scenario, concurrency=$Concurrency, duration=${DurationSec}s) ..."
    & node scripts/stress-oracle.mjs --target "http://127.0.0.1:$OraclePort" --scenario $Scenario --concurrency $Concurrency --duration $DurationSec --max-fail-rate $MaxFailRate
    $gateExit = $LASTEXITCODE

    # ── keep a permanent record of the run
    $record = [PSCustomObject]@{
        timestamp = (Get-Date).ToString('o')
        scenario  = $Scenario
        port      = $OraclePort
        gateExit  = $gateExit
        logDir    = $logDir
    }
    $record | ConvertTo-Json | Set-Content (Join-Path $logDir 'record.json') -Encoding UTF8

    if ($gateExit -ne 0) {
        Write-Output 'stress-oracle-verify: RED - gate failed (see record.json)'
        $ScriptFailed = $true
    } else {
        Write-Output 'stress-oracle-verify: GREEN - zero 5xx, errRate ok, throughput ok'
    }
} finally {
    if ($oracle) { Stop-Process -Id $oracle.Id -Force -ErrorAction SilentlyContinue }
    if ($stub)   { Stop-Process -Id $stub.Id   -Force -ErrorAction SilentlyContinue }
    Remove-Item Env:LLM_API_KEY, Env:LLM_BASE_URL -ErrorAction SilentlyContinue
}
if ($ScriptFailed) { exit 1 } else { Write-Output 'stress-oracle-verify: done (logs kept in temp).' }
