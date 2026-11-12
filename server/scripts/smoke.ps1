# Smoke test: boot discovery / config / game-service / gateway for real and verify the whole chain:
#   config-server serves centrally managed config -> service registers with Eureka -> gateway lb-routes by service name.
#
# Usage (from server/):
#   powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
#
# Ports are fixed to 28xxx: the standard Eureka(8761)/Config(8888)/Gateway(8080) ports AND the 18xxx range are already in use on this dev machine (another Spring Cloud project). Do not collide.
# When done, the four java processes started here are stopped automatically. Logs land in %TEMP%\crossrealm-server-smoke\.
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI, and CJK bytes can masquerade as quotes/braces.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path ([System.IO.Path]::GetTempPath()) 'crossrealm-server-smoke'
New-Item -ItemType Directory -Force $logDir | Out-Null

$ports = @{ 'discovery-server' = 28161; 'config-server' = 28888; 'game-service' = 28081; 'season-service' = 28082; 'gateway' = 28080 }

# Preflight: refuse to start if any target port is taken (a stray instance would fail its own health check and hide behind a false "ready").
# Cross-platform port check: try a TCP connect; it succeeds iff something listens. Works on Windows PowerShell 5.1 and pwsh on Linux CI.
function Test-PortListening([int]$port) {
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $iar = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        $connected = $iar.AsyncWaitHandle.WaitOne(1500)
        if ($connected) {
            try { $client.EndConnect($iar); $client.Close(); return $true }
            catch { $client.Close(); return $false }
        }
        $client.Close()
        return $false
    } catch { return $false }
}
foreach ($name in $ports.Keys) {
    $port = $ports[$name]
    if (Test-PortListening $port) {
        Write-Error "port $port ($name) is already in use - refusing to start. Free it or change `$ports in this script."
        exit 1
    }
}

function Start-Server([string]$name, [string]$jar, [int]$port) {
    $log = Join-Path $logDir "$name.out.log"
    $err = Join-Path $logDir "$name.err.log"
    "" | Set-Content $log -ErrorAction SilentlyContinue
    "" | Set-Content $err -ErrorAction SilentlyContinue
    $jarPath = Join-Path (Join-Path $repoRoot $name) (Join-Path 'target' $jar)
    if (-not (Test-Path $jarPath)) {
        Write-Error "jar not found: $jarPath - build first with 'mvn -B verify'"
        exit 1
    }
    $p = Start-Process -FilePath 'java' -ArgumentList '-jar', $jarPath, "--server.port=$port" `
        -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
    Write-Host "started $name (pid $($p.Id)) on port $port"
    return $p
}

function Show-LogTail([string]$name) {
    Write-Host "----- $name out.log (last 40 lines) -----"
    Get-Content (Join-Path $logDir "$name.out.log") -Tail 40 -ErrorAction SilentlyContinue
    Write-Host "----- $name err.log (last 40 lines) -----"
    Get-Content (Join-Path $logDir "$name.err.log") -Tail 40 -ErrorAction SilentlyContinue
}

function Wait-Healthy([int]$port, [string]$name, [int]$timeoutSec = 240) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $url = "http://127.0.0.1:$port/actuator/health"
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 25
            if ($r.StatusCode -eq 200) {
                Write-Host "  $name healthy ($([int]$sw.Elapsed.TotalSeconds)s)"
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }
    Write-Warning "$name not healthy within ${timeoutSec}s, see logs in $logDir"
    Show-LogTail $name
    return $false
}

# Everything points at 28xxx: discovery / config / game-service / gateway each get their own port, none of the dev-machine standards or the 18xxx block is touched.
# IMPORTANT: SPRING_CONFIG_IMPORT applies per JVM, so it is set ONLY for game-service below. Giving it to config-server made it fetch config from itself until its HTTP workers saturated (the classic all-zeros-logs mystery: the service starved before logging started).
$env:EUREKA_CLIENT_SERVICEURL_DEFAULTZONE = 'http://localhost:28161/eureka/'
# Register as localhost: the dev machine's primary interface is on a LAN segment this JVM reached as host.docker.internal (see earlier registrations), and lb:// targets it unsuccessfully from this same host. Loopback is deterministic.
$env:EUREKA_INSTANCE_HOSTNAME = 'localhost'
$env:EUREKA_INSTANCE_PREFERIPADDRESS = 'false'

# W-X9 (config hot reload): config-server points at a temp dir instead of classpath, so this script
# can flip game-service.yml mid-run (max-limit 4 -> 3, note v1 -> v2) without restarting game-service,
# proving the chain config-server -> @RefreshScope -> /actuator/refresh applied live.
$tmpConfigDir = Join-Path (Join-Path $repoRoot 'target') 'smoke-config'
New-Item -ItemType Directory -Force $tmpConfigDir | Out-Null
$configFile = Join-Path $tmpConfigDir 'game-service.yml'
@'
game-service:
  leaderboard:
    seed-demo-data: true
    max-limit: 4
  telemetry:
    max-events: 500
  version-note: "smoke-reload-note-v1"
'@ | Set-Content -Encoding UTF8 $configFile

$seasonConfigFile = Join-Path $tmpConfigDir 'season-service.yml'
@'
season-service:
  cycle-days: 14
  override: ""
'@ | Set-Content -Encoding UTF8 $seasonConfigFile

$procs = @()
try {
    $procs += Start-Server 'discovery-server' 'discovery-server-0.1.0-SNAPSHOT.jar' 28161
    if (-not (Wait-Healthy 28161 'discovery-server')) { exit 1 }

    # only config-server needs the search-locations; discovery/game-service/gateway do not get it.
    # file: URIs with backslashes get silently mangled by the Java URI parser; normalize to forward slashes;
    # Windows: file:/D:/path   Linux: file:///home/path   (file: + absolute path)
    $tmpConfigDirFs = $tmpConfigDir -replace '\\','/'
    $fileUri = if ($tmpConfigDirFs.StartsWith('/')) { "file:$tmpConfigDirFs" } else { "file:/$tmpConfigDirFs" }
    $env:SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS = $fileUri
    $procs += Start-Server 'config-server' 'config-server-0.1.0-SNAPSHOT.jar' 28888
    Remove-Item Env:SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28888 'config-server')) { exit 1 }

    # only game-service pulls config from the config center; config-server must not become a client of itself
    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:28888'
    $procs += Start-Server 'game-service' 'game-service-0.1.0-SNAPSHOT.jar' 28081
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28081 'game-service')) { exit 1 }

    # season-service pulls config from config-server too (it is a client, NOT config-server itself)
    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:28888'
    $procs += Start-Server 'season-service' 'season-service-0.1.0-SNAPSHOT.jar' 28082
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28082 'season-service')) { exit 1 }

    $procs += Start-Server 'gateway' 'gateway-0.1.0-SNAPSHOT.jar' 28080
    if (-not (Wait-Healthy 28080 'gateway')) { exit 1 }

    # Cold-start protection: gateway lb:// registry cache takes a moment to warm up (30s on this dev box).
    # Poll /api/version until 200 (up to 90s) before the asserts; we are waiting for lb:// readiness, not the config itself.
    Write-Host ""
    Write-Host "=== 0) warm-up: poll gateway /api/version until lb:// routing resolves game-service ==="
    $warmupOk = $false
    for ($i = 0; $i -lt 90; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/version' -TimeoutSec 10
            if ($r.StatusCode -eq 200) { $warmupOk = $true; Write-Host "lb:// routing warm (try $i) -> HTTP 200"; break }
        } catch {}
        Start-Sleep -Milliseconds 1000
    }
    if (-not $warmupOk) { Write-Error 'warm-up failed: gateway never resolved game-service within 90s'; exit 1 }

    # Cold-start protection for the season route too: the same lb cache needs to
    # learn season-service separately. Without this, the first call after boot can
    # hit an empty registry cache and 503 (this flake was observed once).
    $seasonWarmupOk = $false
    for ($i = 0; $i -lt 90; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/seasons/active' -TimeoutSec 10
            if ($r.StatusCode -eq 200) { $seasonWarmupOk = $true; Write-Host "season lb:// routing warm (try $i) -> HTTP 200"; break }
        } catch {}
        Start-Sleep -Milliseconds 1000
    }
    if (-not $seasonWarmupOk) { Write-Error 'warm-up failed: gateway never resolved season-service within 90s'; exit 1 }

    # Cold-start protection for the Feign path too: game-service keeps its own Eureka cache
    # (it refreshes separately from the gateway's), so the very first call to the ops view can
    # still hit an empty registry and answer available:false. Poll until it answers true.
    $feignWarmupOk = $false
    for ($i = 0; $i -lt 90; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/ops/season' -TimeoutSec 10
            if ($r.StatusCode -eq 200 -and $r.Content -match '"available":true') { $feignWarmupOk = $true; Write-Host "Feign path warm (try $i) -> available:true"; break }
        } catch {}
        Start-Sleep -Milliseconds 1000
    }
    if (-not $feignWarmupOk) { Write-Error 'warm-up failed: game-service never reached season-service via Feign within 90s'; exit 1 }

    # Request-id contract: caller-supplied id is echoed verbatim; missing id gets a UUID from the gateway.
    Write-Host "=== 0b) request id: gateway echoes X-Request-Id, generates UUID when absent ==="
    $ridIn = "smoke-req-$(Get-Random)"
    $ridResp = Invoke-WebRequest -UseBasicParsing -Headers @{ 'X-Request-Id' = $ridIn } 'http://localhost:28080/api/version' -TimeoutSec 10
    if ($ridResp.Headers['X-Request-Id'] -ne $ridIn) {
        Write-Error "request id not echoed: got '$($ridResp.Headers['X-Request-Id'])', want '$ridIn'"; exit 1
    }
    $ridAuto = Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/version' -TimeoutSec 10
    $ridAutoVal = $ridAuto.Headers['X-Request-Id']
    if ($ridAutoVal -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
        Write-Error "gateway did not generate a UUID X-Request-Id (got '$ridAutoVal')"; exit 1
    }
    Write-Host "request-id echo + generation ok ($ridIn / $ridAutoVal)"
    # Server-Timing contract (RFC 9218): gateway emits its own dur, downstream's value survives (add, not set)
    $stResp = Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/version' -TimeoutSec 10
    if ($stResp.Headers['Server-Timing'] -notmatch 'gw;dur=') {
        Write-Error "server-timing header missing or malformed: '$($stResp.Headers['Server-Timing'])'"; exit 1
    }
    Write-Host "server-timing ok ($($stResp.Headers['Server-Timing']))"

    Write-Host ""
    Write-Host "=== 1) config-server: the config it serves for game-service ==="
    (Invoke-WebRequest -UseBasicParsing 'http://localhost:28888/game-service/default' -TimeoutSec 15).Content

    Write-Host ""
    Write-Host "=== 2) via gateway /api/version (note should be the centrally managed one, proving config delivery works) ==="
    (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/version' -TimeoutSec 15).Content

    Write-Host ""
    Write-Host "=== 3a) via gateway: leaderboard (seeded, read-only) ==="
    (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/leaderboard?limit=3' -TimeoutSec 15).Content

    Write-Host ""
    Write-Host "=== 3b) via gateway: submit a run record, then read it back (write to read round-trip) ==="
    $body = '{"runner":"smoke-test","bossId":"void-chronarch","clearTimeMs":123456,"chapter":5}'
    $created = (Invoke-WebRequest -UseBasicParsing -Method Post 'http://localhost:28080/api/leaderboard' `
        -ContentType 'application/json' -Body $body -TimeoutSec 15).Content
    Write-Host "POST leaderboard -> $created"
    (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/leaderboard?limit=4' -TimeoutSec 15).Content

    Write-Host ""
    Write-Host "=== 4) via gateway: post one telemetry event, then read the counter ==="
    (Invoke-WebRequest -UseBasicParsing -Method Post 'http://localhost:28080/api/telemetry/events' `
        -ContentType 'application/json' -Body '{"type":"boss_defeated","detail":"void-chronarch"}' -TimeoutSec 15).Content
    (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/telemetry/events/count' -TimeoutSec 15).Content

    Write-Host ""
    Write-Host "=== 4b) via gateway: season-service active season (lb://season-service) ==="
    $season = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/seasons/active' -TimeoutSec 20).Content
    Write-Host $season
    # assert the *shape* is a valid season, do not assert WHICH season -- it rotates with the clock, so pinning would red-wall this smoke over time
    if (-not ($season -match '"id":"(ember|tide|gloom|radiant)"')) { Write-Error "gateway did NOT route to season-service: $season"; exit 1 }
    if (-not ($season -match '"daysRemaining":[0-9]+')) { Write-Error "season payload missing countdown: $season"; exit 1 }

    Write-Host ""
    Write-Host "=== 4c) via gateway: ops aggregate (Feign from game-service to season-service) ==="
    $opsSeason = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/ops/season' -TimeoutSec 20).Content
    Write-Host $opsSeason
    if (-not ($opsSeason -match '"available":true')) { Write-Error "game-service could NOT reach season-service via Feign: $opsSeason"; exit 1 }

    Write-Host ""
    Write-Host "=== 4d) via gateway: ops stats (leaderboard + trials + telemetry aggregates) ==="
    $opsStats = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/ops/stats' -TimeoutSec 15).Content
    Write-Host $opsStats
    if (-not ($opsStats -match '"leaderboard":\{[^}]*"total":[0-9]+')) { Write-Error "ops stats missing leaderboard.total: $opsStats"; exit 1 }
    if (-not ($opsStats -match '"leaderboard":\{[^}]*"fastestMs":[0-9]+')) { Write-Error "ops stats missing leaderboard.fastestMs: $opsStats"; exit 1 }
    if (-not ($opsStats -match '"leaderboard":\{[^}]*"p50Ms":[0-9]+')) { Write-Error "ops stats missing leaderboard.p50Ms: $opsStats"; exit 1 }
    if (-not ($opsStats -match '"leaderboard":\{[^}]*"p95Ms":[0-9]+')) { Write-Error "ops stats missing leaderboard.p95Ms: $opsStats"; exit 1 }
    if (-not ($opsStats -match '"trials":\{[^}]*"total":[0-9]+')) { Write-Error "ops stats missing trials.total: $opsStats"; exit 1 }
    if (-not ($opsStats -match '"trials":\{[^}]*"topScore":[0-9]+')) { Write-Error "ops stats missing trials.topScore: $opsStats"; exit 1 }
    if (-not ($opsStats -match '"telemetry":\{.*"windowSize":[0-9]+')) { Write-Error "ops stats missing telemetry.windowSize: $opsStats"; exit 1 }

    Write-Host ""
    Write-Host "=== 4e) via gateway: springcloud ops endpoint carries rate-limit counters (W-P13) ==="
    $scResp = Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/actuator/springcloud' -TimeoutSec 15
    # PS 5.1 对 actuator 的 vnd.spring-boot.actuator+json 不认作文本，Content 会是 byte[] —— 手动解一次
    $sc = if ($scResp.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($scResp.Content) } else { [string]$scResp.Content }
    Write-Host $sc
    if (-not ($sc -match '"allowed":[0-9]+')) { Write-Error "springcloud missing allowed counter: $sc"; exit 1 }
    if (-not ($sc -match '"rejected":[0-9]+')) { Write-Error "springcloud missing rejected counter: $sc"; exit 1 }
    if (-not ($sc -match '"backend":"memory"')) { Write-Error "springcloud missing backend identity: $sc"; exit 1 }

    Write-Host ""
    Write-Host "=== 4f) via gateway: season stats (counting cache + active season) ==="
    # 先打两次 active 把缓存暖起来，再读 stats —— hits 必然 >= 1
    Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/seasons/active' -TimeoutSec 15 | Out-Null
    Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/seasons/active' -TimeoutSec 15 | Out-Null
    $ss = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/seasons/stats' -TimeoutSec 15).Content
    Write-Host $ss
    if (-not ($ss -match '"active":\{' -and $ss -match '"id":"(ember|tide|gloom|radiant)"')) { Write-Error "season stats missing active season: $ss"; exit 1 }
    if (-not ($ss -match '"hits":[1-9][0-9]*')) { Write-Error "season stats shows zero cache hits after two warm reads: $ss"; exit 1 }
    if (-not ($ss -match '"type":"concurrent"')) { Write-Error "season stats missing cache type: $ss"; exit 1 }

    Write-Host ""
    Write-Host "=== 4g) via gateway: ops stats carries request counters (W-P14) ==="
    $gs = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/ops/stats' -TimeoutSec 15).Content
    Write-Host $gs
    if (-not ($gs -match '"requests":\{')) { Write-Error "ops stats missing requests section: $gs"; exit 1 }
    if (-not ($gs -match '"total":[0-9]+')) { Write-Error "ops stats missing requests.total: $gs"; exit 1 }

    Write-Host ""
    Write-Host "=== 4h) via gateway: telemetry queue carries backpressure stats (W-M1) ==="
    $tq = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/ops/stats' -TimeoutSec 15).Content
    if (-not ($tq -match '"telemetryQueue":\{')) { Write-Error "ops stats missing telemetryQueue: $tq"; exit 1 }
    if (-not ($tq -match '"enqueued":[0-9]+')) { Write-Error "ops stats missing telemetryQueue.enqueued: $tq"; exit 1 }
    if (-not ($tq -match '"processed":[0-9]+')) { Write-Error "ops stats missing telemetryQueue.processed: $tq"; exit 1 }
    if (-not ($tq -match '"depth":[0-9]+')) { Write-Error "ops stats missing telemetryQueue.depth: $tq"; exit 1 }

    Write-Host ""
    Write-Host "=== 5) hot refresh: edit served config (max-limit 4 -> 3, note v1 -> v2) WITHOUT restarting game-service ==="
    @'
game-service:
  leaderboard:
    seed-demo-data: true
    max-limit: 3
  telemetry:
    max-events: 500
  version-note: "smoke-reload-note-v2"
'@ | Set-Content -Encoding UTF8 $configFile
    $refresh = (Invoke-WebRequest -UseBasicParsing -Method Post 'http://localhost:28081/actuator/refresh' -ContentType 'application/json' -Body '{}' -TimeoutSec 15).Content
    Write-Host "POST /actuator/refresh -> $refresh"
    Start-Sleep -Milliseconds 500
    $ver = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/version' -TimeoutSec 15).Content
    Write-Host "version after refresh: $ver"
    $lb = (Invoke-WebRequest -UseBasicParsing 'http://localhost:28080/api/leaderboard?limit=10' -TimeoutSec 15).Content
    Write-Host "leaderboard after refresh: $lb"
    if (-not ($ver -match 'smoke-reload-note-v2')) { Write-Error "refresh did NOT rebind versionNote to v2: $ver"; exit 1 }
    if (-not ($lb -match '"count":3')) { Write-Error "refresh did NOT rebind max-limit to 3 (leaderboard count stayed above 3): $lb"; exit 1 }

    Write-Host ""
    Write-Host "=== 6) discovery: applications currently registered ==="
    (Invoke-WebRequest -UseBasicParsing 'http://localhost:28161/eureka/apps' -TimeoutSec 15).Content

    Write-Host ""
    Write-Host "smoke test PASSED"
} finally {
    foreach ($p in $procs) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; Write-Host "stopped $($p.ProcessName) pid $($p.Id)" } catch {}
    }
    if ($tmpConfigDir -and (Test-Path $tmpConfigDir)) {
        Remove-Item -Recurse -Force $tmpConfigDir -ErrorAction SilentlyContinue
        Write-Host "cleaned up $tmpConfigDir"
    }
}
