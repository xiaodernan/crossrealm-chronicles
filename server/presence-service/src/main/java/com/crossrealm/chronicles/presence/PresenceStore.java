package com.crossrealm.chronicles.presence;

import java.util.Map;

/**
 * 在场状态存储（缓存层抽象）。
 *
 * 契约：upsert 写入一位游侠（带 TTL）；snapshot 返回当前仍"新鲜"的游侠；
 * publish 把该游侠广播到频道（交给 {@link PresenceEventHub} 扇出）；memberCount 用于限流。
 */
public interface PresenceStore {

    /** 写入/刷新一位游侠；ts 由实现打（服务端时间），不信任客户端钟。 */
    void upsert(String channel, Wanderer w);

    /** 当前频道里所有"新鲜"游侠（id -> 游侠）。已过期键会在读取时自愈清理。 */
    Map<String, Wanderer> snapshot(String channel);

    /** 当前频道成员数（用于硬上限限流）。 */
    long memberCount(String channel);
}
