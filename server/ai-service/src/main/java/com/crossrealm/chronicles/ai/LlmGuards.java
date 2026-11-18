package com.crossrealm.chronicles.ai;

import java.util.Locale;

/**
 * LlmGuards —— LLM 出站确定性护栏共享词典（不依赖任何 lane 的状态）。
 *
 * <p>ember-reply（NPC 一句话）、death-epitaph（残墨一行）、chapter-coda（残章一行）、
 * Oracle Lore（长答）四条 lane 共用这一份判成色标准：
 * <ul>
 *   <li>{@code containsLeak}：大小写不敏感包含泄露词表（星轨顾问 / as an AI / gpt / system prompt …）——出现的句子一律不给玩家；</li>
 *   <li>{@code stripMarkdown}：剥 markdown 记号（反引号、加粗星、下划线、行首 # 标题）——暴露 prompt 痕迹的都削掉。</li>
 * </ul>
 * 长度钳制（zh≤60 / en≤72 NPC 一行 vs Oracle 长答无钳制）留在各 lane 自己手里——这是 lane 的事。
 */
public final class LlmGuards {

    private LlmGuards() {}

    /** 泄露词表（命中任何一条即整行作废；全部小写，匹配前统一转小写）。 */
    public static final String[] LEAK_TOKENS = {
            "星轨顾问", "bossverse", "我是ai", "我是 ai", "作为ai", "作为 ai",
            "as an ai", "language model", "large language model",
            "system prompt", "prompt:", "system:", "我是语言模型",
            "gpt", "claude", "openai", "org/chat", "anthropic",
    };

    /** 任何泄露词命中即 true（大小写不敏感）。 */
    public static boolean containsLeak(String text) {
        if (text == null) {
            return false;
        }
        String lower = text.toLowerCase(Locale.ROOT);
        for (String leak : LEAK_TOKENS) {
            if (lower.contains(leak)) {
                return true;
            }
        }
        return false;
    }

    /** markdown 剥除：反引号/加粗星/下划线剥除；行首 # 标题记号剥除；首尾 trim。 */
    public static String stripMarkdown(String text) {
        if (text == null) {
            return "";
        }
        return text.replaceAll("[`*_]+", "").replaceAll("(^|\\n)\\s*#{1,6}\\s*", "$1").trim();
    }
}
