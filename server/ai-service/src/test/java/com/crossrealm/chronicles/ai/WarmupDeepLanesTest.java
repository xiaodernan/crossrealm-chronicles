package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * W-Z490 大前缀车道热身开关：默认关（省 token），显式可开。
 * 纯配置口径单测，零网络、零 Spring 上下文。
 */
class WarmupDeepLanesTest {

    @Test
    void 默认关闭_开机不烧大前缀token() {
        AiProperties p = new AiProperties();
        assertFalse(p.isWarmupDeepLanes(), "大前缀（v4≈4.7万 / v5≈8.3万 tok）默认不该开机热身");
    }

    @Test
    void 显式开启后生效() {
        AiProperties p = new AiProperties();
        p.setWarmupDeepLanes(true);
        assertTrue(p.isWarmupDeepLanes());
    }
}