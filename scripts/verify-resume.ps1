# 转发到 resume-stack 验证脚本
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& "$root\resume-stack\scripts\verify-resume.ps1"
