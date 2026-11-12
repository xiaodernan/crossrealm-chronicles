package com.crossrealm.chronicles.ai;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * W-Y4 / W-Z1：把队列接成 Spring Bean。
 *
 * <p>队列本身<b>不带任何 Spring 注解</b>（除生命周期的 PostConstruct/PreDestroy），
 * 因为它是一个纯并发/IO 结构：测试用 {@code new AdvisorJobQueue(props, handler)} 就能
 * 完整跑通背压/重试/死信，不必起容器、不必等守护线程、不必连上游。
 * 唯一的装配动作在这里：把 {@link LlmClient#ask} 作为 Handler 交给它，并按
 * {@code ai-service.jobs.backend} 选后端。
 *
 * <p><b>默认 {@code in-memory}</b>：零额外基础设施，W-Y4 的进程内队列，应用无需 Redis 也能跑。
 * 配 {@code redis} 且 Spring 注入了 {@link StringRedisTemplate} 时，换上
 * {@link RedisStreamAdvisorQueue}（Redis Streams 消费者组，跨实例可靠投递）。
 * 两种后端实现同一个 {@link AdvisorQueue} 契约，控制器只认接口，不认具体类。
 */
@Configuration
public class AdvisorJobConfig {

    @Bean
    public AdvisorQueue advisorQueue(AdvisorJobProperties props, LlmClient client,
                                     ObjectProvider<StringRedisTemplate> redisProvider) {
        if ("redis".equalsIgnoreCase(props.getBackend()) && redisProvider.getIfAvailable() != null) {
            return new RedisStreamAdvisorQueue(props, client::ask, Thread::sleep,
                    redisProvider.getIfAvailable());
        }
        return new AdvisorJobQueue(props, client::ask);
    }
}
