package com.crossrealm.chronicles.notify;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REST 契约门禁（standalone MockMvc：不起容器；台账用内存实现，广播因无 Redis bean 而为 false）。
 *
 * 这里量的是**契约**：字段名/状态码一旦变，客户端（前端 OnlineServices 将来要读它）就要跟着改。
 */
class NotifyControllerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        InMemoryNotificationLedger ledger = new InMemoryNotificationLedger();
        // standalone 下没有 Redis bean：mock 一个 provider，getIfAvailable() 回 null → broadcast=false（预期）
        @SuppressWarnings("unchecked")
        ObjectProvider<StringRedisTemplate> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);
        mockMvc = MockMvcBuilders.standaloneSetup(new NotifyController(ledger, provider)).build();
    }

    @Test
    @DisplayName("发布：合法 kind 回 201，stored=true broadcast=false（内存模式）")
    void publishReturns201WithStoredTrue() throws Exception {
        mockMvc.perform(post("/api/notify")
                        .contentType("application/json")
                        .content("{\"kind\":\"achievement\",\"title\":\"三巨头同频\",\"body\":\"边境往事、幽冥帮派、深空纪元三系残响齐鸣\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stored", is(true)))
                .andExpect(jsonPath("$.broadcast", is(false)))
                .andExpect(jsonPath("$.kind", is("achievement")))
                .andExpect(jsonPath("$.channel", is("crossrealm:notify:channel")))
                .andExpect(jsonPath("$.id", is(org.hamcrest.Matchers.notNullValue())));
    }

    @Test
    @DisplayName("发布：非法 kind 回 400")
    void publishRejectsIllegalKind() throws Exception {
        mockMvc.perform(post("/api/notify")
                        .contentType("application/json")
                        .content("{\"kind\":\"hack\",\"title\":\"x\",\"body\":\"y\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("发布：空 title 回 400")
    void publishRejectsBlankTitle() throws Exception {
        mockMvc.perform(post("/api/notify")
                        .contentType("application/json")
                        .content("{\"kind\":\"world\",\"title\":\"\",\"body\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("recent：写两条后 limit=2 拿两条、新的在前")
    void recentReturnsNewestFirst() throws Exception {
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"season\",\"title\":\"赛季更替\",\"body\":\"灰烬→潮汐\"}"));
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"world\",\"title\":\"星门开启\",\"body\":\"深渊星港出现新的残响\"}"));

        mockMvc.perform(get("/api/notify/recent?limit=2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", is(2)))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].kind", is("world")))
                .andExpect(jsonPath("$.items[1].kind", is("season")));
    }

    @Test
    @DisplayName("ops：后端/容量/台账深度/按 kind 计数/频道名齐全且无玩家内容")
    void opsEndpointCarriesWhiteListOnly() throws Exception {
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"world\",\"title\":\"w1\",\"body\":\"b1\"}"));
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"season\",\"title\":\"s1\",\"body\":\"b3\"}"));

        mockMvc.perform(get("/api/notify/ops"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.backend", is("simple")))
                .andExpect(jsonPath("$.stored", is(2)))
                .andExpect(jsonPath("$.capacity", is(NotifyController.MAX_LIMIT)))
                .andExpect(jsonPath("$.totalPublished", is(2)))
                .andExpect(jsonPath("$.byKind.world", is(1)))
                .andExpect(jsonPath("$.byKind.season", is(1)))
                .andExpect(jsonPath("$.channel", is("crossrealm:notify:channel")));
    }

    @Test
    @DisplayName("recent：limit 越界被夹到 [1,50]")
    void recentClampsLimit() throws Exception {
        mockMvc.perform(get("/api/notify/recent?limit=0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit", is(1)));
        mockMvc.perform(get("/api/notify/recent?limit=999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit", is(50)));
    }

    @Test
    @DisplayName("stats：发布两条 world + 一条 season，计数对齐")
    void statsCountsByKind() throws Exception {
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"world\",\"title\":\"w1\",\"body\":\"b1\"}"));
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"world\",\"title\":\"w2\",\"body\":\"b2\"}"));
        mockMvc.perform(post("/api/notify").contentType("application/json")
                .content("{\"kind\":\"season\",\"title\":\"s1\",\"body\":\"b3\"}"));

        mockMvc.perform(get("/api/notify/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stored", is(3)))
                .andExpect(jsonPath("$.byKind.world", is(2)))
                .andExpect(jsonPath("$.byKind.season", is(1)))
                .andExpect(jsonPath("$.backend", is("simple")))
                .andExpect(jsonPath("$.totalPublished", greaterThanOrEqualTo(3)));
    }

    @Test
    @DisplayName("title 超过 120 字回 400")
    void publishRejectsOversizeTitle() throws Exception {
        String longTitle = "x".repeat(121);
        mockMvc.perform(post("/api/notify")
                        .contentType("application/json")
                        .content("{\"kind\":\"system\",\"title\":\"" + longTitle + "\",\"body\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("台账不可用 → 503 notify-ledger-unavailable（不伪装 500）")
    void ledgerFailureReturns503() throws Exception {
        NotificationLedger broken = new NotificationLedger() {
            @Override public void push(Notification notification) {
                throw new IllegalStateException("redis ledger write failed");
            }
            @Override public List<Notification> recent(int limit) { return List.of(); }
            @Override public Map<String, Long> countsByKind() { return Map.of(); }
            @Override public int size() { return 0; }
            @Override public void clear() { }
            @Override public String backend() { return "redis"; }
        };
        @SuppressWarnings("unchecked")
        ObjectProvider<StringRedisTemplate> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new NotifyController(broken, provider)).build();
        mvc.perform(post("/api/notify").contentType("application/json")
                        .content("{\"kind\":\"system\",\"title\":\"t\",\"body\":\"b\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error", is("notify-ledger-unavailable")))
                .andExpect(jsonPath("$.reason", containsString("redis")));
    }

    @Test
    @DisplayName("内存台账边界：超过容量 50 条后最老的被环出")
    void memoryLedgerRingsOut() {
        InMemoryNotificationLedger ledger = new InMemoryNotificationLedger();
        for (int i = 0; i < InMemoryNotificationLedger.CAPACITY + 5; i++) {
            ledger.push(Notification.of("world", "t" + i, "b"));
        }
        List<Notification> all = ledger.recent(InMemoryNotificationLedger.CAPACITY);
        org.junit.jupiter.api.Assertions.assertEquals(InMemoryNotificationLedger.CAPACITY, ledger.size());
        org.junit.jupiter.api.Assertions.assertEquals(
                "t" + (InMemoryNotificationLedger.CAPACITY + 4), all.get(0).title());
        // 最老的 5 条（t0..t4）已经被环出
        org.junit.jupiter.api.Assertions.assertEquals("t5", all.get(InMemoryNotificationLedger.CAPACITY - 1).title());
    }
}
