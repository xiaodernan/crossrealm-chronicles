@echo off
echo === 跨界纪事 · 简历全栈（Python + Java + Docker）===
cd /d "%~dp0"
if exist "resume-stack\start-full.bat" (
  call "resume-stack\start-full.bat"
) else (
  echo 未找到 resume-stack。请确保 resume-stack 目录存在。
  echo 若全栈在 Downloads\l-package，可执行：
  echo   mklink /J "%~dp0resume-stack" "C:\Users\18414\Downloads\l-package"
  pause
)
