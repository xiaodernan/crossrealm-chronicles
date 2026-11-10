package com.crossrealm.chronicles.season;

import java.util.List;

/**
 * 一个赛季主题。
 *
 * ## 为什么字段是这四个
 *
 * 服务端**不认识**游戏里的能力/敌人/地图 —— 它只该回答"这一轮的主题是什么、
 * 带哪几条词缀、给多少额外魂火"。具体某条词缀意味着什么（敌人 +30% 血、地面持续伤害…）
 * 是客户端内容表的事（`src/content/trials.js`）。把这个边界画清楚，
 * 服务端改一次赛季不需要跟着改客户端代码，客户端加一条新词缀也不需要发服务端。
 *
 * `modifierIds` 里出现客户端不认识的值时，客户端**忽略而不是报错** —— 这就是
 * 这个契约存在的意义：老客户端连上新服务端时，多出来的词缀等于没带。
 *
 * @param id            稳定 id（ASCII，进 URL、进日志、进客户端内容表）
 * @param name          人读的名字（服务端不负责本地化，客户端按 id 查自己的双表）
 * @param tagline       一句话说明（同上：客户端有就用，没有就只显示 name）
 * @param modifierIds   词缀 id 列表（客户端内容表的键，未知值忽略）
 * @param soulsBonusPct 本赛季额外魂火百分比（0 表示不加成）
 */
public record Season(
        String id,
        String name,
        String tagline,
        List<String> modifierIds,
        int soulsBonusPct) {

    public Season {
        modifierIds = List.copyOf(modifierIds);
    }
}
