package com.crossrealm.chronicles.game.notify;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * W-Z50「报讯台镜像」单测：白名单 / 名册映射 / 降级吞异常 / 开关。
 *
 * <p>这里钉死的是**契约**：
 * 1) 非 boss_defeated 一律不发报讯（报讯台不是流水日志）
 * 2) 五个已知 bossId 映射中文名；未知 id 走兜底但绝不抛异常
 * 3) detail 里的控制字符被剥离、超长被裁剪（进 Feign 请求体前就干净）
 * 4) 关闭开关 → 完全不触碰客户端
 * 5) 客户端抛异常 → 吞掉、返回 false，永不外抛（遥测入口不许 500）
 */
class NotifyMirrorServiceTest {

    /** 手写 stub 客户端：只记录调用，不连网络。 */
    static class RecordingClient implements NotifyClient {
        final List<NotifyEvent> calls = new ArrayList<>();
        RuntimeException toThrow;

        @Override
        public NotifyAck publish(NotifyEvent event) {
            calls.add(event);
            if (toThrow != null) {
                throw toThrow;
            }
            return new NotifyAck("id-stub", event.kind(), true, false);
        }
    }

    private static NotifyMirrorService mirror(RecordingClient client, boolean enabled) {
        return new NotifyMirrorService(client, enabled);
    }

    @Test
    @DisplayName("非 boss_defeated 遥测不镜像（流水日志不该进报讯台）")
    void ignoresOtherTypes() {
        RecordingClient client = new RecordingClient();
        NotifyMirrorService m = mirror(client, true);
        assertFalse(m.mirror("smoke", "compose"));
        assertFalse(m.mirror("elite_surge", "anything"));
        assertTrue(client.calls.isEmpty());
    }

    @Test
    @DisplayName("五个已知 bossId → 中文名（与前端 bossRoster 同源）")
    void mapsKnownBossNames() {
        RecordingClient client = new RecordingClient();
        NotifyMirrorService m = mirror(client, true);
        m.mirror("boss_defeated", "shadow-warden");
        m.mirror("boss_defeated", "archmagus");
        m.mirror("boss_defeated", "singularity-herald");
        m.mirror("boss_defeated", "void-chronarch");
        m.mirror("boss_defeated", "chaos-overlord");
        List<String> bodies = client.calls.stream().map(NotifyEvent::body).toList();
        assertTrue(bodies.stream().anyMatch(b -> b.contains("影界守护者")), bodies.toString());
        assertTrue(bodies.stream().anyMatch(b -> b.contains("大奥术师")), bodies.toString());
        assertTrue(bodies.stream().anyMatch(b -> b.contains("奇点领主")), bodies.toString());
        assertTrue(bodies.stream().anyMatch(b -> b.contains("时线执政官")), bodies.toString());
        assertTrue(bodies.stream().anyMatch(b -> b.contains("混沌裂隙领主")), bodies.toString());
        // 全部走 world 频道、统一 title
        for (NotifyEvent e : client.calls) {
            assertEquals("world", e.kind());
            assertEquals("世界事件 · Boss 被讨伐", e.title());
        }
    }

    @Test
    @DisplayName("未知 bossId → 兜底文案、不抛异常")
    void unknownBossFallsBack() {
        RecordingClient client = new RecordingClient();
        NotifyMirrorService m = mirror(client, true);
        assertTrue(m.mirror("boss_defeated", "some-unreleased-boss"));
        NotifyEvent sent = client.calls.get(0);
        assertTrue(sent.body().contains("未知 Boss（some-unreleased-boss）"), sent.body());
    }

    @Test
    @DisplayName("detail 去控制字符、裁剪 64 字（进 Feign 前就干净）")
    void sanitizesDetail() {
        RecordingClient client = new RecordingClient();
        NotifyMirrorService m = mirror(client, true);
        String dirty = "chao\u0001s-lord\u007foverflow" + "x".repeat(100);
        m.mirror("boss_defeated", dirty);
        NotifyEvent sent = client.calls.get(0);
        // 控制字符 \u0001 \u007f 被剥离
        assertFalse(sent.body().contains("\u0001"), sent.body());
        assertFalse(sent.body().contains("\u007f"), sent.body());
        // 兜底文案长度受限（bossId 最长 64 + 前后缀）
        assertTrue(sent.body().length() <= 128, sent.body());
    }

    @Test
    @DisplayName("开关关闭 → 完全不触碰客户端")
    void disabledSwitchNeverCalls() {
        RecordingClient client = new RecordingClient();
        NotifyMirrorService m = mirror(client, false);
        assertFalse(m.mirror("boss_defeated", "shadow-warden"));
        assertTrue(client.calls.isEmpty());
    }

    @Test
    @DisplayName("客户端抛异常 → 吞掉、返回 false（遥测入口不许 500）")
    void clientExceptionSwallowed() {
        RecordingClient client = new RecordingClient();
        client.toThrow = new RuntimeException("feign blew up");
        NotifyMirrorService m = mirror(client, true);
        assertFalse(m.mirror("boss_defeated", "shadow-warden"));
    }

    @Test
    @DisplayName("fallbackFactory 降级回执：连不上也不抛、stored=false")
    void fallbackFactoryDegrades() {
        NotifyClientFallbackFactory factory = new NotifyClientFallbackFactory();
        NotifyClient degraded = factory.create(new java.net.ConnectException("connection refused"));
        NotifyAck ack = degraded.publish(new NotifyEvent("world", "t", "b"));
        assertFalse(ack.stored());
        assertFalse(ack.broadcast());
    }
}
