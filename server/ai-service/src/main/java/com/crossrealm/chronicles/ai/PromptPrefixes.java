package com.crossrealm.chronicles.ai;

import java.io.InputStream;

/**
 * 冻结前缀唯一出口：/ai/llm-frozen-prefix.txt（由 scripts/build-llm-prefix.mjs 生成）。
 *
 * <p><b>这个前缀就是「Codex/ChatGPT 同款形状」</b>：身份+世界观+纪律+示例（≥ 2K token）全温常驻，
 * 各 lane / 各 persona / 所有并发会话在头部共享同一份 → `prompt_cache_key` 单桶内稳定命中。
 * 任何删改只准「追加」不准「替换」——想换版本就发新文件 `llm-frozen-prefix.v2.txt`
 * （老桶仍然命中老前缀）。
 */
public final class PromptPrefixes {
    private PromptPrefixes() {}

    public static final String FROZEN_PREFIX = read("/ai/llm-frozen-prefix.txt");

    /**
     * Codex-style 大前缀（W-Z321）：身份+世界观+纪律+17 母题+守夜人第二十七则（≈4.6K tok ≈ 6.2 K字节）。
     * 同一桶 cache key 仍共享——cache key 只吃 prompt 字节的前缀，前缀逐字节一致即命中。
     * 各 lane 调用切到这个 v2 之后，一次会话内命中的 token 量更多、边际响应仍恒定。
     */
    public static final String FROZEN_CODEX_CONTEXT = read("/ai/llm-frozen-prefix.v2.txt");

    /**
     * Codex-style 加强大前缀（W-Z346）：v2 + 典籍大事年表（00-168 每卷一行）
     * + 原典词料摘 verbatim + 守夜人谱系（阿祖→姥爷→阿父→阿石）。
     * 具体字数 ≈ 21K 字节（~15K tok）；新一代 cache page 单独暖（见 LlmWarmup），
     * 旧桶不动。 v2 不删不替换（缓存页不可复用但还在命中），想要大上下文的 lane 用这条。
     */
    public static final String FROZEN_CODEX_CONTEXT_V3 = read("/ai/llm-frozen-prefix.v3.txt");

    /**
     * 典籍全量大前缀（W-Z456）：oracle-v4-frozen-prefix.txt —— Oracle 系统提示 + creative/GLOSSARY.md
     * **逐字全量**（≈122 KB，≈4-5 万 token）。终局大场（arbiter 烬灯回信 / kindle 烬火答）专用，
     * 让一次上下文真正落在「5 万 tok 级」——与 v3 同桶共享同一 prompt_cache_key（缓存按前缀字节对齐），
     * 实测 prompt=47,370 · cached≈88-95%（scripts/arbiter-v4-live-probe.mjs）。
     * 日常 NPC 对话不要拿这条（Ember 首包延迟会被杀）——那一车仍用 v3。
     */
    public static final String FROZEN_CANON_CONTEXT_V4 = read("/ai/oracle-v4-frozen-prefix.txt");

    /**
     * 史诗深潜全量双语前缀（W-Z485）：oracle-v5-frozen-prefix.txt —— Oracle 系统提示 +
     * creative/GLOSSARY.md（中文正典）+ creative/GLOSSARY-en.md（英文正典）逐字全量。
     * 目标 ~8-9 万 token，真正进入 Codex 同档；v3 / v4 一律不动，独立 lane（ORACLE_DEEP）
     * 独立 cache key，冷页只暖一次。回答语种仍由玩家问句决定，双语正典仅作阅读参考。
     * 由 scripts/build-oracle-v5.mjs 确定性生成。
     */
    public static final String FROZEN_CANON_CONTEXT_V5 = read("/ai/oracle-v5-frozen-prefix.txt");

    /**
     * 四条短车道的共享纪律前缀（W-Z516）：`ai/llm-npc-discipline-prefix.txt`。
     *
     * <p>为什么单独一份而不是挂 v3：死笔一行 / 余响 / 残章 / 回声这四处每次只产一句话，
     * 把它们挂到 ≈15K token 的 v3 大前缀上，等于把单条未缓存输入从一两百字抬到一千七百字级，
     * 换来的命中率对一段风味文案毫无用处——**命中率高不等于花得对**。
     * 这份前缀只装四处本来就共用的东西（世界事实表 + 共同纪律 + 交稿自查 + 称谓表），
     * 体量刚好过上游 prompt-cache 的 1024 token 下界，于是四处共享同一页、互相抬命中率。
     *
     * <p>纪律从四个 controller 各自的内联文案里收上来，从此只有一处真源：
     * 改一句"不许安慰玩家"，四条车道同时改口；从前要改四处，而历史上只改过一两处。
     * 任何删改只准「追加」不准「替换」——替换等于把已暖的页踢掉（与上面各版同一条纪律）。
     */
    public static final String FROZEN_NPC_DISCIPLINE = read("/ai/llm-npc-discipline-prefix.txt");

    private static String read(String path) {
        try (InputStream in = PromptPrefixes.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("missing " + path + " — run scripts/build-llm-prefix.mjs");
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("failed to read " + path, e);
        }
    }
}
