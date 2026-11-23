package com.crossrealm.chronicles.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class AiPropertiesRefreshTest {

    @Test
    void configurationProperties_bindProxyUrlIntoSharedTransport() {
        new ApplicationContextRunner()
                .withUserConfiguration(PropertiesConfiguration.class)
                .withPropertyValues("ai-service.proxy-url=http://127.0.0.1:7897")
                .run(context -> {
                    AiProperties props = context.getBean(AiProperties.class);
                    HttpLlmTransport transport = context.getBean(HttpLlmTransport.class);
                    assertEquals("http://127.0.0.1:7897", props.getProxyUrl());
                    assertTrue(transport.currentClient().proxy().isPresent());
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AiProperties.class)
    @Import(HttpLlmTransport.class)
    static class PropertiesConfiguration {}
}
