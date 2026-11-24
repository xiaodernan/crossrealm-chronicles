# no-clash-proxy.ps1 —— 彻底解除 Clash Verge 造成的 ECONNREFUSED（Windows / PowerShell）
#
# 症状：不开 Clash 就报 ECONNREFUSED（连不上 127.0.0.1:7897）。
# 根因：应用进程环境里留着 HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897；
#       Clash 关掉后端口没人监听，所有遵守这些变量的客户端都往死端口打。
#       这些变量是「进程级继承」：explorer 在登录时拿到旧值，之后从桌面启动的
#       OpenCode 等应用继续继承——所以只清当前终端没用，必须同时刷新用户环境 + 会话。
#
# 本脚本做三件事（都不需要管理员）：
#   ① 当前进程：清掉 HTTP_PROXY / HTTPS_PROXY / http_proxy / https_proxy；
#   ② 用户环境（注册表 HKCU\Environment）：把这些键写成空值，之后登录/新进程都无代理；
#   ③ 重启 explorer.exe：让桌面会话重新读注册表，否则新启动的应用仍继承旧值。
#   最后实测直连 HTTPS，确认不走任何代理也能上网。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\no-clash-proxy.ps1
# 注意：跑完后【重启 OpenCode 应用本身】——已运行的进程无法从外部改环境。
#      重启后如果还报错，再重开一次本脚本（它会清掉新进程可能继承的残留）。

foreach ($n in 'HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy') {
  Remove-Item "Env:$n" -ErrorAction SilentlyContinue
  [Environment]::SetEnvironmentVariable($n, '', 'User')
}
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' `
  -Name ProxyServer -Value '' -ErrorAction SilentlyContinue

# 让桌面会话重新读取用户环境（否则 GUI 启动的应用继续继承旧代理）
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process explorer.exe

Write-Output 'proxy cleared (process + user env + session); testing direct HTTPS...'
try {
  $r = Invoke-WebRequest -UseBasicParsing 'https://github.com' -TimeoutSec 15
  Write-Output "direct HTTPS OK: HTTP $($r.StatusCode) — 现在重启 OpenCode，即可不开 Clash 正常联网"
} catch {
  Write-Output "direct HTTPS FAILED: $($_.Exception.Message)"
  exit 1
}
