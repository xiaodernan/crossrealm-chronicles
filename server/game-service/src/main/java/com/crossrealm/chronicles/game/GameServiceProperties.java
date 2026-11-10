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
    private final Telemetry telemetry = new Telemetry();
    private String versionNote = "本地默认配置";

    public Leaderboard getLeaderboard() {
        return leaderboard;
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

    public static class Leaderboard {
        /** 启动时播种一批演示记录（离线联调排行榜用） */
        private boolean seedDemoData = true;
        /** 出榜条数上限 */
        private int maxLimit = 10;

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
