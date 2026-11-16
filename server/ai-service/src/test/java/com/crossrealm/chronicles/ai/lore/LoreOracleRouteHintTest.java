package com.crossrealm.chronicles.ai.lore;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z244：现实原型路由——喂给模型的 user 末尾可追加一句 refs 转向注记；
 * canon 问题、专属 token 不在场的问题必须保持原样。
 */
class LoreOracleRouteHintTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "锚火在现实世界对应祭灶还是维斯塔？",
            "灶神在中国真实存在吗？",
            "祭灶习俗是什么？",
            "白桦在俄罗斯是什么树？",
            "秋分和中秋的节气对照？",
            "永恒火焰有哪些真实案例？",
            "希腊赫斯提亚掌管什么？",
            "罗马维斯塔童女做什么？",
            "does the anchor fire have a real-world prototype?",
            "Vesta's fire at the Temple of Vesta — who kept it?",
            "Mid-Autumn Festival and the equinox",
            "birch tree resin — why did fires burn steady?",
            "zhao jun kitchen god history",
    })
    void refsTerritoryRoutesToRefsHint(String question) {
        assertTrue(LoreOracleService.prefersRealWorldRefs(question),
                "现实原型类问题必须路由到 refs 卷提示，实际: " + question);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "锚火是什么？",
            "灶火为什么不灭？",
            "白茵是谁？",
            "林渡看守的日子讲了什么？",
            "第104卷《山顶来信》讲了什么？",
            "Why does the fire never go out?",
            "Tell me about A-Shi's story",
            "什么是归途残卷？",
            "anchored fire in the novel — what is it?",
    })
    void canonTerritoryDoesNotRoute(String question) {
        assertFalse(LoreOracleService.prefersRealWorldRefs(question),
                "canon 问题不得路由到 refs 提示，实际: " + question);
    }

    @org.junit.jupiter.api.Test
    void blankIsNotRouted() {
        assertFalse(LoreOracleService.prefersRealWorldRefs(null));
        assertFalse(LoreOracleService.prefersRealWorldRefs(""));
        assertFalse(LoreOracleService.prefersRealWorldRefs("   "));
    }
}
