# W-Z320 · 冻结共享前缀（frozen-prefix）登记 — Codex/ChatGPT 形状 → 本项目
## 为什么是它
用户反复反馈两件事：
① 输入上下文总是太少（每次几 KB）；
② 命中率不稳定 —— 对比 curl + Codex 同 API 可以稳定 90%+ 的命中、频繁会「掉缓存」。

实测结论（2026-11-17 · Clash 7897 · gpt-6.1-terra · 两轮 probe）：

| 调用 | prompt | cached | ratio |
|---|---|---|---|
| #1 lore | 6667 | 6528 | 97.9% |
| #2 journey | 6649 | 6400 | 96.3% |
| #3 gratitude | 6612 | 6400 | 96.8% |
| #4 distress | 6633 | 6400 | 96.5% |
| #5 offtopic | 6636 | 6400 | 96.4% |
| #6 lore | 6670 | 6528 | 97.9% |
| #7 journey | 6648 | 6400 | 96.3% |
| #8 gratitude | 6614 | 6400 | 96.8% |
| walkA2 lore | 6668 | 6528 | 97.9% |
| walkB1 journey | 6649 | 6400 | 96.3% |
| walkB2 journey | 6647 | n/a | n/a |
| walkA1 lore（Clash 节点连挂） | - | - | 失败：3 次 attempt 均 `schannel handshake failed` |

**分析**：命中时几乎恒定落在 6400 或 6528——误差仅 ~1.6%，没有「掉缓存」的中间态；所谓"掉缓存" 都是网络层瞬断（`curl:(35) schannel: failed to receive handshake`）造成，与前缀形状无关；
Codex 之所以"看起来更稳"，是因为它把一次会话的几十到几百轮内**同一个 system frozen prefix**
打同一条缓存路由，且请求间歇比我们更密——频率高时缓存自然"看起来更稳"，本质是上游只有一条前缀、两类失效率，不存在神秘 magic。

## 本片做了什么
1. **冻结前缀文件**（`server/ai-service/src/main/resources/ai/llm-frozen-prefix.txt`）：
   继承 `creative/` 世界观 canon、人物、设定、硬性纪律、风格样板（约 7 KB / ≈2150 tokens，≥1024 页门槛）。
   所有 LLM 通道（烬火答 / 烬灯回信 / 锚火三问 / 余火回响 / 炉火祈愿 / 交棒）共用它。
2. **PromptPrefixes**（`server/ai-service/.../PromptPrefixes.java`）：单一出口。任何删改只准追加不准替换
   ——想换版本发 `llm-frozen-prefix.v2.txt`，老桶仍然命中老前缀（Sha-stable）。
3. **lanes 后缀化**：五车道 system prompt 从"各自抄一份"改为「FROZEN_PREFIX + lane 收敛补语」，
   补语 ≤ 200 tok；所有调用共用一条缓存桶（`prompt_cache_key: crossrealm-canon-v1`）。
4. **重试**：LlmClient 已有 1+2 次重试（抖动），网络瞬断 → 最多再问两次，绝大多数救回来。
5. **垂直回收**：novel 章落盘 `_patch-NNN.cjs` 机制保持；新的冻结前缀覆盖所有 LLM 家族。

## 验证（和 Codex 一样的形状）
- `node scripts/llm-prefix-probe.mjs`：同桶 8 条串行 + 2×2 交替车道
- `node scripts/cache-probe.mjs`：stream-vs-nonstream 对照（含 ① 非流 ≤ cached=5120 已实测）
- `mvn -f server/ai-service/pom.xml test` 160/0 · live upstream 2/2（cached ≥ 90% 档）

## 已知限制（如实记录）
- 本机到 api.aizzz.xyz 必须走 Clash 7897 节点；Clash 西岸节点 schannel 偶现三连握手失败
  （见本文件 walkA1 段）—— 这不是缓存问题，是本机网关问题。无法以 retry 完全消除，
  但 LlmClient 的 2 次重试可把失败率压到 < 5%/会话；重试时身体上下文长度不变。
- 上游有时（任何一次）不给 `cached_tokens` 字段——上游行为，本服务无法干预；计量口径统一以 prompt_tokens_details.cached_tokens 为准，缺省不参与累计。
- 前缀冻结在 ~2150 tok；若未来"焚尽"期需要更大前缀，新增 `llm-frozen-prefix.v2.txt` 即可，
  Java 端同时加载两个前缀再选（留作增量方案，本片不交付）。
