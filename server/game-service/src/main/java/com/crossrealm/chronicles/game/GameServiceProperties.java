package com.crossrealm.chronicles.game;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;

/**
 * game-service 的配置项（前缀 {@code game-service}）。
 * 默认值与 config-server 仓库里那份一致；config-server 在线时由它覆盖。
 *
 * <p>W-X9（配置热刷新）：挂上 {@code @RefreshScope} —— {@code POST /actuator/refresh}
 * 之后这些属性会原地重新绑定（不用重启服务），下一次 {@code top()} 立即按新的
 * {@code maxLimit} 出榜；版本备注也会同步到 /api/version。
 */
@ConfigurationProperties(prefix = "game-service")
@RefreshScope
public class GameServiceProperties {

    private final Leaderboard leaderboard = new Leaderboard();
    private final Trial trial = new Trial();
    private final Telemetry telemetry = new Telemetry();
    private String versionNote = "本地默认配置";

    public Leaderboard getLeaderboard() {
        return leaderboard;
    }

    public Trial getTrial() {
        return trial;
    }

    public Telemetry getTelemetry() {
        return telemetry;
    }

    public String getVersionNote() {
        return versionNote;
    }

    public void setVersionNote(String versionNote) {
        this.versionNote = versionNote;
    }

    /**
     * 排行榜（W-Y5）。与 {@link Trial} 同构：**持久层**是可切换件——
     * `memory`（默认，进程内）/ `redis`（Redis ZSET 兜底，重启/多实例共享历史）。
     */
    public static class Leaderboard {
        /** 持久层后端：memory（默认）/ redis */
        private String backend = "memory";
        /** 启动时播种一批演示记录（离线联调排行榜用） */
        private boolean seedDemoData = true;
        /** 出榜条数上限 */
        private int maxLimit = 10;

        /** 持久层后端：memory（默认）/ redis */
        public String getBackend() {
            return backend;
        }

        public void setBackend(String backend) {
            this.backend = backend;
        }

        public boolean isSeedDemoData() {
            return seedDemoData;
        }

        public void setSeedDemoData(boolean seedDemoData) {
            this.seedDemoData = seedDemoData;
        }

        public int getMaxLimit() {
            return maxLimit;
        }

        public void setMaxLimit(int maxLimit) {
            this.maxLimit = maxLimit;
        }
    }

    /**
     * 位面试炼榜（W-F3 切片6）。与 {@link Leaderboard} 是两张表、两套次序：
     * 这里**分数降序**，那边用时升序 —— 合并不了，因为它们的"更好"不是同一个方向。
     */
    public static class Trial {
        /** 启动时播种一批演示成绩（离线联调试炼榜用） */
        private boolean seedDemoData = true;
        /** 出榜条数上限 */
        private int maxLimit = 10;
        /** 内存里最多留多少条（超出后丢最老的一条 —— 不限容的内存榜是内存泄漏） */
        private int maxEntries = 500;

        public boolean isSeedDemoData() {
            return seedDemoData;
        }

        public void setSeedDemoData(boolean seedDemoData) {
            this.seedDemoData = seedDemoData;
        }

        public int getMaxLimit() {
            return maxLimit;
        }

        public void setMaxLimit(int maxLimit) {
            this.maxLimit = maxLimit;
        }

        public int getMaxEntries() {
            return maxEntries;
        }

        public void setMaxEntries(int maxEntries) {
            this.maxEntries = maxEntries;
        }
    }

    public static class Telemetry {
        /** 内存最多缓存多少条事件（超出后丢弃最老的一条） */
        private int maxEvents = 500;

        public int getMaxEvents() {
            return maxEvents;
        }

        public void setMaxEvents(int maxEvents) {
            this.maxEvents = maxEvents;
        }
    }
}
