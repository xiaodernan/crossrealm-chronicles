package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.net.http.HttpClient;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Bootstrap regression guard: the whole point is to let Spring assemble the
 * real beans (no mocks). LlmClient has two constructors, and a missing
 * @Autowired on the public one makes the container look for a no-arg
 * constructor that does not exist - the context then fails before ANY
 * request is served. The unit tests use standalone MockMvc and never saw it;
 * smoke did (but only after a release). This test closes that hole.
 *
 * With an empty api-key (test resources), no upstream call happens - boot only.
 */
@SpringBootTest(properties = {
        "spring.cloud.config.enabled=false",
        "eureka.client.enabled=false",
        "ai-service.api-key=",
        "ai-service.proxy-url=http://127.0.0.1:7897"
})
class AiServiceApplicationContextTest {

    @Autowired
    private AiController aiController;

    @Autowired
    private EchoHintController echoHintController;

    @Autowired
    private AiProperties properties;

    @Autowired
    private HttpLlmTransport transport;

    @Autowired
    private ConfigurableEnvironment environment;

    @Autowired
    private ApplicationEventPublisher events;

    @Autowired
    private LlmFlightCoordinator flights;

    @Test
    void contextBootsAndWiresTheRealBeans() {
        org.junit.jupiter.api.Assertions.assertNotNull(aiController);
        org.junit.jupiter.api.Assertions.assertNotNull(echoHintController);
        org.junit.jupiter.api.Assertions.assertSame(LlmFlightCoordinator.DISABLED, flights);
    }

    @Test
    void environmentRefresh_rebindsProxyAndSwapsPoolWithoutTouchingOtherBeans() {
        HttpClient initial = transport.currentClient();
        MapPropertySource refresh = new MapPropertySource(
                "ai-proxy-refresh-test", Map.of("ai-service.proxy-url", "http://127.0.0.1:7898"));
        environment.getPropertySources().addFirst(refresh);
        try {
            events.publishEvent(new EnvironmentChangeEvent(Set.of("ai-service.proxy-url")));
            assertEquals("http://127.0.0.1:7898", properties.getProxyUrl());
            HttpClient refreshed = transport.currentClient();
            assertNotSame(initial, refreshed);
            assertSame(refreshed, transport.currentClient());
            assertNotNull(aiController);
            assertNotNull(echoHintController);
        } finally {
            environment.getPropertySources().remove(refresh.getName());
            events.publishEvent(new EnvironmentChangeEvent(Set.of("ai-service.proxy-url")));
        }
        assertEquals("http://127.0.0.1:7897", properties.getProxyUrl());
    }
}
