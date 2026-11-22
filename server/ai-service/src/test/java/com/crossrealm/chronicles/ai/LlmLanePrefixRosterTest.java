package com.crossrealm.chronicles.ai;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 车道名册与冻结前缀门禁（W-Z516）。
 *
 * <p>钉的是这一句：<b>每一条会被真发出去的 system，都必须有一段"够长且逐字节稳定"的开头</b>。
 * 上游 prompt cache 的门槛在 1024 token 左右；低于这条线的 lane 每一次都是冷页，
 * 而"谁低于这条线"在这台服务里此前**没有任何一处可问**——`warmupUpstream()` 里那张表
 * 只在暖身的循环体内存在过，问不到、也不给门禁看。现在名册抽成 `LlmClient.laneSystems()`，
 * 桶名从 `CacheKeys` 反射现推，两边做双向对账。
 *
 * <p>字节→token 的换算不是拍脑袋：`docs/admin/data/arbiter-v4-live-probe-2026-11-19.json`
 * 里 v4 前缀 122 KB 量到 `prompt_tokens ≈ 47,370`，即每字节约 0.39 token。
 * 这条门用同一个系数量下界，并且把系数写在这里而不是藏在代码里——量具的口径要能被反驳。
 */
class LlmLanePrefixRosterTest {

    /** 每字节的 token 下界（由 122 KB ↔ 47,370 tok 标定：2.5 字节 ≈ 1 token）。 */
    private static final double BYTES_PER_TOKEN = 2.5;

    /** 上游缓存页的门槛（token）。 */
    private static final int CACHE_FLOOR_TOKENS = 1024;

    /**
     * 已经注册但**尚未接 LLM** 的桶（ deferred 名册，只准变小）。
     * 命途三问与炉火祈愿今天是浏览器侧 StateGraph 的确定性文案，不经过 ai-service；
     * 这两个桶只是给它们留的名牌。留着不丢人，**没人知道它没接**才丢人。
     */
    private static final Map<String, String> DEFERRED = Map.of(
            LlmClient.CacheKeys.FORTUNE_PATH, "命途·锚火三问：浏览器侧 StateGraph 确定性文案，未接 ai-service",
            LlmClient.CacheKeys.VIGIL_VOW, "星轨·炉火祈愿：同上");

    private static int estTokens(String text) {
        return (int) Math.ceil(text.getBytes(StandardCharsets.UTF_8).length / BYTES_PER_TOKEN);
    }

    /** `CacheKeys` 里的全部桶名，靠反射现推，不在这里手抄。 */
    private static Set<String> allBuckets() {
        Set<String> out = new TreeSet<>();
        for (java.lang.reflect.Field f : LlmClient.CacheKeys.class.getDeclaredFields()) {
            if (!java.lang.reflect.Modifier.isPublic(f.getModifiers())) continue;
            if (f.getType() != String.class) continue;
            try {
                out.add((String) f.get(null));
            } catch (IllegalAccessException e) {
                throw new AssertionError("CacheKeys 的常量应当全是 public static final String", e);
            }
        }
        assertFalse(out.isEmpty(), "一个桶都没反射出来 —— 这条门就没在量任何东西");
        return out;
    }

    private static LlmClient client() {
        AiProperties p = new AiProperties();
        p.setApiKey("unit-test-key");
        p.setModel("gpt-test");
        p.setTimeout(Duration.ofSeconds(3));
        p.setCacheTtlSeconds(120);
        p.setMaxRetries(0);
        return new LlmClient(p, (url, bearerToken, jsonBody, timeout) -> "{}",
                new com.fasterxml.jackson.databind.ObjectMapper());
    }

    @Test
    void 每条已注册车道的system都有过门槛的稳定开头() {
        Map<String, String> lanes = client().laneSystems();
        List<String> tooShort = new ArrayList<>();
        for (Map.Entry<String, String> e : lanes.entrySet()) {
            String system = e.getValue();
            if (system == null || system.isBlank()) {
                tooShort.add(e.getKey() + " 的 system 是空的");
                continue;
            }
            int tokens = estTokens(system);
            if (tokens < CACHE_FLOOR_TOKENS) {
                tooShort.add(String.format("%s 只有约 %d tok（门槛 %d）——这一条每次都是冷页",
                        e.getKey(), tokens, CACHE_FLOOR_TOKENS));
            }
        }
        assertEquals(List.of(), tooShort, "这些车道的开头不够长或不稳定，上游缓存接不住");
    }

    @Test
    void 四条短车道共享同一份纪律前缀() {
        Map<String, String> lanes = client().laneSystems();
        String discipline = PromptPrefixes.FROZEN_NPC_DISCIPLINE;
        // 前缀本体要先够格，否则"挂上前缀"这句话毫无意义。
        assertTrue(estTokens(discipline) >= CACHE_FLOOR_TOKENS,
                "纪律前缀自己没过门槛：" + estTokens(discipline) + " tok");
        for (String lane : List.of(LlmClient.CacheKeys.BOSSVERSE, LlmClient.CacheKeys.ECHO,
                LlmClient.CacheKeys.DEATH_EPITAPH, LlmClient.CacheKeys.CHAPTER_CODA)) {
            String system = laneOf(lanes, lane);
            assertTrue(system.startsWith(discipline),
                    lane + " 没挂在共享纪律前缀上，它每次都是冷页（四条本来该互相抬命中率）");
        }
    }

    @Test
    void 车道契约尾行仍然带着自己的长度档() {
        Map<String, String> lanes = client().laneSystems();
        // 纪律收成一份真源之后，各车道**自己**那几句必须还在：长度档是它们彼此的差别所在。
        assertTrue(laneOf(lanes, LlmClient.CacheKeys.DEATH_EPITAPH).contains("45 字"), "死笔一行的长度档丢了");
        assertTrue(laneOf(lanes, LlmClient.CacheKeys.BOSSVERSE).contains("40 字"), "余响的长度档丢了");
        assertTrue(laneOf(lanes, LlmClient.CacheKeys.CHAPTER_CODA).contains("60 字"), "残章的长度档丢了");
        assertTrue(laneOf(lanes, LlmClient.CacheKeys.ECHO).contains("45 字"), "回声的长度档丢了");
        // 母题清单与"只写这一条回响"是余响独有的，收编纪律时不许把它顺手删了。
        assertTrue(laneOf(lanes, LlmClient.CacheKeys.BOSSVERSE).contains("wizard / space / samurai"),
                "余响的母题清单丢了 —— 那是这一条车道唯一说得出语气的地方");
    }

    @Test
    void 桶名册与注册表双向对账() {
        Set<String> buckets = allBuckets();
        Map<String, String> lanes = client().laneSystems();
        Set<String> registered = new TreeSet<>();
        for (String laneName : lanes.keySet()) registered.add(LlmClient.laneBucketOf(laneName));

        List<String> unregistered = new ArrayList<>();
        for (String bucket : buckets) {
            if (!registered.contains(bucket) && !DEFERRED.containsKey(bucket)) unregistered.add(bucket);
        }
        assertEquals(List.of(), unregistered,
                "这些桶有名牌却没人知道它的 system 是什么（要注册，要么进 deferred 名册并写清为什么）");

        List<String> stale = new ArrayList<>();
        for (String bucket : DEFERRED.keySet()) {
            if (!buckets.contains(bucket)) stale.add(bucket + " 已不在 CacheKeys 里，deferred 名册要删");
            if (registered.contains(bucket)) stale.add(bucket + " 已经注册了，却还挂在 deferred 名册上");
        }
        assertEquals(List.of(), stale, "deferred 名册只准变小，而且变小要真的变小");
    }

    @Test
    void 名册里不许出现空桶名或重复子道() {
        Map<String, String> lanes = client().laneSystems();
        Set<String> seen = new TreeSet<>();
        for (String laneName : lanes.keySet()) {
            assertFalse(laneName == null || laneName.isBlank(), "车道名是空的");
            assertFalse(laneName.startsWith(":") || laneName.endsWith(":"), "车道名的冒号位置不对：" + laneName);
            assertTrue(seen.add(laneName), "车道名重号：" + laneName);
        }
    }

    private static String laneOf(Map<String, String> lanes, String bucket) {
        for (Map.Entry<String, String> e : lanes.entrySet()) {
            if (LlmClient.laneBucketOf(e.getKey()).equals(bucket)) return e.getValue();
        }
        throw new AssertionError("名册里没有这条桶：" + bucket + "，已有 " + lanes.keySet());
    }
}
