package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * W-Z11：HttpLlmTransport 的 SSE → chat.completion 收拢逻辑（零网络）。
 * 任何回归（丢行、用量字段丢失、content 没合并）都会在这里变红。
 */
class SseNormalizerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String CANNED =
            "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-6-sol\","
                    + "\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"沿\"},\"finish_reason\":null}]}\n\n"
            + "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-6-sol\","
                    + "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"灯\"},\"finish_reason\":null}]}\n\n"
            + "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-6-sol\","
                    + "\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n"
            + "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-6-sol\","
                    + "\"choices\":[],\"usage\":{\"prompt_tokens\":4700,\"completion_tokens\":40,\"total_tokens\":4740,"
                    + "\"prompt_tokens_details\":{\"cached_tokens\":393}}}\n\n"
            + "data: [DONE]\n\n";

    @Test
    void 正文增量合并且用量字段透传() throws Exception {
        LlmTransport.UpstreamReply reply = HttpLlmTransport.drainSse(CANNED);
        assertEquals(Integer.valueOf(4700), reply.promptTokens());
        assertEquals(Integer.valueOf(40), reply.completionTokens());
        assertEquals(Integer.valueOf(393), reply.cachedTokens());

        JsonNode root = MAPPER.readTree(reply.rawJson());
        assertEquals("沿灯", root.path("choices").path(0).path("message").path("content").asText());
        assertEquals(4700, root.path("usage").path("prompt_tokens").asInt());
        assertEquals(393, root.path("usage").path("prompt_tokens_details").path("cached_tokens").asInt());
    }

    @Test
    void 没有正文增量时按旧口径报200不重试() {
        LlmUpstreamException e = assertThrows(LlmUpstreamException.class,
                () -> HttpLlmTransport.drainSse("data: {\"choices\":[],\"usage\":{\"prompt_tokens\":10}}\n\ndata: [DONE]\n\n"));
        assertEquals(200, e.status());
        assertFalse(e.retryable());
    }

    @Test
    void isSse区分流式与普通响应() {
        assertTrue(HttpLlmTransport.isSse("data: {\"a\":1}\n\n"));
        assertTrue(HttpLlmTransport.isSse("\n\n  data: {\"a\":1}\n\n"));
        assertFalse(HttpLlmTransport.isSse("{\"object\":\"chat.completion\"}"));
        assertFalse(HttpLlmTransport.isSse(""));
        assertFalse(HttpLlmTransport.isSse(null));
    }
}
