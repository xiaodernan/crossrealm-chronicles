package com.crossrealm.chronicles.ai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

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
        "ai-service.api-key="
})
class AiServiceApplicationContextTest {

    @Autowired
    private AiController aiController;

    @Autowired
    private EchoHintController echoHintController;

    @Test
    void contextBootsAndWiresTheRealBeans() {
        org.junit.jupiter.api.Assertions.assertNotNull(aiController);
        org.junit.jupiter.api.Assertions.assertNotNull(echoHintController);
    }
}
