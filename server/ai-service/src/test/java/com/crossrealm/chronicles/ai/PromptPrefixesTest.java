package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * W-Z456：v4 全量大前缀（oracle-v4-frozen-prefix.txt · creative/GLOSSARY.md verbatim 全量）
 * 必须能被加载、字节量级对（≥ 100 KB）、windows 三车道系统提示确实以它打底。
 */
class PromptPrefixesTest {

    @Test
    void FROZEN_CANON_CONTEXT_V4_载入成功且字节级达标() {
        String v4 = PromptPrefixes.FROZEN_CANON_CONTEXT_V4;
        assertTrue(v4.getBytes(java.nio.charset.StandardCharsets.UTF_8).length >= 100_000,
                "v4 前缀字节数 < 100000 —— resource 是否丢失 / 构建脚本是否没跑？");
        assertTrue(v4.contains("You are the Keeper of the Chronicles"),
                "v4 前缀应以 Oracle 系统提示开头（build-oracle-v4.mjs 的产物形状）");
    }

    @Test
    void Arbiter_system_以_v4_打底() {
        assertTrue(ArbiterController.ARBITER_SYSTEM.startsWith(PromptPrefixes.FROZEN_CANON_CONTEXT_V4),
                "arbiter system 必须以 v4 前缀开头（cache page 按前缀字节对齐）");
        assertTrue(ArbiterController.ARBITER_SYSTEM.contains("烬灯回信") || ArbiterController.ARBITER_SYSTEM.contains("炉火的记录者"),
                "arbiter system 应当保留其车道收敛条款（烬灯回信语义）");
    }

    @Test
    void KindleLetter_system_以_v4_打底() {
        assertTrue(KindleLetterController.KINDLE_LETTER_SYSTEM.startsWith(PromptPrefixes.FROZEN_CANON_CONTEXT_V4),
                "kindle-letter system 必须以 v4 前缀开头（终局大场专用）");
        assertTrue(KindleLetterController.KINDLE_LETTER_SYSTEM.contains("烬火答"),
                "kindle-letter system 应当保留其车道收敛条款（烬火答语义）");
    }

    @Test
    void 日常车道仍用_v3_不热加载大前缀() {
        assertEquals(false, PromptPrefixes.FROZEN_CODEX_CONTEXT_V3.startsWith(PromptPrefixes.FROZEN_CANON_CONTEXT_V4),
                "v3 前缀不得以 v4 开头（v3 保持 v3 语义，日常 NPC/残章不受终局大场体量影响）");
        assertFalse(PromptPrefixes.FROZEN_CODEX_CONTEXT_V3.isBlank());
    }
}
