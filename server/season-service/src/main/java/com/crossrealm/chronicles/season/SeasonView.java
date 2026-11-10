package com.crossrealm.chronicles.season;

import java.util.List;

/**
 * 对外的一份赛季视图（服务端契约）。
 *
 * 与 `Season` 分开而不是直接把 record 丢出去：`Season` 是**名册**（不含时间读数），
 * `SeasonView` 是**这一刻的答案**（带本周期进度）。混成一个类会让"名册里那一季还剩几天"
 * 这种没有意义的问题出现在类型上。
 *
 * game-service 的 `SeasonClient` 另有一份同名字段的 record（不共享 jar）——
 * 两个服务之间靠 JSON 契约耦合，而不是靠代码依赖。这正是微服务该有的耦合度，
 * 也让"服务端先升级"不会把客户端编译打断。
 */
public record SeasonView(
        String id,
        String name,
        String tagline,
        List<String> modifierIds,
        int soulsBonusPct,
        int dayInCycle,
        int daysRemaining) {

    public static SeasonView of(Season season, int dayInCycle, int daysRemaining) {
        return new SeasonView(
                season.id(),
                season.name(),
                season.tagline(),
                season.modifierIds(),
                season.soulsBonusPct(),
                dayInCycle,
                daysRemaining);
    }
}
