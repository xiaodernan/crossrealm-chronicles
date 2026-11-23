package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LlmLaneBudgetTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final class Capturing implements LlmTransport {
        final List<Map<?, ?>> bodies = new ArrayList<>();

        @Override
        public String postJson(String url, String bearerToken, String jsonBody, Duration timeout) {
            try {
                bodies.add(MAPPER.readValue(jsonBody, Map.class));
            } catch (Exception e) {
                throw new AssertionError(e);
            }
            return "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}";
        }
    }

    private static AiProperties props() {
        AiProperties p = new AiProperties();
        p.setApiKey("unit-test-key");
        p.setMaxRetries(0);
        return p;
    }

    private static Set<String> allBuckets() throws Exception {
        Set<String> out = new TreeSet<>();
        for (Field field : LlmClient.CacheKeys.class.getDeclaredFields()) {
            if (Modifier.isPublic(field.getModifiers()) && field.getType() == String.class) {
                out.add((String) field.get(null));
            }
        }
        assertFalse(out.isEmpty());
        return out;
    }

    @Test
    void 每个登记桶都有正预算短车道收敛深潜车道留足空间() throws Exception {
        AiProperties p = props();
        for (String bucket : allBuckets()) {
            assertTrue(p.getLaneMaxTokens().containsKey(bucket), "桶没有输出预算：" + bucket);
            assertTrue(p.maxTokensFor(bucket) > 0, "桶预算不是正数：" + bucket);
        }
        assertTrue(p.maxTokensFor(LlmClient.CacheKeys.EMBER) < p.maxTokensFor(LlmClient.CacheKeys.ADVISOR));
        assertTrue(p.maxTokensFor(LlmClient.CacheKeys.ORACLE_DEEP) > p.maxTokensFor(LlmClient.CacheKeys.ORACLE));
        assertEquals(320, p.maxTokensFor("unregistered-future-lane"));
    }

    @Test
    void 配置源能覆盖单条车道预算() {
        MapConfigurationPropertySource source = new MapConfigurationPropertySource(Map.of(
                "ai-service.lane-max-tokens.crossrealm-advisor-v1", "444",
                "ai-service.lane-max-tokens.crossrealm-oracle-deep-v1", "800"));
        AiProperties bound = new Binder(source).bind("ai-service", Bindable.of(AiProperties.class)).get();
        assertEquals(444, bound.maxTokensFor(LlmClient.CacheKeys.ADVISOR));
        assertEquals(800, bound.maxTokensFor(LlmClient.CacheKeys.ORACLE_DEEP));
        assertEquals(96, bound.maxTokensFor(LlmClient.CacheKeys.EMBER));
    }

    @Test
    void 真请求体使用车道预算且健康快照回显同一数字() throws Exception {
        Capturing transport = new Capturing();
        LlmClient client = new LlmClient(props(), transport, MAPPER);
        client.complete("系统", "指路", LlmClient.CacheKeys.GUIDE);
        client.complete("系统", "深潜", LlmClient.CacheKeys.ORACLE_DEEP);

        assertEquals(192, transport.bodies.get(0).get("max_tokens"));
        assertEquals(768, transport.bodies.get(1).get("max_tokens"));
        assertEquals("crossrealm-guide-v1", transport.bodies.get(0).get("prompt_cache_key"));
        @SuppressWarnings("unchecked")
        Map<String, Object> upstream = (Map<String, Object>) client.health().get("upstreamUsage");
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> lanes = (Map<String, Map<String, Object>>) upstream.get("byLane");
        assertEquals(192, lanes.get(LlmClient.CacheKeys.GUIDE).get("maxTokens"));
        assertEquals(768, lanes.get(LlmClient.CacheKeys.ORACLE_DEEP).get("maxTokens"));
    }

    @Test
    void 同内容换预算不得复用旧摘要缓存() {
        Capturing transport = new Capturing();
        AiProperties p = props();
        LlmClient client = new LlmClient(p, transport, MAPPER);
        client.complete("系统", "同一问", LlmClient.CacheKeys.ADVISOR);
        p.setLaneMaxTokens(new java.util.LinkedHashMap<>(Map.of(LlmClient.CacheKeys.ADVISOR, 321)));
        client.complete("系统", "同一问", LlmClient.CacheKeys.ADVISOR);

        assertEquals(2, transport.bodies.size(), "预算变了却复用旧答案，调用方会拿到不符合新上限的结果");
        assertEquals(320, transport.bodies.get(0).get("max_tokens"));
        assertEquals(321, transport.bodies.get(1).get("max_tokens"));
    }

    @Test
    void 非法预算在发请求前失败且零外呼() {
        Capturing transport = new Capturing();
        AiProperties p = props();
        p.setLaneMaxTokens(new java.util.LinkedHashMap<>(Map.of(LlmClient.CacheKeys.ADVISOR, 0)));
        LlmClient client = new LlmClient(p, transport, MAPPER);

        assertThrows(IllegalStateException.class, () -> client.complete("系统", "问题", LlmClient.CacheKeys.ADVISOR));
        assertTrue(transport.bodies.isEmpty(), "非法预算不该送到上游");
    }

    @Test
    void 烬灯回信有独立冻结前缀与缓存桶() {
        LlmClient client = new LlmClient(props(), new Capturing(), MAPPER);
        String system = client.laneSystems().get(LlmClient.CacheKeys.KINDLE_LETTER);
        assertTrue(system.startsWith(PromptPrefixes.FROZEN_CANON_CONTEXT_V4));
        assertTrue(system.contains(KindleLetterController.KINDLE_LETTER_CONTRACT));
        assertFalse(system.equals(EmberReplyController.LORE_SYSTEM));
    }
}
