# verify-prometheus.ps1 — prove W-Z10's Micrometer wiring really emits
# game_telemetry_enqueued_total on /actuator/prometheus after one Boss-defeat telemetry event.
#
# Preconditions: Java + built game-service jar, Docker is NOT required for this one (in-process).
# What it does:
#   1. Boots game-service on 28087, all Eureka/config disabled (local self-bootstrap)
#   2. POSTs /api/telemetry/events with a known type=boss_defeated
#   3. Hits /actuator/prometheus and asserts:
#       game_telemetry_enqueued_total counter contains at least 2 (1 seed + 1 new)
#       jvm_memory_used_bytes appears
#       process_uptime_seconds appears
#   4. Kills the service, exits non-zero on failure. ASCII-only.

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$svcPid = $null

function Cleanup {
    if ($svcPid) { try { Stop-Process -Id $svcPid -Force -ErrorAction SilentlyContinue } catch {} }
    Write-Output "cleanup done"
}

try {
    Write-Output "starting game-service on port 28087 (local)"
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $jar = Join-Path $repoRoot 'game-service/target/game-service-0.1.0-SNAPSHOT.jar'
    if (-not (Test-Path $jar)) { Write-Error "game-service jar missing; run mvn -B -pl game-service package -DskipTests first"; exit 1 }
    $logOut = Join-Path ([System.IO.Path]::GetTempPath()) 'prom-verify.out.log'
    $logErr = Join-Path ([System.IO.Path]::GetTempPath()) 'prom-verify.err.log'
    $svcPid = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
        '--server.port=28087',
        '--eureka.client.register-with-eureka=false',
        '--eureka.client.fetch-registry=false') -PassThru `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr).Id
    Write-Output "game-service pid $svcPid"

    # wait for health
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $healthy = $false
    while ($sw.Elapsed.TotalSeconds -lt 120) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28087/actuator/health' -TimeoutSec 5
            if ($r.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 800
    }
    if (-not $healthy) { Write-Error "service never came up (see $logOut / $logErr)"; exit 1 }
    Write-Output "game-service healthy"

    # post an event
    $body = '{"type":"boss_defeated","detail":"void-chronarch"}'
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28087/api/telemetry/events' -ContentType 'application/json' -Body $body -TimeoutSec 10
    if ($r.StatusCode -ne 201) { Write-Error "POST /api/telemetry/events did not return 201 (got $($r.StatusCode))"; exit 1 }
    Write-Output "posted one telemetry event"

    # scrape /actuator/prometheus
    $prom = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28087/actuator/prometheus' -TimeoutSec 10).Content
    Write-Output "prometheus content length: $($prom.Length) bytes"
    if (-not ($prom -match 'game_telemetry_enqueued_total')) { Write-Error "prometheus output did not include game_telemetry_enqueued_total"; exit 1 }
    if (-not ($prom -match 'jvm_memory_used_bytes')) { Write-Error "prometheus output did not include jvm_memory_used_bytes"; exit 1 }
    if (-not ($prom -match 'process_uptime_seconds')) { Write-Error "prometheus output did not include process_uptime_seconds"; exit 1 }
    Write-Output "verify-prometheus PASSED"
    exit 0
} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
