# verify-redis-leaderboard.ps1 — prove W-Y5's Redis mirror really persists and re-loads the top-K records.
#
# Preconditions: Java + built game-service jar at target/game-service-0.1.0-SNAPSHOT.jar, Docker available.
# What it does:
#   1. Starts a throwaway redis:7-alpine container on port 26384
#   2. Boots game-service with game-service.leaderboard.backend=redis pointing at it (seed-demo-data=false)
#   3. Submits three runs (8000 / 9000 / 10000 ms) via /api/leaderboard
#   4. Verifies top ordering and that the ZSET has exactly three members on the throwaway redis
#   5. Stops the service, boots a SECOND instance (same redis), and proves the records survived the restart
#   6. Cleans up the container and both service processes
# ASCII-only on purpose (PowerShell 5.1 ANSI hazard).

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = "crossrealm-lb-test"
$redisPort = 26384
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
if ($ping -notmatch 'PONG') { Write-Error "redis container did not answer PING (got: $ping)"; exit 1 }
Write-Output "redis up"

# 2. game-service A
$repoRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repoRoot 'game-service/target/game-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error "game-service jar missing; run 'mvn -B -pl game-service package -DskipTests' first"; exit 1 }
Write-Output "starting first game-service instance on port 28083 (seed-demo-data=false)"
$logOutA = Join-Path ([System.IO.Path]::GetTempPath()) 'leaderboard-a.out.log'
$logErrA = Join-Path ([System.IO.Path]::GetTempPath()) 'leaderboard-a.err.log'
$svcA = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28083',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--game-service.leaderboard.backend=redis',
    '--game-service.leaderboard.seed-demo-data=false',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutA -RedirectStandardError $logErrA).Id

# 3. wait for health
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28083/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "game-service A health never came up (see $logOutA / $logErrA)"; exit 1 }
Write-Output "game-service A healthy"

# 4. three submissions
$runs = @(
    @{ runner = 'crimson-gavel'; bossId = 'guardian-alpha'; clearTimeMs = 10000; chapter = 1 },
    @{ runner = 'silver-leaf';   bossId = 'guardian-alpha'; clearTimeMs = 8000;  chapter = 1 },
    @{ runner = 'shadow-dancer'; bossId = 'guardian-alpha'; clearTimeMs = 9000;  chapter = 1 }
)
foreach ($body in $runs) {
    $json = $body | ConvertTo-Json -Compress
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28083/api/leaderboard' -ContentType 'application/json' -Body $json -TimeoutSec 10
    if ($r.StatusCode -ne 201) { Write-Error "submit did not return 201: HTTP $($r.StatusCode) $($r.Content)"; exit 1 }
}

$top = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28083/api/leaderboard?limit=10' -TimeoutSec 10).Content | ConvertFrom-Json

if ($top.items.Count -ne 3) { Write-Error "expected exactly 3 items after seed-demo-data=false, got $($top.items.Count)"; exit 1 }
Write-Output "submitted 3 runs; top: $(($top.items | ForEach-Object { $_.runner + '=' + $_.clearTimeMs }) -join ', ')"
if ($top.items[0].runner -ne 'silver-leaf') { Write-Error "top-1 expected silver-leaf (8000ms), found: $($top.items[0].runner)"; exit 1 }

# five come from redis directly
$xlen = docker exec $redisContainer redis-cli ZCARD leaderboard:runs
Write-Output "ZCARD leaderboard:runs = $xlen"
$xlenNum = 0
if ([long]::TryParse(($xlen | Out-String).Trim(), [ref]$xlenNum)) {
    if ($xlenNum -ne 3) { Write-Error "expected exactly 3 members in the ZSET, got: $xlenNum"; exit 1 }
} else { Write-Error "could not parse ZCARD output: $xlen"; exit 1 }

# 5. stop service A, boot service B, verify persisted records
Write-Output "stopping service A (pid $svcA)"
Stop-Process -Id $svcA -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$svcA = $null

$logOutB = Join-Path ([System.IO.Path]::GetTempPath()) 'leaderboard-b.out.log'
$logErrB = Join-Path ([System.IO.Path]::GetTempPath()) 'leaderboard-b.err.log'
Write-Output "starting second game-service on port 28084"
$svcB = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28084',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--game-service.leaderboard.backend=redis',
    '--game-service.leaderboard.seed-demo-data=false',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutB -RedirectStandardError $logErrB).Id

$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$healthyB = $false
while ($sw2.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28084/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthyB = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthyB) { Write-Error "game-service B health never came up (see $logOutB / $logErrB)"; exit 1 }
Write-Output "game-service B healthy"

$topB = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28084/api/leaderboard?limit=10' -TimeoutSec 10).Content | ConvertFrom-Json
if ($topB.items.Count -ne 3) { Write-Error "expected exactly 3 items after restart, got $($topB.items.Count) (Redis mirror must restore them)"; exit 1 }
Write-Output "after restart: $(($topB.items | ForEach-Object { $_.runner + '=' + $_.clearTimeMs }) -join ', ')"
if ($topB.items[0].runner -ne 'silver-leaf') { Write-Error "top-1 after restart expected silver-leaf, found: $($topB.items[0].runner)"; exit 1 }

Write-Output "verify-redis-leaderboard PASSED"
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
