# Breaker-check: W-X5 网关熔断验证（手动诊断，不是 CI 门禁）
# 验证三件事（29xxx 端口段，与 smoke 的 28xxx 错开）：
#   1) lb:// 注册表暖起来后，/api/version baseline = 200（熔断器 closed，路由正常）
#   2) 停掉 game-service 后，/api/version 连打 6 次 —— 期望全部 HTTP 503
#      （LB 无实例 short-circuit；异常路径时熔断兜底 JSON，body 由 eureka 缓存刷新时机决定）
#   3) 重新拉起 game-service 后，轮询 /api/version —— 期望在 60s 内恢复 200（故障可自愈）
# 使命：证明「game-service 真没时，调用方一定收到 503；恢复后网关自动回来」。
# 跑完自动关停所有 java 实例；日志在 %TEMP%\crossrealm-breaker-check\
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path ([System.IO.Path]::GetTempPath()) 'crossrealm-breaker-check'
New-Item -ItemType Directory -Force $logDir | Out-Null

$env:EUREKA_CLIENT_SERVICEURL_DEFAULTZONE = 'http://localhost:29161/eureka/'
$env:EUREKA_INSTANCE_HOSTNAME = 'localhost'
$env:EUREKA_INSTANCE_PREFERIPADDRESS = 'false'
$state = @{}
$failures = 0

function Start-Server([string]$name, [string]$jar, [int]$port) {
    $log = Join-Path $logDir "$name.out.log"; $err = Join-Path $logDir "$name.err.log"
    $p = Start-Process -FilePath 'java' -ArgumentList '-jar', (Join-Path (Join-Path $repoRoot $name) (Join-Path 'target' $jar)), "--server.port=$port" -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
    Write-Host "started $name (pid $($p.Id)) on $port"
    $state[$name] = $p
}
function Stop-Server([string]$name) {
    if ($state.ContainsKey($name) -and $state[$name]) {
        try { Stop-Process -Id $state[$name].Id -Force -ErrorAction SilentlyContinue } catch {}
        $state[$name] = $null
        Write-Host "stopped $name"
    }
}
function Wait-Healthy([int]$port, [string]$name) {
    for ($i = 0; $i -lt 240; $i++) {
        try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/actuator/health" -TimeoutSec 10; if ($r.StatusCode -eq 200) { Write-Host "  $name healthy"; return } } catch {}
        Start-Sleep -Milliseconds 500
    }
    Write-Error "$name never became healthy"
}
function Hit([string]$url) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 10
        return @($r.StatusCode, $r.Content)
    } catch {
        $resp = $_.Exception.Response
        $code = 0; $body = ''
        try {
            $code = [int]$resp.StatusCode
            $body = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
        } catch {}
        return @($code, $body)
    }
}
try {
    Start-Server 'discovery-server' 'discovery-server-0.1.0-SNAPSHOT.jar' 29161; Wait-Healthy 29161 'discovery-server'
    Start-Server 'config-server' 'config-server-0.1.0-SNAPSHOT.jar' 29888; Wait-Healthy 29888 'config-server'
    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:29888'
    Start-Server 'game-service' 'game-service-0.1.0-SNAPSHOT.jar' 29081; Wait-Healthy 29081 'game-service'
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    Start-Server 'gateway' 'gateway-0.1.0-SNAPSHOT.jar' 29080; Wait-Healthy 29080 'gateway'

    Write-Host "`n== 1) warm-up: poll /api/version until lb:// routing warm (baseline, breaker closed) =="
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        $code, $body = Hit http://localhost:29080/api/version
        if ($code -eq 200) { $ready = $true; Write-Host "lb:// routing warm (try $i) -> HTTP $code"; break }
        Start-Sleep -Milliseconds 1000
    }
    if ($ready) { Write-Host 'baseline OK: 200' } else { Write-Host 'baseline FAILED'; $failures++ }

    Write-Host "`n== 2) stop game-service, /api/version x6 (expect all HTTP 503) =="
    Stop-Server 'game-service'
    Start-Sleep -Seconds 2
    for ($i = 1; $i -le 6; $i++) {
        $code, $body = Hit http://localhost:29080/api/version
        if ($code -eq 503) { Write-Host ("call {0} -> HTTP 503  OK  {1}" -f $i, $body) }
        else { Write-Host ("call {0} -> HTTP {1}  UNEXPECTED  {2}" -f $i, $code, $body); $failures++ }
        Start-Sleep -Milliseconds 500
    }

    Write-Host "`n== 3) restart game-service, poll /api/version (expect 200 within 60s) =="
    $env:SPRING_CONFIG_IMPORT = 'optional:configserver:http://localhost:29888'
    Start-Server 'game-service' 'game-service-0.1.0-SNAPSHOT.jar' 29081
    Remove-Item Env:SPRING_CONFIG_IMPORT -ErrorAction SilentlyContinue
    Wait-Healthy 29081 'game-service'
    $recovered = $false
    for ($i = 0; $i -lt 60; $i++) {
        $code, $body = Hit http://localhost:29080/api/version
        if ($code -eq 200) { $recovered = $true; Write-Host "recovered (try $i) -> HTTP 200"; break }
        Start-Sleep -Milliseconds 1000
    }
    if ($recovered) { Write-Host 'recovery OK: 200' } else { Write-Host 'recovery FAILED'; $failures++ }
} finally {
    foreach ($name in @($state.Keys)) { Stop-Server $name }
    Write-Host "`nall java instances stopped"
}
if ($failures -eq 0) { Write-Host "`nVERIFY-BREAKER PASSED" } else { Write-Host "`nVERIFY-BREAKER FAILED: $failures"; exit 1 }
