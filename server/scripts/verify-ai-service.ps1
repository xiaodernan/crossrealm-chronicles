# verify-ai-service.ps1 — W-Y1：ai-service 端到端联调（可离线、可带真实密钥）
#
# 取代旧的 _probe_llm.ps1（那份把密钥明文写进了脚本，已删除）。
# 密钥只从**父进程环境**继承，脚本里没有任何真值：
#   $env:LLM_API_KEY = '<你的密钥>'      # 在当前 shell 里设，不要写进文件
#   powershell -File server/scripts/verify-ai-service.ps1
#
# 没设密钥时：只验 /api/ai/health 与 /api/ai/chat 的 503 降级形状（零外呼）。
# 设了密钥时：额外真打一次 chat 与 echo-hint，断言拿到非空中文回答。
#
# 用法前先打包： cd server; mvn -o -q -pl ai-service -am package -DskipTests

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$jar = Join-Path $repoRoot 'ai-service/target/ai-service-0.1.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Error "jar missing: $jar (先跑 mvn -o -pl ai-service -am package -DskipTests)"; exit 1 }

$port = 28098
$log = Join-Path $env:TEMP 'crossrealm-ai-service.log'
$proc = Start-Process -FilePath 'java' -ArgumentList @(
    '-jar', $jar,
    "--server.port=$port",
    '--spring.cloud.config.enabled=false',
    '--spring.cloud.discovery.enabled=false',
    '--eureka.client.enabled=false'
) -PassThru -WindowStyle Hidden -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err"

try {
    $healthy = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/actuator/health" -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $healthy) {
        Write-Output '--- ai-service log tail:'
        Get-Content $log -Tail 25 -ErrorAction SilentlyContinue
        Get-Content "$log.err" -Tail 25 -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Output 'ai-service UP'

    $health = (Invoke-RestMethod "http://127.0.0.1:$port/api/ai/health")
    $configured = [bool]$health.configured
    Write-Output "configured=$configured model=$($health.model) circuit=$($health.circuit)"

    $chatBody = '{"question":"篝火快灭了，下一步该往哪里走？","context":{"zone":"hub"}}'
    if (-not $configured) {
        # 零密钥：必须给结构化 503，而不是 500 / 空 body / 把异常抛穿
        try {
            Invoke-WebRequest -UseBasicParsing -Method Post `
                -Uri "http://127.0.0.1:$port/api/ai/chat" -ContentType 'application/json' `
                -Body $chatBody -TimeoutSec 10 | Out-Null
            Write-Error '没配密钥却返回了 2xx，降级形状不对'; exit 1
        } catch {
            $code = [int]$_.Exception.Response.StatusCode
            if ($code -ne 503) { Write-Error "期望 503，实际 $code"; exit 1 }
            Write-Output 'offline degradation = 503 OK (zero upstream call)'
        }
    } else {
        $chat = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/ai/chat" `
            -ContentType 'application/json' -Body $chatBody -TimeoutSec 90
        if (-not $chat.answer) { Write-Error 'chat 返回空 answer'; exit 1 }
        Write-Output "chat OK: $($chat.answer)"

        $echo = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/ai/echo-hint" `
            -ContentType 'application/json' `
            -Body '{"franchise":"CYBER","title":"floating_casino","desc":"云层里的赌场没有牌桌"}' -TimeoutSec 90
        if (-not $echo.hint) { Write-Error 'echo-hint 返回空 hint'; exit 1 }
        Write-Output "echo-hint OK: $($echo.hint)"
    }
    Write-Output 'verify-ai-service PASSED'
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Write-Output 'stopped'
}
