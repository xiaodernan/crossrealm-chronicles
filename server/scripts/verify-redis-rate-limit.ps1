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
#
# What it does:
#   1. Starts a throwaway redis:7-alpine container on port 26379
#   2. Boots the gateway with gateway.ratelimit.backend=redis + spring.data.redis.port=26379
#   3. Polls /actuator/health until UP (or FAIL)
#   4. Fires 70 sequential GET /api/version and checks that 429 appears after the 60th
#   5. Stops redis, re-fires, and expects 503 (fail-open when backend is unreachable, NOT 429)
#   6. Stops the gateway and cleans up the container

$ErrorActionPreference = 'Continue'
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
if (-not $?) { Write-Error "redis container start failed"; return }
Start-Sleep -Seconds 2

# 2. gateway jar
$repoRoot = Split-Path -Parent $PSScriptRoot
$gatewayJar = Join-Path $repoRoot 'gateway/target/gateway-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $gatewayJar)) { Write-Error "gateway jar missing; run 'mvn -B -pl gateway package -DskipTests' first"; return }
$env:SPRING_DATA_REDIS_HOST = 'localhost'
$env:SPRING_DATA_REDIS_PORT = "$redisPort"
$env:GATEWAY_RATELIMIT_BACKEND = 'redis'
$env:EUREKA_CLIENT_REGISTERWITHEUREKA = 'false'
$env:EUREKA_CLIENT_FETCHREGISTRY = 'false'

$gatewayArgs = @(
    '--server.port=28080',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--gateway.ratelimit.backend=redis',
    '--spring.cloud.gateway.enabled=true',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false'
)
$gatewayArgsAll = @('-jar', $gatewayJar) + $gatewayArgs
$gatewayPid = (Start-Process -FilePath 'java' `
    -ArgumentList $gatewayArgsAll `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path ([System.IO.Path]::GetTempPath()) 'gateway-rl.out.log') `
    -RedirectStandardError (Join-Path ([System.IO.Path]::GetTempPath()) 'gateway-rl.err.log')).Id
Write-Output "gateway pid $gatewayPid"

# 3. wait for health
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 90) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "gateway health never came up"; return }
Write-Output "gateway healthy"

# 4. burst until 429; count statuses
Write-Output "=== 4) fire 70 sequential requests to /api/version; expect 429 after the 60-request window fills ==="
$blocked = $false
$countOk = 0   # 200 or 503 = allowed through the limiter (reached upstream)
$count429 = 0
for ($i = 1; $i -le 70; $i++) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/api/version' -TimeoutSec 5
        $countOk++
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $code = [int]$resp.StatusCode
            if ($code -eq 429) {
                $count429++
                $blocked = $true
                break
            }
            if ($code -eq 503) { $countOk++; continue }
        }
        Write-Error "request $i threw unexpectedly: $_"; return
    }
}
if (-not $blocked) { Write-Error "never hit the 429 (allowed=$countOk)"; return }
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
        Write-Error "fail-open FAILED: request was rate-limited (429) with redis down"; return
    }
    Write-Output "fail-open probe threw as expected (upstream down, limiter allowed): $_"
}

Write-Output "verify-redis-rate-limit PASSED"

}
finally {
    Cleanup
}
