package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.net.InetSocketAddress;
import org.junit.jupiter.api.Test;

/** LLM_PROXY_URL 解析的零网络单测：设置了代理 / 没设 / 脏输入三档。 */
class HttpLlmTransportProxyTest {

    @Test
    void parseProxy_nullOrBlank_meansDirect() {
        assertNull(HttpLlmTransport.parseProxy(null));
        assertNull(HttpLlmTransport.parseProxy(""));
        assertNull(HttpLlmTransport.parseProxy("   "));
    }

    @Test
    void parseProxy_fullUrl_resolves() {
        InetSocketAddress addr = HttpLlmTransport.parseProxy("http://127.0.0.1:7897");
        org.junit.jupiter.api.Assertions.assertNotNull(addr);
        assertEquals("127.0.0.1", addr.getHostString());
        assertEquals(7897, addr.getPort());
    }

    @Test
    void parseProxy_httpsUrl_resolves() {
        InetSocketAddress addr = HttpLlmTransport.parseProxy("https://proxy.local:3128");
        org.junit.jupiter.api.Assertions.assertNotNull(addr);
        assertEquals("proxy.local", addr.getHostString());
        assertEquals(3128, addr.getPort());
    }

    @Test
    void parseProxy_bareHostPort_resolves() {
        InetSocketAddress addr = HttpLlmTransport.parseProxy("host.docker.internal:7897");
        org.junit.jupiter.api.Assertions.assertNotNull(addr);
        assertEquals("host.docker.internal", addr.getHostString());
        assertEquals(7897, addr.getPort());
    }

    @Test
    void parseProxy_garbage_returnsNullInsteadOfCrashing() {
        assertNull(HttpLlmTransport.parseProxy("http://"));
        assertNull(HttpLlmTransport.parseProxy("http://hostonly"));
        assertNull(HttpLlmTransport.parseProxy(":7897"));
        assertNull(HttpLlmTransport.parseProxy("http://h:0"));
        assertNull(HttpLlmTransport.parseProxy("http://h:99999"));
        assertNull(HttpLlmTransport.parseProxy("http://h:notaport"));
    }
}
