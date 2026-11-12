package com.crossrealm.chronicles.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** W-Z9：访问日志行的 JSON 契约——单行、字段白名单、query/body 永不入场。 */
class AccessLogFilterTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 行是一条合法JSON且字段恰好七枚() throws Exception {
        String line = AccessLogFilter.formatLine("req-1", "GET", "/api/ai/health", 200, 12);
        JsonNode node = MAPPER.readTree(line);
        Set<String> names = new HashSet<>();
        node.fieldNames().forEachRemaining(names::add);
        assertEquals(Set.of("ts", "app", "requestId", "method", "path", "status", "durationMs"), names);
        assertEquals("ai-service", node.get("app").asText());
        assertEquals("req-1", node.get("requestId").asText());
        assertEquals("/api/ai/health", node.get("path").asText());
        assertEquals(200, node.get("status").asInt());
        assertEquals(12, node.get("durationMs").asLong());
        assertTrue(node.get("ts").asLong() > 0);
        assertFalse(line.contains("\n"), "行内不许出现换行（一条一行 JSON 的前提）");
    }

    @Test
    void 恶意路径经Jackson转义_解析回来逐字相等() throws Exception {
        String nasty = "/api/ai/x?y=\"\\q\"\r\n<>";
        String line = AccessLogFilter.formatLine(null, "POST", nasty, 503, 0);
        JsonNode node = MAPPER.readTree(line);
        assertEquals(nasty, node.get("path").asText());
        assertEquals("", node.get("requestId").asText(), "null requestId 必须落成空字符串，不编造");
        assertFalse(line.contains("\n") || line.contains("\r"));
    }

    @Test
    void 全量字段都在一行内_grep可匹配() {
        String line = AccessLogFilter.formatLine("abc-123", "POST", "/api/ai/chat/async", 202, 3);
        assertTrue(line.startsWith("{") && line.endsWith("}"));
        assertTrue(line.contains("\"app\":\"ai-service\""));
        assertTrue(line.contains("\"requestId\":\"abc-123\""));
        assertTrue(line.contains("\"status\":202"));
    }
}
