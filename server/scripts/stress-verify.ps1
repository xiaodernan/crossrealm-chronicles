# stress-verify.ps1 — Online partner stress gate (W-Z79b, 2026-11-14)
#
# Boots a throwaway game-service process, hammers it with scripts/stress-load.mjs
# (mixed scenario), asserts zero 5xx / errRate <= 2% / rps >= MinRps. Non-zero exit on RED.
#
# Sibling to the other verify-*.ps1 in this directory:
#   - asserts the port block is free first (default 28081, overridable)
#   - builds the jar only if missing
#   - kills only its own PID; never Stop-Process java (would kill other Java projects)
#   - logs land under $env:TEMP\crossrealm-server-stress-<pid>\; auto-cleaned
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\stress-verify.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\stress-verify.ps1 -Port 28087 -Concurrency 60 -DurationSec 20
#
# Gates: any 5xx > 0 -> RED; errRate > MaxFailRate -> RED; rpsApprox < MinRps -> RED.

param(
    [int]$Port = 28081,
    [int]$Concurrency = 60,
    [int]$DurationSec = 20,
    [double]$MaxFailRate = 0.02,
    [int]$MinRps = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$logDir = Join-Path $env:TEMP "crossrealm-server-stress-$PID"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Write-Output "stress-verify: log dir = $logDir"

# ── 0) Port sanity
function Test-PortFree([int]$p) {
    $c = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    return -not ($c | Where-Object { $_.State -in 'Listen','TimeWait' })
}
$useExternal = $false
if (-not (Test-PortFree $Port)) {
    Write-Output "stress-verify: port $Port busy; expecting a healthy game-service from outside (I will NOT start one)"
    $useExternal = $true
}

# ── 1) Build (skip if jar present)
$jar = Join-Path $root 'server\game-service\target\game-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) {
    Write-Output 'stress-verify: jar missing, building ...'
    & mvn -q -o -f "server\pom.xml" -pl game-service -am package '-DskipTests' | Out-Null
    if (-not (Test-Path $jar)) { throw 'stress-verify: build did not produce the jar' }
} else {
    Write-Output "stress-verify: jar present ($([math]::Round((Get-Item $jar).Length/1MB,1)) MB) - skipping rebuild"
}

# ── 2) Boot (eureka/config disabled so we never touch someone else's registry)
$gameLogs = Join-Path $logDir 'game-service.log'
$errLogs  = Join-Path $logDir 'game-service.err.log'
$pidFile  = $null
$proc     = $null
if (-not $useExternal) {
    $env:SERVER_PORT = "$Port"
    $env:EUREKA_CLIENT_ENABLED = 'false'
    $env:SPRING_CLOUD_CONFIG_ENABLED = 'false'
    $proc = Start-Process -FilePath 'java' -ArgumentList '-jar',$jar -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $gameLogs -RedirectStandardError $errLogs
    $pidFile = Join-Path $logDir 'booted.pid'
    "$($proc.Id)" | Out-File -FilePath $pidFile -Encoding ascii
    Write-Output "stress-verify: booted game-service pid=$($proc.Id)"
}

# ── 3) Wait healthy, max ~90s
$deadline = (Get-Date).AddSeconds(90)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/version" -TimeoutSec 3 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $healthy) {
    Write-Output 'stress-verify: service did not become healthy in 90s -- log tail:'
    Get-Content $gameLogs -Tail 30 -Encoding UTF8
    if ($pidFile) { Stop-Process -Id (Get-Content $pidFile) -Force -ErrorAction SilentlyContinue }
    throw 'stress-verify: RED (service unreachable)'
}
Write-Output "stress-verify: healthy at 127.0.0.1:$Port -- running stress ..."

# ── 4) Hammer it
$report = Join-Path $logDir 'stress.json'
$spill  = Join-Path $logDir 'stress.stderr.txt'
$nodeArgs = @(
    'scripts\stress-load.mjs',
    "--target=http://127.0.0.1:$Port",
    '--scenario=mixed',
    "--concurrency=$Concurrency",
    "--duration=$DurationSec",
    '--json'
)
$p = Start-Process -FilePath 'node' -ArgumentList $nodeArgs -PassThru -Wait -NoNewWindow `
    -RedirectStandardOutput $report -RedirectStandardError $spill
$exit = $p.ExitCode
$raw  = Get-Content $report -Raw -Encoding UTF8
$json = $raw | ConvertFrom-Json
Write-Output "stress-verify: issued=$($json.issued) ok=$($json.ok) 4xx=$($json.client) 5xx=$($json.server)"
Write-Output "stress-verify: p50=$($json.latencyMs.p50) p95=$($json.latencyMs.p95) p99=$($json.latencyMs.p99) max=$($json.latencyMs.max) rps=$($json.rpsApprox)"
if ($exit -ne 0) { Write-Output "stress-verify: node reported non-zero exit ($exit) - check $spill" }

# ── 5) Verdict + cleanup (kill only our own PID)
if ($pidFile) {
    Stop-Process -Id (Get-Content $pidFile) -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

$verdict = @(
    ($json.server -eq 0),
    ($json.errRate -le $MaxFailRate),
    ($json.rpsApprox -ge $MinRps)
)
if ($verdict -contains $false) {
    Write-Output ("stress-verify: RED -- 5xx={0} errRate={1:P2}% rps={2:F1} (gates: 5xx=0 / errRate<={3:P2}% / rps>={4})" -f `
        $json.server, $json.errRate, $json.rpsApprox, $MaxFailRate, $MinRps)
    exit 1
}
Write-Output "stress-verify: GREEN -- $($json.ok)/$($json.issued) ok, rps=$($json.rpsApprox)"
exit 0
