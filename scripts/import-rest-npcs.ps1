# Mixamo 营火 NPC -> rest/*.glb 批量导出

param(
  [switch]$OpenInbox
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$inbox = Join-Path $root "mixamo_rest_inbox"
$webRest = Join-Path $root "public\assets\models\rest"
$blenderScript = Join-Path $PSScriptRoot "blender_rest_npcs_to_glb.py"

$map = @{
  hub     = "hub_keeper.glb"
  fantasy = "elf_scout.glb"
  magic   = "mage_wanderer.glb"
  space   = "astronaut.glb"
  void    = "time_ghost.glb"
  abyss   = "chaos_guide.glb"
}

function Find-Blender {
  $cmd = Get-Command blender -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  @(
    "${env:ProgramFiles}\Blender Foundation\Blender 4.3\blender.exe",
    "${env:ProgramFiles}\Blender Foundation\Blender 4.2\blender.exe",
    "${env:ProgramFiles}\Blender Foundation\Blender 4.1\blender.exe"
  ) | ForEach-Object { if (Test-Path $_) { return $_ } }
  return $null
}

Write-Host "=== 营火 NPC Mixamo 导入 ===" -ForegroundColor Cyan

if (-not (Test-Path $inbox)) {
  New-Item -ItemType Directory -Path $inbox -Force | Out-Null
  foreach ($k in $map.Keys) {
    New-Item -ItemType Directory -Path (Join-Path $inbox $k) -Force | Out-Null
  }
  New-Item -ItemType Directory -Path (Join-Path $inbox "shared_idle") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $inbox "shared_sit") -Force | Out-Null
  Write-Host "已创建 mixamo_rest_inbox/ 子目录，请放入 FBX 后重跑。"
}

if (-not (Test-Path $webRest)) { New-Item -ItemType Directory -Path $webRest -Force | Out-Null }

$blender = Find-Blender
if (-not $blender) {
  Write-Host "未找到 Blender — 跳过 GLB 导出。游戏仍使用胶囊体 + Soldier 兜底。" -ForegroundColor Yellow
  exit 0
}

$exported = 0
foreach ($entry in $map.GetEnumerator()) {
  $srcDir = Join-Path $inbox $entry.Key
  if (-not (Test-Path $srcDir)) { continue }
  $fbx = Get-ChildItem $srcDir -Filter *.fbx -ErrorAction SilentlyContinue
  if (-not $fbx) { continue }
  $out = Join-Path $webRest $entry.Value
  Write-Host "导出 $($entry.Key) -> $($entry.Value)"
  & $blender --background --python $blenderScript -- $srcDir $out
  if ($LASTEXITCODE -eq 0) { $exported++ }
}

foreach ($shared in @("shared_idle", "shared_sit")) {
  $srcDir = Join-Path $inbox $shared
  if (-not (Test-Path $srcDir)) { continue }
  $fbx = Get-ChildItem $srcDir -Filter *.fbx -ErrorAction SilentlyContinue
  if (-not $fbx) { continue }
  $out = Join-Path $webRest "$shared.glb"
  & $blender --background --python $blenderScript -- $srcDir $out
}

Write-Host "完成。导出 $exported 个营火 NPC GLB -> public/assets/models/rest/" -ForegroundColor Green
if ($OpenInbox) { Start-Process explorer.exe $inbox }
