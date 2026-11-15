#!/bin/sh
# compose 参考部署一键自检（W-Z112 落盘为脚本，不再在 compose 里塞内联 curl 串）。
# 任何一条 curl 失败即 exit 1 —— 这就是「全链路能不能进生产」的最低门槛。
set -eu

BASE="http://gateway:8080"

echo '== /api/version =='
curl -fsS "$BASE/api/version"; echo

echo '== /api/leaderboard =='
curl -fsS "$BASE/api/leaderboard?limit=2"; echo

echo '== telemetry =='
curl -fsS -X POST "$BASE/api/telemetry/events" -H 'content-type: application/json' -d '{"type":"smoke","detail":"compose"}'; echo
curl -fsS "$BASE/api/telemetry/events/count"; echo

echo '== /api/seasons/active =='
curl -fsS "$BASE/api/seasons/active"; echo

echo '== /api/seasons/stats =='
curl -fsS "$BASE/api/seasons/stats"; echo

echo '== /api/ops/stats =='
curl -fsS "$BASE/api/ops/stats"; echo

echo '== /api/ops/season =='
curl -fsS "$BASE/api/ops/season"; echo

echo '== /api/presence/world/count =='
curl -fsS "$BASE/api/presence/world/count"; echo

echo '== /api/notify =='
curl -fsS -X POST "$BASE/api/notify" -H 'content-type: application/json' \
  -d '{"kind":"system","title":"compose-smoke","body":"full-path notify delivery (ASCII-safe)"}'; echo

echo '== /api/notify/recent =='
curl -fsS "$BASE/api/notify/recent?limit=1"; echo

echo '== /api/notify/stats =='
curl -fsS "$BASE/api/notify/stats"; echo

echo '== /actuator/springcloud =='
curl -fsS "$BASE/actuator/springcloud"; echo

echo '== /api/telemetry/summary-rollup =='
curl -fsS "$BASE/api/telemetry/summary-rollup"; echo

echo '== ALL VERIFY CHECKS PASSED =='
