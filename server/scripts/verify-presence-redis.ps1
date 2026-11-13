# verify-presence-redis.ps1 - prove W-Z-presence topic end to end on a throwaway redis.
#
# Preconditions: Java + docker + presence-service jar built (mvn -B -pl presence-service package -DskipTests).
# What it does:
#   1. Throwaway redis:7-alpine container on port 26388
#   2. Boot presence-service with PRESENCE_BACKEND=redis on 28088
#      POST /api/presence/world/beat -> 202
#      GET  /api/presence/world/count -> 1
#   3. redis-cli checks: SISMEMBER presence:world:ids == 1 ; GET presence:world:crimson-gavel carries hue 310
#   4. SSE live frame: curl -sN captures the stream BEFORE the beat, then beat again from a second client;
#      the captured frames must contain an "event:present" chunk mentioning crimson-gavel
#   5. Stop instance A; boot instance B on 28089 (same redis); /count must still report the wanderer
#      (proves the store is really the shared redis, not process-local memory)
#   6. Cleanup container + both java processes
# ASCII-only on purpose (PS 5.1 hazard). No secrets involved.

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = 'crossrealm-presence-test'
$redisPort = 26388
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

# 2. presence instance A
$repoRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repoRoot 'presence-service/target/presence-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error 'presence-service jar missing; run mvn -B -pl presence-service package -DskipTests first'; exit 1 }
Write-Output "starting first presence-service instance on port 28088"
$logOutA = Join-Path ([System.IO.Path]::GetTempPath()) 'presence-a.out.log'
$logErrA = Join-Path ([System.IO.Path]::GetTempPath()) 'presence-a.err.log'
$svcA = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28088',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--presence.backend=redis',
    '--presence.ttl-seconds=60',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutA -RedirectStandardError $logErrA).Id

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28088/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "presence-service A health never came up (see $logOutA / $logErrA)"; exit 1 }
Write-Output 'presence-service A healthy'

# 3. beat once, then check count and raw redis state
$beat = '{"id":"crimson-gavel","name":"Crimson","hue":310,"x":0.5,"z":-0.5}'
$br = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28088/api/presence/world/beat' -ContentType 'application/json' -Body $beat -TimeoutSec 10
if ($br.StatusCode -ne 202) { Write-Error "beat expected 202, got $($br.StatusCode): $($br.Content)"; exit 1 }

$count = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28088/api/presence/world/count' -TimeoutSec 10).Content | ConvertFrom-Json
if ([long]$count.count -lt 1) { Write-Error "count expected >= 1 after beat, got $($count.count)"; exit 1 }
Write-Output "count after beat = $($count.count)"

$member = docker exec $redisContainer redis-cli SISMEMBER presence:world:ids crimson-gavel
if (($member | Out-String).Trim() -ne '1') { Write-Error "redis SISMEMBER presence:world:ids crimson-gavel expected 1, got $member"; exit 1 }

# 原始键校验：docker exec 在偶发情况下 stderr 混进流、stdout 为空（重试 5 次以消除宿主抖动）
$wanderer = $null
for ($i = 0; $i -lt 5; $i++) {
    $wanderer = (docker exec $redisContainer redis-cli GET presence:world:crimson-gavel 2>&1 | Out-String).Trim()
    if ($wanderer -match '"hue":\s*310') { break }
    Start-Sleep -Milliseconds 400
}
if ($wanderer -notmatch '"hue":\s*310') { Write-Error "redis presence row did not carry hue 310: $wanderer"; exit 1 }
Write-Output 'redis state verified (set member + hashed wanderer)'

# 4. SSE live frame: capture for 8s in background, beat once mid-capture
$sseOut = Join-Path ([System.IO.Path]::GetTempPath()) 'presence-sse.out'
Remove-Item $sseOut -ErrorAction SilentlyContinue
$curlArgs = @('-sN', '--max-time', '8', 'http://127.0.0.1:28088/api/presence/world/stream')
$curlExe = if (Get-Command curl.exe -ErrorAction SilentlyContinue) { 'curl.exe' }
           elseif (Get-Command curl -CommandType Application -ErrorAction SilentlyContinue) { 'curl' }
           else { $null }
if (-not $curlExe) { Write-Error 'curl not found (CI runner / dev box both ship one)'; exit 1 }
$sse = Start-Process -FilePath $curlExe -ArgumentList $curlArgs -RedirectStandardOutput $sseOut -PassThru
Start-Sleep -Milliseconds 500

# 等 SSE 订阅真正注册到 redis Pub/Sub（最多 15s 内轮询 NUMSUB>=1），消事件竞态：
# 注册没完成就 beat2，publish 会被错过（跨实例 one-way live frame 的老坑）。
$registered = $false
for ($i = 0; $i -lt 30; $i++) {
    $nsub = docker exec $redisContainer redis-cli PUBSUB NUMSUB presence:events:world
    if (($nsub | Out-String).Trim() -match '1') { $registered = $true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $registered) { Write-Error 'SSE subscription did not register with redis pub/sub within 15s'; exit 1 }
Write-Output 'SSE registered with redis pub/sub'

# eventSource has to receive THIS beat: capture starts with a replayed snapshot, then a fresh present frame
$beat2 = '{"id":"silver-leaf","name":"Silver","hue":120,"x":-0.25,"z":0.75}'
$br2 = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28088/api/presence/world/beat' -ContentType 'application/json' -Body $beat2 -TimeoutSec 10
if ($br2.StatusCode -ne 202) { Write-Error "second beat expected 202, got $($br2.StatusCode): $($br2.Content)"; exit 1 }
# curl exits by itself after --max-time 8; just wait the window out, then read the capture
$sw3 = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw3.Elapsed.TotalSeconds -lt 9) { Start-Sleep -Milliseconds 250 }
$sseBody = Get-Content $sseOut -Raw
if ($sseBody -notmatch 'event:\s*present') { Write-Error "SSE capture had no 'present' event frames; got: $sseBody"; exit 1 }
if ($sseBody -notmatch 'crimson-gavel') { Write-Error 'SSE snapshot replay missed the first wanderer'; exit 1 }
if ($sseBody -notmatch 'silver-leaf') { Write-Error 'SSE live frame missed the second wanderer (pub/sub fanout)'; exit 1 }
if ($sseBody -notmatch '"ts":[0-9]{10,}') { Write-Error "SSE frames carry ts=0 (server never stamped the live fanout): $sseBody"; exit 1 }
Write-Output 'SSE snapshot replay + live pub/sub fanout verified'

# 5. restart with instance B -- state must be the shared redis, not process memory
Stop-Process -Id $svcA -Force -ErrorAction SilentlyContinue
$svcA = $null
Start-Sleep -Seconds 2

$logOutB = Join-Path ([System.IO.Path]::GetTempPath()) 'presence-b.out.log'
$logErrB = Join-Path ([System.IO.Path]::GetTempPath()) 'presence-b.err.log'
Write-Output 'starting second presence-service instance on port 28089'
$svcB = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28089',
    "--spring.data.redis.host=localhost",
    "--spring.data.redis.port=$redisPort",
    '--presence.backend=redis',
    '--presence.ttl-seconds=60',
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOutB -RedirectStandardError $logErrB).Id

$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$healthyB = $false
while ($sw2.Elapsed.TotalSeconds -lt 120) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28089/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthyB = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthyB) { Write-Error "presence-service B health never came up (see $logOutB / $logErrB)"; exit 1 }

# heartbeat 语义本来就是"15s 不续命就消失"：A 停掉、重启 B 花掉的 20~30s 会让 A 期间的心跳全部过期。
# 所以重启后的正确断言是先续命、再读——B 能看到 A 种下的同一游侠，就证明状态真是共享 redis 而不是进程内
$beatB = '{"id":"crimson-gavel","name":"Crimson","hue":310,"x":0.5,"z":-0.5}'
$brB = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28089/api/presence/world/beat' -ContentType 'application/json' -Body $beatB -TimeoutSec 10
if ($brB.StatusCode -ne 202) { Write-Error "instance B beat expected 202, got $($brB.StatusCode)"; exit 1 }
$countB = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28089/api/presence/world/count' -TimeoutSec 10).Content | ConvertFrom-Json
if ([long]$countB.count -lt 1) { Write-Error "count on instance B expected >= 1 after shared-redis re-beat, got $($countB.count)"; exit 1 }
$memberB = docker exec $redisContainer redis-cli SISMEMBER presence:world:ids crimson-gavel
if (($memberB | Out-String).Trim() -ne '1') { Write-Error "instance B did not see crimson-gavel in shared redis: $memberB"; exit 1 }
Write-Output "cross-instance proof OK (count=$($countB.count), shared redis)"

# ops 运维端点（白名单同频道名）：字段齐全、无外呼、无泄露
$ops = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28089/api/presence/world/ops' -TimeoutSec 10).Content | ConvertFrom-Json
if ($ops.backend -ne 'redis') { Write-Error "ops backend expected redis, got $($ops.backend)"; exit 1 }
if ([long]$ops.ttlSeconds -ne 60) { Write-Error "ops ttlSeconds expected 60, got $($ops.ttlSeconds)"; exit 1 }
if ([long]$ops.capacity -lt 1) { Write-Error "ops capacity missing: $($ops.capacity)"; exit 1 }
if ([long]$ops.sseConnections -lt 0) { Write-Error "ops sseConnections missing: $($ops.sseConnections)"; exit 1 }
Write-Output "ops endpoint OK (backend=$($ops.backend), sseConnections=$($ops.sseConnections), capacity=$($ops.capacity))"

Write-Output 'verify-presence-redis PASSED'
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
