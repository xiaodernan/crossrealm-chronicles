@echo off
cd D:\3a大作
git add src/content/strings.zh.js src/content/strings.en.js README.md
git commit -m "feat(canon): W-Z483 第二百七十八卷《小雪 / Minor Snow》入典" 2>&1 > NUL
git push origin main 2>&1 > "%TEMP%\gitpush278.log"