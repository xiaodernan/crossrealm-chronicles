package com.crossrealm.chronicles.season;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * W-M5：广播发布端的契约测试。
 *
 * <p>payload 是跨服务的**线协议**：game-service 那边按 {@code event/id/dayInCycle} 解析。
 * 这里把形状钉死，避免哪天把字段改名后，订阅方「收得到但认不出」，而两端测试都还是绿的。
 */
class SeasonBroadcastControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static SeasonCatalog catalog() {
        SeasonCatalog catalog = mock(SeasonCatalog.class);
        when(catalog.active()).thenReturn(
                new Season("tide", "深颚咸响", "", List.of("heavy-fog"), 20));
        when(catalog.dayInCycle()).thenReturn(7);
        return catalog;
    }

    @Test
    void 发布到约定频道且payload形状正确() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        var controller = new SeasonBroadcastController(catalog(), redis);

        Map<String, Object> result = controller.publish();

        assertEquals(true, result.get("published"));
        assertEquals("crossrealm:season:advance", result.get("channel"));
        assertEquals("tide", result.get("id"));
        assertEquals(7, result.get("dayInCycle"));

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(redis).convertAndSend(eq("crossrealm:season:advance"), captor.capture());
        Map<?, ?> payload = MAPPER.readValue(captor.getValue(), Map.class);
        assertEquals("season:advance", payload.get("event"));
        assertEquals("tide", payload.get("id"));
        assertEquals(7, payload.get("dayInCycle"));
    }

    @Test
    void 端点只在显式测试开关下注册() {
        ConditionalOnProperty condition =
                SeasonBroadcastController.class.getAnnotation(ConditionalOnProperty.class);
        assertNotNull(condition, "没有条件注解 = 生产环境也挂着一个可触发广播的 POST 端点");
        assertEquals(1, condition.name().length);
        assertEquals("season-service.broadcast.test-enabled", condition.name()[0]);
        assertEquals("true", condition.havingValue());
    }

    @Test
    void redis缺失时报503而不是NPE() {
        var controller = new SeasonBroadcastController(catalog(), null);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, controller::publish);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }
}
