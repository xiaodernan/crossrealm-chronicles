package com.crossrealm.chronicles.ai;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * W-Y4：把队列接成 Spring Bean。
 *
 * <p>队列本身**不带任何 Spring 注解**（除生命周期的 PostConstruct/PreDestroy），
 * 因为它是一个纯并发数据结构：测试用 {@code new AdvisorJobQueue(props, handler)} 就能
 * 完整跑通背压/重试/死信，不必起容器、不必等守护线程、不必连上游。
 * 唯一的装配动作在这里：把 {@link LlmClient#ask} 作为 Handler 交给它。
 */
@Configuration
public class AdvisorJobConfig {

    @Bean
    public AdvisorJobQueue advisorJobQueue(AdvisorJobProperties props, LlmClient client) {
        return new AdvisorJobQueue(props, client::ask);
    }
}
