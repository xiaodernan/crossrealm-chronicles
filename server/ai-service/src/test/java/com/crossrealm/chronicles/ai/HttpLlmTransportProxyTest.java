package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.net.http.HttpClient;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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

    @Test
    void proxyRefresh_swapsPoolOnlyWhenEffectiveConfigurationChanges() {
        AiProperties props = new AiProperties();
        HttpLlmTransport transport = new HttpLlmTransport(props);
        HttpClient direct = transport.currentClient();
        assertTrue(direct.proxy().isEmpty());

        props.setProxyUrl("http://127.0.0.1:7897");
        HttpClient proxied = transport.currentClient();
        assertNotSame(direct, proxied);
        Proxy selected = proxied.proxy().orElseThrow().select(URI.create("https://upstream.invalid/v1")).get(0);
        assertEquals(Proxy.Type.HTTP, selected.type());
        assertEquals(new InetSocketAddress("127.0.0.1", 7897), selected.address());

        props.setProxyUrl("  http://127.0.0.1:7897  ");
        assertSame(proxied, transport.currentClient(), "仅 trim 差异不应重建连接池");
        assertEquals(2L, proxySnapshot(transport).get("generation"));

        props.setProxyUrl("");
        HttpClient directAgain = transport.currentClient();
        assertNotSame(proxied, directAgain);
        assertTrue(directAgain.proxy().isEmpty());
        assertEquals(3L, proxySnapshot(transport).get("generation"));
    }

    @Test
    void concurrentFirstRequestsAfterRefresh_shareExactlyOneNewPool() throws Exception {
        AiProperties props = new AiProperties();
        HttpLlmTransport transport = new HttpLlmTransport(props);
        int workers = 24;
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(workers);
        Set<HttpClient> selected = ConcurrentHashMap.newKeySet();
        Set<Throwable> failures = ConcurrentHashMap.newKeySet();
        for (int i = 0; i < workers; i++) {
            new Thread(() -> {
                ready.countDown();
                try {
                    if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                    selected.add(transport.currentClient());
                } catch (Throwable t) {
                    failures.add(t);
                } finally {
                    done.countDown();
                }
            }).start();
        }
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        props.setProxyUrl("http://127.0.0.1:7898");
        start.countDown();
        assertTrue(done.await(5, TimeUnit.SECONDS));
        assertTrue(failures.isEmpty(), () -> "并发换池失败: " + failures);
        assertEquals(1, selected.size(), "同一配置下的并发请求必须共享一个池");
        assertEquals(2L, proxySnapshot(transport).get("generation"), "双检锁只允许换一次池");
    }

    @Test
    void healthSnapshot_exposesOnlyCredentialFreeProxyState() throws Exception {
        AiProperties props = new AiProperties();
        props.setProxyUrl("http://proxy-user:proxy-secret@127.0.0.1:7897");
        HttpLlmTransport transport = new HttpLlmTransport(props);
        String snapshot = new ObjectMapper().writeValueAsString(transport.health());

        assertTrue(snapshot.contains("127.0.0.1"));
        assertTrue(snapshot.contains("7897"));
        assertFalse(snapshot.contains("proxy-user"));
        assertFalse(snapshot.contains("proxy-secret"));
        assertFalse(snapshot.contains("proxyUrl"));
        assertFalse(snapshot.contains("http://"));
        assertEquals(true, proxySnapshot(transport).get("enabled"));
    }

    @Test
    void invalidRefreshedProxy_fallsBackToDirectPool() {
        AiProperties props = new AiProperties();
        props.setProxyUrl("http://127.0.0.1:7897");
        HttpLlmTransport transport = new HttpLlmTransport(props);
        HttpClient proxied = transport.currentClient();

        props.setProxyUrl("http://127.0.0.1:not-a-port");
        HttpClient direct = transport.currentClient();
        assertNotSame(proxied, direct);
        assertTrue(direct.proxy().isEmpty());
        assertEquals(false, proxySnapshot(transport).get("enabled"));
        assertEquals(2L, proxySnapshot(transport).get("generation"));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> proxySnapshot(HttpLlmTransport transport) {
        return (Map<String, Object>) transport.health().get("proxy");
    }
}
