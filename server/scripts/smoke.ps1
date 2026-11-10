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

$ports = @{ 'discovery-server' = 28161; 'config-server' = 28888; 'game-service' = 28081; 'gateway' = 28080 }

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

$procs = @()
try {
    $procs += Start-Server 'discovery-server' 'discovery-server-0.1.0-SNAPSHOT.jar' 28161
    if (-not (Wait-Healthy 28161 'discovery-server')) { exit 1 }

    # 只有 config-server 需要这个 search-locations；discovery/game-service/gateway 拿不到它。
    # file: URI 里的反斜杠会被 Java URI 解析器悄悄吃掉一部分，统一换成正斜杠；
    # Windows 上 = file:/D:/path，Linux 上 = file:///home/path（file: + 绝对路径）。
    $tmpConfigDirFs = $tmpConfigDir -replace '\\','/'
    $fileUri = if ($tmpConfigDirFs.StartsWith('/')) { "file:$tmpConfigDirFs" } else { "file:/$tmpConfigDirFs" }
    $env:SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS = $fileUri
    $procs += Start-Server 'config-server' 'config-server-0.1.0-SNAPSHOT.jar' 28888
    Remove-Item Env:SPRING_CLOUD_CONFIG_SERVER_NATIVE_SEARCHLOCATIONS -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28888 'config-server')) { exit 1 }

    # 只有 game-service 需要从配置中心拉配置（配置中心自己绝不能回拉自己）
    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:28888'
    $procs += Start-Server 'game-service' 'game-service-0.1.0-SNAPSHOT.jar' 28081
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    if (-not (Wait-Healthy 28081 'game-service')) { exit 1 }

    $procs += Start-Server 'gateway' 'gateway-0.1.0-SNAPSHOT.jar' 28080
    if (-not (Wait-Healthy 28080 'gateway')) { exit 1 }

    # 冷启动保护：gateway 的 lb:// 注册表缓存需要一点时间暖起来（本机实测可达 30 秒才解析到 game-service），
    # 先轮询 /api/version 到 200（最多 90s）再执行断言步骤 —— 等的是 lb:// 就绪，不是业务本身。
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
    Write-Host "=== 3b) via gateway: submit a run record, then read it back (write→read path) ==="
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
