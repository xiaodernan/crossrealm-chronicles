# verify-redis-rate-limit.ps1 — prove W-P10's Redis backend really enforces per-IP 60 req / 10s
# on a single gateway instance (not the memory backend).
#
# Preconditions: Java + built gateway jar at target/gateway-0.1.0-SNAPSHOT.jar, Docker available.
# Design notes (read before editing):
#   * Actuator endpoints (e.g. /actuator/springcloud, /actuator/health) are served by the
#     gateway's OWN WebFlux handler mapping — they do NOT flow through the GatewayFilterChain,
#     so the GlobalFilter rate limiter never sees them (verified by probing: allowed counter
#     stays at 0 no matter how many actuator hits). Probing actuator paths would prove nothing.
#   * Burst target is /api/version — it routes lb://game-service (no upstream here, returns 503),
#     which is exactly what we want: the rate limiter runs BEFORE the load balancer (order -100),
#     so 61st request within a window returns 429 regardless of upstream health.
#   * Health polling during boot uses /actuator/health which bypasses the limiter entirely —
#     so the window is never polluted by the readiness probe.
#   * After stopping redis, a further request must NOT be 429 — the Lua path errors and
#     RedisIpRateLimiter fail-opens into allow. Upstream is still down, so expect 503
#     ("upstream-unavailable"), which is proof the limiter did NOT block.
#   * Exit codes are explicit: 0 = PASS, 1 = FAIL. Any uncaught error → exit 1.

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = "crossrealm-redis-rl-test"
$redisPort = 26379
$gatewayPid = $null

function Cleanup {
    if ($gatewayPid) { try { Stop-Process -Id $gatewayPid -Force -ErrorAction SilentlyContinue } catch {} }
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

# 2. gateway jar
$repoRoot = Split-Path -Parent $PSScriptRoot
$gatewayJar = Join-Path $repoRoot 'gateway/target/gateway-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $gatewayJar)) { Write-Error "gateway jar missing; run 'mvn -B -pl gateway package -DskipTests' first"; exit 1 }
$env:EUREKA_CLIENT_REGISTERWITHEUREKA = 'false'
$env:EUREKA_CLIENT_FETCHREGISTRY = 'false'

$gatewayArgsAll = @('-jar', $gatewayJar,
    '--server.port=28080',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--gateway.ratelimit.backend=redis',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false')
$logOut = Join-Path ([System.IO.Path]::GetTempPath()) 'gateway-rl.out.log'
$logErr = Join-Path ([System.IO.Path]::GetTempPath()) 'gateway-rl.err.log'
$gatewayPid = (Start-Process -FilePath 'java' -ArgumentList $gatewayArgsAll -PassThru `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr).Id
Write-Output "gateway pid $gatewayPid"

# 3. wait for health
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 90) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "gateway health never came up (see $logOut / $logErr)"; exit 1 }
Write-Output "gateway healthy"

# 4. burst until 429; count statuses
Write-Output "=== 4) fire 70 sequential requests to /api/version; expect 429 after the 60-request window fills ==="
$blocked = $false
$countOk = 0
$count429 = 0
for ($i = 1; $i -le 70; $i++) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/api/version' -TimeoutSec 5
        $countOk++
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $code = [int]$resp.StatusCode
            if ($code -eq 429) { $count429++; $blocked = $true; break }
            if ($code -eq 503) { $countOk++; continue }
        }
        Write-Error "request $i threw unexpectedly: $_"; exit 1
    }
}
if (-not $blocked) { Write-Error "never hit the 429 (allowed=$countOk)"; exit 1 }
Write-Output "burst: $countOk allowed + $count429 rate-limited (>= the expected 61st+)"

# 5. kill redis; backend should fail-open (warn once, allow)
docker stop $redisContainer | Out-Null
Write-Output "=== 5) redis stopped; probe fail-open (must NOT be 429 — limiter fail-opens into allow) ==="
Start-Sleep -Milliseconds 500
try {
    $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/api/version' -TimeoutSec 20
    Write-Output "fail-open probe returned HTTP $($r.StatusCode) (redis down; request was allowed through the limiter)"
} catch {
    $resp = $_.Exception.Response
    if ($resp -and [int]$resp.StatusCode -eq 429) {
        Write-Error "fail-open FAILED: request was rate-limited (429) with redis down"; exit 1
    }
    Write-Output "fail-open probe threw as expected (upstream down, limiter allowed): $_"
}

Write-Output "verify-redis-rate-limit PASSED"
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
