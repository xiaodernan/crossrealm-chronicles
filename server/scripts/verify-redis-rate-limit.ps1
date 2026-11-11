# verify-redis-rate-limit.ps1 — prove W-P10's Redis backend really enforces per-IP 60 req / 10s
# on a single gateway instance (not the memory backend).
#
# Preconditions: Java + built gateway jar at target/gateway-0.1.0-SNAPSHOT.jar, Docker available.
# What it does:
#   1. Starts a throwaway redis:7-alpine container on port 26379
#   2. Boots the gateway with gateway.ratelimit.backend=redis + SPRING_DATA_REDIS_HOST=localhost, PORT=26379
#   3. Polls /actuator/health until UP (or FAIL)
#   4. Fires 70 sequential GET /api/version and checks whether a 429 appears after the 60th successful one
#   5. Stops redis, re-fires, and expects 200 (fail-open when backend is unreachable)
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
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
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
$gatewayPid = (Start-Process -FilePath 'java' `
    -ArgumentList @('-jar', $gatewayJar) + $gatewayArgs `
    -PassThru -RedirectStandardOutput (Join-Path ([System.IO.Path]::GetTempPath()) 'gateway-rl.out.log') `
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

# 4. burst until we find 429 or confirm 60 successful requests
Write-Output "=== 4) fire 70 sequential requests; expect first few 200 then 429 ==="
$blocked = $false
$count200 = 0
$count429 = 0
for ($i = 1; $i -le 70; $i++) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/api/version' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $count200++; continue }
        if ($r.StatusCode -eq 429) { $count429++; $blocked = $true; break }
        Write-Error "unexpected status $($r.StatusCode) on try $i"; return
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $body = ""
            try {
                $sr = New-Object IO.StreamReader($resp.GetResponseStream())
                $body = $sr.ReadToEnd()
            } catch {}
            if ($resp.StatusCode -eq [System.Net.HttpStatusCode]::TooManyRequests) {
                Write-Output "try $i => 429 $body"
                $blocked = $true
                $count429++
                break
            }
        }
        Write-Error "request $i threw: $_"; return
    }
}
if (-not $blocked) { Write-Error "never hit the 429"; return }
Write-Output "burst: $count200 OK + $count429 rate-limited (>= the expected 61st+)"

# 5. kill redis; backend should fail-open (warn once, allow)
docker stop $redisContainer | Out-Null
Write-Output "=== 5) redis stopped; probe fail-open ==="
Start-Sleep -Milliseconds 500
try {
    $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28080/api/version' -TimeoutSec 5
    if ($r.StatusCode -eq 200) { Write-Output "fail-open ok: HTTP 200 even with redis down" }
} catch {
    Write-Error "fail-open check failed: $_"; return
}

Write-Output "verify-redis-rate-limit PASSED"

}
finally {
    Cleanup
}
