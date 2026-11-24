# disable-clash-services.ps1 —— 彻底停用 Clash Verge 的两个系统服务（会弹 UAC，请点“是”）
#
# 背景：clash_verge_service / FlClashHelperService 以 SYSTEM 级运行，
#       普通权限进程无法 Stop-Service / Set-Service。本脚本先自我提权，再：
#       ① 停止服务；② 设为 Disabled（禁止开机自启）；③ 清掉系统/用户层残留代理；
#       ④ 验证 7897 端口再无监听。
# 用法：在资源管理器里双击本文件（或右键 → 使用 PowerShell 运行）。
#       弹出“是否允许此应用对你的设备进行更改？”时点“是”。
# 之后所有应用（OpenCode / WorkBuddy / 浏览器 / git / npm）都走正常网络，无需 Clash。

$svc = @('clash_verge_service', 'FlClashHelperService')

# --- 自我提权 ---
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p  = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
  Start-Process -FilePath powershell.exe -ArgumentList $arg -Verb RunAs
  exit
}

Write-Output '已获得管理员权限，开始停用 Clash 服务...'
foreach ($s in $svc) {
  try {
    $obj = Get-Service -Name $s -ErrorAction Stop
    if ($obj.Status -ne 'Stopped') { Stop-Service -Name $s -Force -ErrorAction Stop }
    Set-Service -Name $s -StartupType Disabled -ErrorAction Stop
    Write-Output ($s + ': stopped + Disabled')
  } catch {
    Write-Output ($s + ': ' + $_.Exception.Message)
  }
}

# 清残留代理（系统 / 用户 / 当前进程）
foreach ($n in 'HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy') {
  Remove-Item "Env:$n" -ErrorAction SilentlyContinue
  [Environment]::SetEnvironmentVariable($n, '', 'Machine')
  [Environment]::SetEnvironmentVariable($n, '', 'User')
}
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyServer -Value '' -ErrorAction SilentlyContinue
netsh winhttp reset proxy | Out-Null

Start-Sleep -Seconds 2
Write-Output '--- 校验 7897 端口 ---'
$left = netstat -ano | Select-String ':7897'
if ($left) { $left | ForEach-Object { Write-Output $_.Line.Trim() }; Write-Output '仍有监听，可能需重启电脑' }
else { Write-Output '7897 无监听 —— Clash 已彻底停用，现在走正常网络' }

Write-Output ''
Write-Output '完成。请重启 OpenCode / WorkBuddy 等应用让它们读取干净的网络环境。'
Read-Host '按回车关闭'
