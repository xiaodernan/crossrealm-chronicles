# no-clash-proxy.ps1 —— 解除 Clash Verge 的进程级代理依赖（Windows / PowerShell）
#
# 症状：不开 Clash 就 ECONNREFUSED（连不上 127.0.0.1:7897）。
# 原因：进程环境里留着 HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897，
#       任何遵守代理环境变量的客户端（OpenCode / curl / npm / gh）都会往一个没人监听的端口打。
# 用法：在**启动应用的那个终端**里先跑这段，再启动应用；或重开一个干净的终端再启动应用。
# 本脚本只改当前进程环境 + 清掉 IE 里残留的代理地址，不改仓库文件、不碰系统全局设置之外的东西。

foreach ($n in 'HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy') {
  Remove-Item "Env:$n" -ErrorAction SilentlyContinue
}
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' `
  -Name ProxyServer -Value '' -ErrorAction SilentlyContinue

Write-Output 'proxy vars cleared; testing direct HTTPS...'
try {
  $r = Invoke-WebRequest -UseBasicParsing 'https://api.github.com' -TimeoutSec 15
  Write-Output "direct HTTPS OK: HTTP $($r.StatusCode) — 现在可以不开 Clash 启动应用"
} catch {
  Write-Output "direct HTTPS FAILED: $($_.Exception.Message)"
  exit 1
}
