# verify-redis-advisor-queue.ps1 - prove ai-service really runs the Redis backend when told to:
# (W-Y4 / W-Z1): submit -> enqueued to Streams -> worker claims it -> permanent DEATH via not-configured
# (no LLM key in this gate; failure is deterministic) -> dead letter counter/DLQ advanced ->
# dead-letter whitelist endpoint serves the failure, and the Redis stream actually holds the entry.
#
# Preconditions: Java + ai-service jar built at target/ai-service-0.1.0-SNAPSHOT.jar, Docker available.
# What it does:
#   1. Starts a throwaway redis:7-alpine container on port 26383
#   2. Boots ai-service with ai-service.jobs.backend=redis pointing at it
#   3. Submits a question to /api/ai/chat/async (without an LLM key the worker fails fast, deterministically)
#   4. Polls /api/ai/jobs/{id} until DEAD (not-configured) — never hangs
#   5. Asserts ai:advisor:jobs stream actually holds the entry (proves redis backend, not the in-memory one)
#   6. Asserts /api/ai/jobs/stats deadLettered >= 1 and /api/ai/jobs/dead-letter returns items whose
#      reason is not-configured — and NEVER echoes the player question back
#   7. Cleans up the container and the ai-service process
# ASCII-only on purpose (PowerShell 5.1 ANSI hazard).

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$redisContainer = "crossrealm-advisor-queue-test"
$redisPort = 26383
$svcPid = $null
$probeQuestion = 'verify-redis-advisor-queue-live-probe'

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

# 2. ai-service
$repoRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repoRoot 'ai-service/target/ai-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error "ai-service jar missing; run 'mvn -B -pl ai-service package -DskipTests' first"; exit 1 }
$logOut = Join-Path ([System.IO.Path]::GetTempPath()) 'advisor-queue.out.log'
$logErr = Join-Path ([System.IO.Path]::GetTempPath()) 'advisor-queue.err.log'
$env:AI_SERVICE_JOBS_BACKEND = 'redis'
$svcPid = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
    '--server.port=28093',
    '--spring.data.redis.host=localhost',
    "--spring.data.redis.port=$redisPort",
    '--eureka.client.register-with-eureka=false',
    '--eureka.client.fetch-registry=false') -PassThru `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr).Id
Remove-Item Env:AI_SERVICE_JOBS_BACKEND -ErrorAction SilentlyContinue
Write-Output "ai-service pid $svcPid"

# 3. wait for health
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$healthy = $false
while ($sw.Elapsed.TotalSeconds -lt 90) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28093/actuator/health' -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if (-not $healthy) { Write-Error "ai-service health never came up (see $logOut / $logErr)"; exit 1 }
Write-Output "ai-service healthy"

# 4. submit an async job + poll to terminal (DEAD: no LLM key)
$submitBody = @{ question = $probeQuestion; requestId = 'verify-advisor-queue-1' } | ConvertTo-Json -Compress
$submit = (Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28093/api/ai/chat/async' -ContentType 'application/json' -Body $submitBody -TimeoutSec 10)
if ($submit.StatusCode -ne 202) { Write-Error "async submit did not return 202 (got $($submit.StatusCode)): $($submit.Content)"; exit 1 }
$submitJson = $submit.Content | ConvertFrom-Json
$jobId = $submitJson.jobId
if (-not $jobId) { Write-Error "async submit missing jobId: $($submit.Content)"; exit 1 }
Write-Output "submitted jobId $jobId"

$status = 'QUEUED'
$attempts = 0
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw2.Elapsed.TotalSeconds -lt 60) {
    $view = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:28093/api/ai/jobs/$jobId" -TimeoutSec 10).Content | ConvertFrom-Json
    $status = $view.status
    $attempts = $view.attempts
    Write-Output "poll: status=$status attempts=$attempts"
    if ($status -eq 'DONE' -or $status -eq 'DEAD' -or $status -eq 'CANCELLED') { break }
    Start-Sleep -Milliseconds 500
}
if ($status -ne 'DEAD') { Write-Error "expected DEAD after no LLM key (not-configured), got: $status"; exit 1 }
Write-Output "job terminal: DEAD (deterministic without LLM key, as expected)"

# 5. redis really holds the entry
$xlen = docker exec $redisContainer redis-cli XLEN ai:advisor:jobs
Write-Output "XLEN ai:advisor:jobs = $xlen"
$xlenNum = 0
if ([long]::TryParse(($xlen | Out-String).Trim(), [ref]$xlenNum)) {
    if ($xlenNum -lt 1) { Write-Error "redis backend appears NOT in use - ai:advisor:jobs is empty"; exit 1 }
} else { Write-Error "could not parse XLEN: $xlen"; exit 1 }
$dlqLen = docker exec $redisContainer redis-cli XLEN ai:advisor:dlq
Write-Output "XLEN ai:advisor:dlq = $dlqLen"
$dlqNum = 0
if ([long]::TryParse(($dlqLen | Out-String).Trim(), [ref]$dlqNum)) {
    if ($dlqNum -lt 1) { Write-Error "DLQ should hold >=1 entry after a DEAD job, got: $dlqNum"; exit 1 }
} else { Write-Error "could not parse DLQ length: $dlqLen"; exit 1 }

# 6. stats + dead-letter whitelist; player question must never be echoed
$stats = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28093/api/ai/jobs/stats' -TimeoutSec 10).Content
Write-Output "stats: $stats"
if (-not ($stats -match '"deadLettered":[1-9][0-9]*')) { Write-Error "stats.deadLettered < 1: $stats"; exit 1 }

$dl = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28093/api/ai/jobs/dead-letter?limit=5' -TimeoutSec 10).Content
Write-Output "dead-letter: $dl"
if (-not ($dl -match '"reason":"not-configured"')) { Write-Error "dead-letter missing not-configured reason: $dl"; exit 1 }
if ($dl -match [regex]::Escape($probeQuestion)) { Write-Error "dead-letter echoed the player question back: $dl"; exit 1 }
if ($dl -match 'sk-') { Write-Error 'dead-letter leaks an api key'; exit 1 }

Write-Output "verify-redis-advisor-queue PASSED"
exit 0

} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
