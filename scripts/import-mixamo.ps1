# Mixamo -> player.glb 一键管线（Godot + 浏览器双端）

param(

  [string]$FbxDir = "",

  [string]$OutGlb = "",

  [switch]$OpenInbox

)



$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent

$inbox = Join-Path $root "mixamo_inbox"

$godotOut = Join-Path $root "godot\assets\models\player.glb"

$webOut = Join-Path $root "public\assets\models\player.glb"

$out = if ($OutGlb) { $OutGlb } else { $godotOut }



function Find-Blender {

  $cmd = Get-Command blender -ErrorAction SilentlyContinue

  if ($cmd) { return $cmd.Source }

  $candidates = @(

    "${env:ProgramFiles}\Blender Foundation\Blender 4.3\blender.exe",

    "${env:ProgramFiles}\Blender Foundation\Blender 4.2\blender.exe",

    "${env:ProgramFiles}\Blender Foundation\Blender 4.1\blender.exe",

    "${env:ProgramFiles}\Blender Foundation\Blender 4.0\blender.exe",

    "${env:ProgramFiles}\Blender Foundation\Blender 3.6\blender.exe"

  )

  foreach ($c in $candidates) {

    if (Test-Path $c) { return $c }

  }

  return $null

}



Write-Host "=== Crossrealm Mixamo 一键导入 ===" -ForegroundColor Cyan



if (-not (Test-Path $inbox)) {

  New-Item -ItemType Directory -Path $inbox | Out-Null

  Write-Host "已创建收件箱: $inbox"

  Write-Host "请把 Mixamo FBX 放入此文件夹后重新运行本脚本。"

}



if ($OpenInbox) {

  Start-Process explorer.exe $inbox

  exit 0

}



$src = $FbxDir

if (-not $src) {

  $fbxInInbox = @(Get-ChildItem -Path $inbox -Filter "*.fbx" -ErrorAction SilentlyContinue)

  if ($fbxInInbox.Count -gt 0) {

    $src = $inbox

    Write-Host "自动检测到 mixamo_inbox 内 $($fbxInInbox.Count) 个 FBX"

  }

}



if (-not $src) {

  Write-Host ""

  Write-Host "用法:" -ForegroundColor Yellow

  Write-Host "  npm run import:mixamo                    # 扫描 mixamo_inbox/"

  Write-Host "  npm run import:mixamo -- -FbxDir `"D:\fbx`""

  Write-Host "  npm run import:mixamo -- -OpenInbox      # 打开收件箱文件夹"

  Write-Host ""

  Write-Host "Mixamo 下载建议: Idle, Walk, Run, Sword Slash, Roll, Hit Reaction, Blocking"

  Write-Host "  第一个 FBX: With Skin · 其余: Without Skin"

  exit 0

}



$blender = Find-Blender

if (-not $blender) {

  Write-Host "未找到 Blender。请安装 Blender 4.x 并加入 PATH。" -ForegroundColor Red

  Write-Host "或手动导出 GLB 到: $out 与 $webOut"

  exit 1

}



$py = Join-Path $PSScriptRoot "blender_mixamo_to_glb.py"

Write-Host "Blender: $blender"

Write-Host "输入:    $src"

Write-Host "Godot:   $out"

Write-Host "Web:     $webOut"

Write-Host ""



& $blender --background --python $py -- $src $out

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }



$webDir = Split-Path $webOut -Parent

if (-not (Test-Path $webDir)) { New-Item -ItemType Directory -Path $webDir -Force | Out-Null }

Copy-Item -Path $out -Destination $webOut -Force



Write-Host ""

Write-Host "完成 -> $out" -ForegroundColor Green

Write-Host "同步 -> $webOut" -ForegroundColor Green

Write-Host "浏览器 Ctrl+F5 优先加载 public/assets/models/player.glb" -ForegroundColor Green

