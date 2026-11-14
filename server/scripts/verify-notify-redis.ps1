# verify-notify-redis.ps1 - prove W-Z49 notification-service end to end on a throwaway redis.
#
# Preconditions: Java + docker + notification-service jar built (mvn -B -pl notification-service package -DskipTests).
# What it does:
#   1. Throwaway redis:7-alpine container on port 26385
#   2. Boot notification-service with spring.cache.type=redis on 28085
#      POST /api/notify (achievement) -> 201 stored=true broadcast=true
#      GET  /api/notify/recent?limit=1 -> the row we just wrote, newest first
#   3. redis-cli checks: LLEN crossrealm:notify:recent == 1 ; HGET crossrealm:notify:stats achievement == 1
#   4. Restart with instance B on 28086 (same redis); /api/notify/recent must still show the row
#      (proves the ledger is really the shared redis, not process-local memory)
#   5. Stats endpoint reports backend=redis and totalPublished counts both writes
#   6. Cleanup container + both java processes
# ASCII-only on purpose (PS 5.1 hazard). No secrets involved.

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = 'crossrealm-notify-test'
$redisPort = 26385
$svcA = $null
$svcB = $null

function Cleanup {
    foreach ($p in @($svcA, $svcB)) { if ($p) { try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {} } }
    try { docker rm -f $redisContainer *>$null } catch {}
    Write-Output 'cleanup done'
}

try {

# 1. redis
docker rm -f $redisContainer *>$null
docker run -d --name $redisContainer -p "${redisPort}:6379" redis:7-alpine | Out-Null
Start-Sleep -Seconds 2
$ping = docker exec $redisContainer redis-cli ping
if ($ping -notmatch 'PONG') { Write-Error "redis container did not answer PING (got: $ping)"; exit 1 }
Write-Output 'redis up'

# 2. notification-service instance A
$repoRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repoRoot 'notification-service/target/notification-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error 'notification-service jar missing; run mvn -B -pl notification-service package -DskipTests first'; exit 1 }
Write-Output 'starting first notification-service instance on port 28085'
$logOutA = Join-Path ([System.IO.Path]::GetTempPath()) 'notify-a.out.log'
$logErrA = Join-Path ([System.IO.Path]::GetTempPath()) 'notify-a.err.log'
$svcA = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28085',
    "--spring.data.redis.host=localhost",
    "--spring.data.redis.port=$redisPort",
    '--spring.cache.type=redis',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutA -RedirectStandardError $logErrA).Id

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28085/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "notification-service A health never came up (see $logOutA / $logErrA)"; exit 1 }
Write-Output 'notification-service A healthy'

# 3. publish once, then read recent + raw redis state
$body = '{"kind":"achievement","title":"Triad in Frequency","body":"border, underworld and deep-space echoes all resonate"}'
$pr = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28085/api/notify' -ContentType 'application/json' -Body $body -TimeoutSec 10
if ($pr.StatusCode -ne 201) { Write-Error "publish expected 201, got $($pr.StatusCode): $($pr.Content)"; exit 1 }
$published = $pr.Content | ConvertFrom-Json
if ($published.stored -ne $true) { Write-Error "publish stored expected true, got $($published.stored)"; exit 1 }
Write-Output "publish stored id=$($published.id) broadcast=$($published.broadcast)"

$recent = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28085/api/notify/recent?limit=1' -TimeoutSec 10).Content | ConvertFrom-Json
if ([int]$recent.count -ne 1) { Write-Error "recent count expected 1, got $($recent.count)"; exit 1 }
if ($recent.items[0].kind -ne 'achievement') { Write-Error "recent kind expected achievement, got $($recent.items[0].kind)"; exit 1 }
if ($recent.items[0].title -ne 'Triad in Frequency') { Write-Error "recent title mismatch: $($recent.items[0].title)"; exit 1 }
Write-Output 'recent endpoint returned the just-published row'

$llen = (docker exec $redisContainer redis-cli LLEN crossrealm:notify:recent | Out-String).Trim()
if ($llen -ne '1') { Write-Error "redis LLEN crossrealm:notify:recent expected 1, got $llen"; exit 1 }
$hget = (docker exec $redisContainer redis-cli HGET crossrealm:notify:stats achievement | Out-String).Trim()
if ($hget -ne '1') { Write-Error "redis HGET crossrealm:notify:stats achievement expected 1, got $hget"; exit 1 }
Write-Output 'redis ledger verified (list + hash)'

# 4. restart with instance B -- state must be the shared redis, not process memory
Stop-Process -Id $svcA -Force -ErrorAction SilentlyContinue
$svcA = $null
Start-Sleep -Seconds 2

$logOutB = Join-Path ([System.IO.Path]::GetTempPath()) 'notify-b.out.log'
$logErrB = Join-Path ([System.IO.Path]::GetTempPath()) 'notify-b.err.log'
Write-Output 'starting second notification-service instance on port 28086'
$svcB = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28086',
    "--spring.data.redis.host=localhost",
    "--spring.data.redis.port=$redisPort",
    '--spring.cache.type=redis',
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
if (-not $healthyB) { Write-Error "notification-service B health never came up (see $logOutB / $logErrB)"; exit 1 }
Write-Output 'notification-service B healthy'

$recentB = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28086/api/notify/recent?limit=1' -TimeoutSec 10).Content | ConvertFrom-Json
if ($recentB.items[0].kind -ne 'achievement') { Write-Error 'instance B did not see the shared-redis row (process memory would be empty)'; exit 1 }
Write-Output 'cross-instance proof OK (row visible from fresh JVM; shared redis)'

# 5. stats endpoint: second instance publishes too, count must accumulate
$body2 = '{"kind":"season","title":"Season turnover","body":"ember yields to tide"}'
$pr2 = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28086/api/notify' -ContentType 'application/json' -Body $body2 -TimeoutSec 10
if ($pr2.StatusCode -ne 201) { Write-Error "instance B publish expected 201, got $($pr2.StatusCode)"; exit 1 }
$stats = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28086/api/notify/stats' -TimeoutSec 10).Content | ConvertFrom-Json
if ($stats.backend -ne 'redis') { Write-Error "stats backend expected redis, got $($stats.backend)"; exit 1 }
if ([long]$stats.totalPublished -lt 2) { Write-Error "totalPublished expected >= 2, got $($stats.totalPublished)"; exit 1 }
if ([long]$stats.byKind.achievement -lt 1 -or [long]$stats.byKind.season -lt 1) { Write-Error "byKind missing achievement or season: $($stats.byKind | ConvertTo-Json -Compress)"; exit 1 }
Write-Output "stats verified (backend=$($stats.backend) totalPublished=$($stats.totalPublished))"

Write-Output 'verify-notify-redis PASSED'
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
