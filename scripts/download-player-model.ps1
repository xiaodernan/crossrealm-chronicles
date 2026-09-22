# 下载浏览器同款 Soldier.glb 到 Godot（Mixamo 占位，可替换为 Mixamo 导出 GLB）
$ErrorActionPreference = "Stop"
$dest = Join-Path $PSScriptRoot "..\godot\assets\models"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$url = "https://threejs.org/examples/models/gltf/Soldier.glb"
$out = Join-Path $dest "Soldier.glb"
Write-Host "Downloading $url -> $out"
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
Write-Host "Done. Replace with Mixamo GLB as assets/models/player.glb (priority load)."
