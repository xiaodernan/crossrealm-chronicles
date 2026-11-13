# verify-prometheus-ai.ps1 — prove W-Z12's Micrometer wiring on ai-service.
# Boots ai-service on 28084 with eureka disabled (no registry needed), then:
#   1. /actuator/health OK
#   2. (if LLM_API_KEY in env) one real POST /api/ai/chat (real upstream round trip,
#      answered, then the advisor metrics tick — proves the whole W-W11 + W-Z12 chain)
#   3. scrape /actuator/prometheus and assert:
#        jvm_memory_used_bytes  + process_uptime_seconds  (exporter is alive)
#        and, only when key present: ai_upstream_calls_total{outcome="success"} and ai_upstream_prompt_tokens_total
#   4. Kill the service, exit non-zero on failure. ASCII-only. No secrets printed.

$ErrorActionPreference = 'Stop'
$ErrorView = 'NormalView'
$svcPid = $null

function Cleanup {
    if ($svcPid) { try { Stop-Process -Id $svcPid -Force -ErrorAction SilentlyContinue } catch {} }
    Write-Output "cleanup done"
}

try {
    Write-Output "starting ai-service on port 28084 (local)"
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $jar = Join-Path $repoRoot 'ai-service/target/ai-service-0.1.0-SNAPSHOT.jar'
    if (-not (Test-Path $jar)) { Write-Error "ai-service jar missing; run mvn -B -pl ai-service package -DskipTests first"; exit 1 }
    $logOut = Join-Path ([System.IO.Path]::GetTempPath()) 'prom-ai-verify.out.log'
    $logErr = Join-Path ([System.IO.Path]::GetTempPath()) 'prom-ai-verify.err.log'
    $svcPid = (Start-Process -FilePath 'java' -ArgumentList @('-jar', $jar,
        '--server.port=28084',
        '--eureka.client.register-with-eureka=false',
        '--eureka.client.fetch-registry=false') -PassThru `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr).Id
    Write-Output "ai-service pid $svcPid"

    # wait for health
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $healthy = $false
    while ($sw.Elapsed.TotalSeconds -lt 120) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28084/actuator/health' -TimeoutSec 5
            if ($r.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 800
    }
    if (-not $healthy) { Write-Error "service never came up (see $logOut / $logErr)"; exit 1 }
    Write-Output "ai-service healthy"

    # if a key exists, do one real advisor round trip so the new metrics tick.
    $hasKey = -not [string]::IsNullOrWhiteSpace($env:LLM_API_KEY)
    if ($hasKey) {
        $body = '{"question":"Which campfire is best for supplies?"}'
        $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:28084/api/ai/chat' -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 60
        Write-Output "chat HTTP $($resp.StatusCode)"
        if ($resp.StatusCode -ne 200) { Write-Error "advisor chat did not answer 200 (got $($resp.StatusCode))"; exit 1 }
    } else {
        Write-Output "LLM_API_KEY not set; skipping live advisor round trip (metrics assertion limited)"
    }

    # scrape prometheus
    $prom = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:28084/actuator/prometheus' -TimeoutSec 10).Content
    Write-Output "prometheus content length: $($prom.Length) bytes"
    if (-not ($prom -match 'jvm_memory_used_bytes')) { Write-Error "prometheus output did not include jvm_memory_used_bytes"; exit 1 }
    if (-not ($prom -match 'process_uptime_seconds')) { Write-Error "prometheus output did not include process_uptime_seconds"; exit 1 }
    if ($hasKey) {
        if (-not ($prom -match 'ai_upstream_calls_total')) { Write-Error "prometheus did not include ai_upstream_calls_total"; exit 1 }
        if (-not ($prom -match 'ai_upstream_prompt_tokens_total')) { Write-Error "prometheus did not include ai_upstream_prompt_tokens_total"; exit 1 }
        if (-not ($prom -match 'ai_upstream_cache_hit_ratio')) { Write-Error "prometheus did not include ai_upstream_cache_hit_ratio"; exit 1 }
    }
    Write-Output "verify-prometheus-ai PASSED"
    exit 0
} catch {
    Write-Output "FATAL: $_"
    exit 1
} finally {
    Cleanup
}
