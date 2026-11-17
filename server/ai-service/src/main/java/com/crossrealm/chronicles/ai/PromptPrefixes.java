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

    private static String read(String path) {
        try (InputStream in = PromptPrefixes.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("missing " + path + " — run scripts/build-llm-prefix.mjs");
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("failed to read " + path, e);
        }
    }
}
