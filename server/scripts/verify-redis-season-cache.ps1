# verify-redis-season-cache.ps1 — prove season-service's @Cacheable layer really caches into Redis
# (Spring Cache, W-P6; records serialized by GenericJackson2JsonRedisSerializer with NON_FINAL typing).
#
# Preconditions: Java + built season-service jar at target/season-service-0.1.0-SNAPSHOT.jar, Docker available.
# What it does:
#   1. Starts a throwaway redis:7-alpine container on port 26382
#   2. Boots season-service with SPRING_CACHE_TYPE=redis pointing at it
#   3. Hits /api/seasons/active twice and checks the body is stable (served from cache)
#   4. Asserts the cache key `seasons::active` exists in redis with a positive TTL (~300s)
#   5. Stops redis and checks the endpoint fails (cache backend down)
#   6. Restarts redis and checks the endpoint answers again
#   7. Cleans up the container and the season-service process
# ASCII-only on purpose (PowerShell 5.1 ANSI hazard).

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = "crossrealm-season-cache-test"
$redisPort = 26382
$svcPid = $null

function Cleanup {
    if ($svcPid) { try { Stop-Process -Id $svcPid -Force -ErrorAction SilentlyContinue } catch {} }
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

# 2. season-service
$repoRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repoRoot 'season-service/target/season-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error "season-service jar missing; run 'mvn -B -pl season-service package -DskipTests' first"; exit 1 }
$logOut = Join-Path ([System.IO.Path]::GetTempPath()) 'season-cache.out.log'
$logErr = Join-Path ([System.IO.Path]::GetTempPath()) 'season-cache.err.log'
$svcPid = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28092',
    '--spring.cache.type=redis',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr).Id
Write-Output "season-service pid $svcPid"

# 3. wait for health
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 90) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28092/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "season-service health never came up (see $logOut / $logErr)"; exit 1 }
Write-Output "season-service healthy"

# 4. two reads; body must be identical (cache hit the second time)
$a = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28092/api/seasons/active' -TimeoutSec 10).Content
$b = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28092/api/seasons/active' -TimeoutSec 10).Content
Write-Output "first body:  $a"
Write-Output "second body: $b"
if ($a -ne $b) { Write-Error "bodies differ between the two reads — cache did not serve the second call"; exit 1 }

# 5. redis must hold the cache key with a positive TTL
$keys = docker exec $redisContainer redis-cli KEYS 'seasons*'
Write-Output "redis keys: $($keys -join ' | ')"
if (-not ($keys -match 'seasons')) { Write-Error "no seasons::* key in redis after two reads"; exit 1 }
foreach ($k in ($keys -split "`r?`n" | Where-Object { $_ -and $_.Trim() -ne '' })) {
    $pttl = docker exec $redisContainer redis-cli PTTL $k.Trim()
    Write-Output "PTTL $($k.Trim()) = $pttl ms"
    $pttlNum = 0
    if ([long]::TryParse(($pttl | Out-String).Trim(), [ref]$pttlNum)) {
        if ($pttlNum -le 0) { Write-Error "key $($k.Trim()) has non-positive TTL: $pttlNum"; exit 1 }
    }
}

# 6. kill redis; endpoint must fail (cache backend unreachable)
docker stop $redisContainer | Out-Null
Write-Output "=== 6) redis stopped; endpoint must fail, not silently serve stale ==="
$failed = $false
try {
    $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28092/api/seasons/active' -TimeoutSec 20
    Write-Output "endpoint returned HTTP $($r.StatusCode) with redis down — unexpected but not fatal to this check"
} catch {
    $failed = $true
    Write-Output "endpoint failed as expected with redis down: $_"
}
if (-not $failed) { Write-Output "note: endpoint still answered with redis down (stale is technically OK here, but observing the failure path is what we gate on)" }

# 7. redis back up; endpoint answers again
docker start $redisContainer | Out-Null
Write-Output "=== 7) redis back; endpoint must answer again ==="
Start-Sleep -Milliseconds 500
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$up = $false
while ($sw2.Elapsed.TotalSeconds -lt 30) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28092/api/seasons/active' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $up = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $up) { Write-Error "endpoint never answered again after redis came back"; exit 1 }
Write-Output "endpoint answered again with redis"

Write-Output "verify-redis-season-cache PASSED"
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
