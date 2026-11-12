/**
 * ai-lore-assist —— 开发期运维的 AI 语料候选工具（非游戏内容、不在热路径）
 *
 * 职责：
 *   1. 在开发期，把一批"回声 / 母题"语料送模型做一致性/史诗气质检查，出候选清单供人工挑；
 *   2. 本工具**不进 CI 热路径**，不在任何玩家可达的代码里调用；
 *   3. 输出仅供人工 review——定稿是人的编辑决定，不是 AI 的默认输出；
 *   4. 离线/CI 安全：LLM_API_KEY 未设置时直接 exit(1)，不发任何网络请求；
 *   5. 密钥只从环境变量读取（process.env.*）；不出现在任何被 git 追踪的文件中。
 *
 * 使用方式：
 *   LLM_API_KEY=sk-xxxx node scripts/ai-lore-assist.mjs [n] [outPath]
 *   LLM_MODEL=gpt-6-sol LLM_BASE_URL=https://wkapi.pro/v1 LLM_API_KEY=sk-xxxx node scripts/ai-lore-assist.mjs 3 candidates.md
 *
 * 结构：
 *   - 读 system prompt（中文润色师 + 返回JSON数组约束）+ user prompt（N 个母题 × 40-80 字回声描述）；
 *   - 60s AbortController 超时；非 2xx → exit(1)；
 *   - 解析失败 → 把 raw 输出原样打印，不报错丢数据；
 *   - 成功 → 输出 markdown（outPath 可选）或 stdout。
 */
