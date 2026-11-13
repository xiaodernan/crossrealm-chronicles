# verify-redis-trial.ps1 — prove W-Y6 切片3's Trial Redis mirror really persists Trial runs across restart.
#
# Preconditions: Java + built game-service jar at target/game-service-0.1.0-SNAPSHOT.jar, Docker available.
# What it does:
#   1. Starts a throwaway redis:7-alpine on port 26385
#   2. Boots game-service with game-service.trial.backend=redis (seed-demo-data=false)
#   3. POSTs 3 trials via /api/trials/runs with distinct seasons (ember)
#   4. ZCARD `trial-leaderboard:runs` == 3
#   5. Boots a SECOND instance against the same Redis → season filter shows ember top-3 correctly
#   6. Cleans up container + processes
# ASCII-only on purpose (PowerShell 5.1 ANSI hazard).

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = "crossrealm-trial-test"
$redisPort = 26385
$svcA = $null
$svcB = $null

function Cleanup {
    foreach ($p in @($svcA, $svcB)) { if ($p) { try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {} } }
    try { docker rm -f $redisContainer *>$null } catch {}
    Write-Output "cleanup done"
}

try {

# 1. redis
docker rm -f $redisContainer *>$null
docker run -d --name $redisContainer -p "${redisPort}:6379" redis:7-alpine | Out-Null
Start-Sleep -Seconds 2
$ping = docker exec $redisContainer redis-cli ping
if ($ping -notmatch 'PONG') { Write-Error "redis container did not answer PING"; exit 1 }
Write-Output "redis up"

# 2. jar path
$repoRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repoRoot 'game-service/target/game-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error "game-service jar missing"; exit 1 }
Write-Output "starting first game-service on 28085 (trial.backend=redis)"
$logOutA = Join-Path ([System.IO.Path]::GetTempPath()) 'trial-a.out.log'
$logErrA = Join-Path ([System.IO.Path]::GetTempPath()) 'trial-a.err.log'
$svcA = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28085',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--game-service.trial.backend=redis',
    '--game-service.trial.seed-demo-data=false',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutA -RedirectStandardError $logErrA).Id

# 3. wait for health
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28085/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "service A never came up"; exit 1 }
Write-Output "service A healthy"

# 4. three trial submission runs
$runs = @(
    @{ runner='amber-spirit'; seasonId='ember'; score=9000; layersCleared=5; secondsLeft=47 },
    @{ runner='iron-scroll';  seasonId='ember'; score=8200; layersCleared=4; secondsLeft=22 },
    @{ runner='ash-sage';     seasonId='gloom'; score=7500; layersCleared=3; secondsLeft=11 }
)
foreach ($b in $runs) {
    $payload = @{ runner = $b.runner; seasonId = $b.seasonId; score = $b.score; layersCleared = $b.layersCleared; secondsLeft = $b.secondsLeft } | ConvertTo-Json -Compress
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28085/api/trials/runs' -ContentType 'application/json' -Body $payload -TimeoutSec 10
        if ($r.StatusCode -ne 201) { Write-Error "trial submit did not return 201"; exit 1 }
    } catch {
        Write-Error "trial submit threw: $_"; exit 1
    }
}

$xlen = docker exec $redisContainer redis-cli ZCARD trial-leaderboard:runs
$xlenNum = 0
if ([long]::TryParse(($xlen | Out-String).Trim(), [ref]$xlenNum)) {
    if ($xlenNum -ne 3) { Write-Error "expected 3 members in trial ZSET, got $xlenNum"; exit 1 }
} else { Write-Error "could not parse ZCARD output"; exit 1 }
Write-Output "trial-leaderboard:runs ZSET now holds 3 records"

# 5. stop service A, boot B against same Redis; ember season top-2 should hold both ember records
Stop-Process -Id $svcA -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$svcA = $null

$logOutB = Join-Path ([System.IO.Path]::GetTempPath()) 'trial-b.out.log'
$logErrB = Join-Path ([System.IO.Path]::GetTempPath()) 'trial-b.err.log'
$svcB = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28086',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--game-service.trial.backend=redis',
    '--game-service.trial.seed-demo-data=false',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutB -RedirectStandardError $logErrB).Id

$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$healthyB = $false
while ($sw2.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28086/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthyB = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthyB) { Write-Error "service B never came up"; exit 1 }
Write-Output "service B healthy"

$emberBoard = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28086/api/trials/leaderboard?season=ember&limit=10' -TimeoutSec 10).Content | ConvertFrom-Json
if ($emberBoard.count -lt 2) { Write-Error "expected ember season >= 2 entries after restart, got $($emberBoard.count)"; exit 1 }
Write-Output "after restart ember board count: $($emberBoard.count)"
if ($emberBoard.items[0].runner -ne 'amber-spirit') { Write-Error "ember top expected amber-spirit, got $($emberBoard.items[0].runner)"; exit 1 }

Write-Output "verify-redis-trial PASSED"
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
