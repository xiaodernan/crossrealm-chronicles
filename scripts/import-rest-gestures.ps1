# 营火 NPC 手势 FBX -> shared wave/sit glb

param([switch]$OpenInbox)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$inbox = Join-Path $root "mixamo_rest_inbox\shared_gestures"
$outDir = Join-Path $root "public\assets\models\rest\gestures"
$blenderScript = Join-Path $PSScriptRoot "blender_rest_gestures_to_glb.py"

function Find-Blender {
  $cmd = Get-Command blender -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  @(
    "${env:ProgramFiles}\Blender Foundation\Blender 4.3\blender.exe",
    "${env:ProgramFiles}\Blender Foundation\Blender 4.2\blender.exe"
  ) | ForEach-Object { if (Test-Path $_) { return $_ } }
  return $null
}

if (-not (Test-Path $inbox)) {
  New-Item -ItemType Directory -Path $inbox -Force | Out-Null
  Write-Host "已创建 $inbox — 放入 Sitting.fbx Waving.fbx 等"
}

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$blender = Find-Blender
if (-not $blender) {
  Write-Host "未找到 Blender — 将使用程序化手势" -ForegroundColor Yellow
  exit 0
}

$fbx = Get-ChildItem $inbox -Filter *.fbx -ErrorAction SilentlyContinue
if (-not $fbx) {
  Write-Host "shared_gestures 内无 FBX"
  if ($OpenInbox) { Start-Process explorer.exe $inbox }
  exit 0
}

& $blender --background --python $blenderScript -- $inbox $outDir
Write-Host "手势 GLB -> public/assets/models/rest/gestures/" -ForegroundColor Green
if ($OpenInbox) { Start-Process explorer.exe $inbox }
