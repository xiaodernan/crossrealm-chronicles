package com.crossrealm.chronicles.game;

import com.crossrealm.chronicles.game.cache.TtlCache;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * W-M5：把 {@link TtlCache seasonCache} 提成共享 bean ——
 * OpsController 与 SeasonBroadcastListener 都注入同一个实例，
 * 广播到达时立刻 invalidate，不再依赖「下次读时才发现过期」。
 */
@Configuration
public class CacheConfig {

    @Bean
    TtlCache seasonCache() {
        return new TtlCache();
    }
}
