# W-Y2 / W-Y4 开发期 e2e：把六件套起到 28xxx 端口段，供 scripts/e2e-advisor.mjs 真打。
# ASCII-only on purpose (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
#
# SECURITY: the LLM key is NEVER written in this file, in config-server, or in any log.
# Export it in your shell first:  set -a; . ../.env; set +a   (see env.example)
$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:TEMP 'crossrealm-e2e-ai'
New-Item -ItemType Directory -Force $logDir | Out-Null

if (-not $env:LLM_API_KEY) { Write-Error 'LLM_API_KEY not set - refusing to boot the AI chain without a key'; exit 1 }
if (-not $env:LLM_BASE_URL) { $env:LLM_BASE_URL = 'https://wkapi.pro/v1' }
if (-not $env:LLM_MODEL) { $env:LLM_MODEL = 'gpt-6-sol' }
$env:EUREKA_CLIENT_SERVICEURL_DEFAULTZONE = 'http://localhost:28161/eureka/'
$env:EUREKA_INSTANCE_HOSTNAME = 'localhost'
$env:EUREKA_INSTANCE_PREFERIPADDRESS = 'false'

function Start-One([string]$name, [int]$port) {
    $log = Join-Path $logDir "$name.log"
    "" | Set-Content $log
    $jar = Join-Path (Join-Path (Join-Path $serverRoot $name) 'target') ($name + '-0.1.0-SNAPSHOT.jar')
    if (-not (Test-Path $jar)) { Write-Error "jar missing: $jar"; exit 1 }
    $p = Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar, "--server.port=$port") -PassThru -WindowStyle Hidden -WorkingDirectory $serverRoot -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    Write-Output "started $name pid=$($p.Id) port=$port"
    return $p
}

function Wait-Healthy([int]$port, [string]$name, [int]$timeoutSec = 240) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/actuator/health" -TimeoutSec 10; if ($r.StatusCode -eq 200) { Write-Output "$name healthy ($([int]$sw.Elapsed.TotalSeconds)s)"; return $true } } catch { Start-Sleep -Milliseconds 700 }
    }
    Write-Output "$name NOT healthy"
    return $false
}

# Never "Stop-Process -Name java -Force": that would kill unrelated Java projects
# on this machine. Refuse to start instead, and only stop the PIDs we start ourselves.
foreach ($port in 28161, 28888, 28081, 28082, 28083, 28080) {
    $probe = New-Object System.Net.Sockets.TcpClient
    try { $probe.Connect('127.0.0.1', $port); $busy = $true } catch { $busy = $false }
    finally { $probe.Close() }
    if ($busy) { Write-Error "port $port is already in use - free it before running the e2e boot"; exit 1 }
}
$procs = @()
try {
    $tmpConfigDir = Join-Path (Join-Path $serverRoot 'target') 'e2e-config'
    New-Item -ItemType Directory -Force $tmpConfigDir | Out-Null
    @'
game-service:
  leaderboard:
    seed-demo-data: true
    max-limit: 4
  telemetry:
    max-events: 500
  version-note: "e2e-ai-note"
'@ | Set-Content -Encoding UTF8 (Join-Path $tmpConfigDir 'game-service.yml')
    @'
season-service:
  cycle-days: 14
  override: ""
'@ | Set-Content -Encoding UTF8 (Join-Path $tmpConfigDir 'season-service.yml')
    @'
ai-service:
  model: gpt-6-sol
  max-retries: 1
  cache-ttl-seconds: 30
'@ | Set-Content -Encoding UTF8 (Join-Path $tmpConfigDir 'ai-service.yml')

    $procs += Start-One 'discovery-server' 28161
    if (-not (Wait-Healthy 28161 'discovery-server')) { exit 1 }
    $fs = $tmpConfigDir -replace '\\','/'
    $fileUri = if ($fs.StartsWith('/')) { "file:$fs" } else { "file:/$fs" }
    $env:SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS = $fileUri
    $procs += Start-One 'config-server' 28888
    Remove-Item Env:SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28888 'config-server')) { exit 1 }

    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:28888'
    $procs += Start-One 'game-service' 28081
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28081 'game-service')) { exit 1 }

    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:28888'
    $procs += Start-One 'season-service' 28082
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28082 'season-service')) { exit 1 }

    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:28888'
    $procs += Start-One 'ai-service' 28083
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28083 'ai-service')) { exit 1 }

    $procs += Start-One 'gateway' 28080
    if (-not (Wait-Healthy 28080 'gateway')) { exit 1 }

    Write-Output "AI_CHAIN_UP"
    $procs | ForEach-Object { Write-Output "PROC $($_.Id)" }
} catch {
    foreach ($p in $procs) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
    throw
}
