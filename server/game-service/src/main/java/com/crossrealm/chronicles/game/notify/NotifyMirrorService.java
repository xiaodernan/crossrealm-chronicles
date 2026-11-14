package com.crossrealm.chronicles.game.notify;

import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 世界事件 → 报讯台的镜像器（W-Z50）。
 *
 * <p>只镜像**高信号**遥测类型（当前只有 {@code boss_defeated}）：
 * 报讯台是「最近发生了什么大事」，不是流水日志——把每条 telemetry 都搬进去，
 * 等于把 50 格的环形台账稀释成噪音。
 *
 * <p>所有异常（Feign 抛出、fallback 已吞、序列化、脏 detail）一律吞掉：
 * telemetry 入口不允许因为一个旁观件失败而 500。
 */
@Component
public class NotifyMirrorService {

    /** bossId → 中文名（与 src/content/bossRoster.js 同源，服务端不读前端文件，各抄一份 + 单测钉住） */
    private static final Map<String, String> BOSS_NAMES = Map.of(
            "shadow-warden", "影界守护者",
            "archmagus", "大奥术师·萨尔林",
            "singularity-herald", "引力化身·奇点领主",
            "void-chronarch", "时线执政官",
            "chaos-overlord", "混沌裂隙领主");

    private static final String TYPE_BOSS_DEFEATED = "boss_defeated";

    /** 赛季 id 白名单形状（ember / tide / gloom / radiant 这一族） */
    private static final java.util.regex.Pattern SEASON_ID_RE =
            java.util.regex.Pattern.compile("^[a-z][a-z0-9-]{0,19}$");

    private static final Logger LOG = LoggerFactory.getLogger(NotifyMirrorService.class);

    private final NotifyClient client;
    private final boolean enabled;

    public NotifyMirrorService(NotifyClient client,
                               @Value("${game-service.notify-mirror-enabled:true}") boolean enabled) {
        this.client = client;
        this.enabled = enabled;
    }

    /**
     * 镜像一条换季广播（W-Z53）。与 boss_defeated 同一套纪律：仅在 enabled 时发，异常一律吞掉。
     *
     * @param seasonId season-service 广播体里的 {@code id}（如 ember / tide / gloom / radiant）
     */
    public boolean mirrorSeasonAdvance(String seasonId) {
        if (!enabled) {
            return false;
        }
        String id = sanitizeSeasonId(seasonId);
        try {
            client.publish(new NotifyEvent(
                    "season",
                    "世界事件 · 赛季更替",
                    "新的赛季词缀已生效（" + id + "）。"));
            return true;
        } catch (RuntimeException e) {
            LOG.warn("NotifyClient threw despite fallback (cause={}), event dropped", e.getClass().getSimpleName());
            return false;
        }
    }

    private static String sanitizeSeasonId(String id) {
        if (id == null) {
            return "unknown";
        }
        String stripped = id.replaceAll("\\p{Cntrl}", "").trim().toLowerCase(java.util.Locale.ROOT);
        return SEASON_ID_RE.matcher(stripped).matches() ? stripped : "unknown";
    }

    /**
     * 镜像一条遥测事件。仅 {@code boss_defeated} 会真正发报讯，其余静默返回 false。
     *
     * @return 是否真的尝试调用了通知服务（供单测/日志判断；不区分成功与降级）
     */
    public boolean mirror(String type, String detail) {
        if (!TYPE_BOSS_DEFEATED.equals(type)) {
            return false;
        }
        if (!enabled) {
            return false;
        }
        String bossId = sanitize(detail);
        String name = Optional.ofNullable(BOSS_NAMES.get(bossId)).orElseGet(() -> unknownBossName(bossId));
        try {
            client.publish(new NotifyEvent(
                    "world",
                    "世界事件 · Boss 被讨伐",
                    name + " 已倒下。"));
            return true;
        } catch (RuntimeException e) {
            // fallbackFactory 在 feign circuit open 时会自己返回 degraded，不会走到这里；
            // 到这里说明 fallback 也没兜住（极端情况）—— 一样只记日志，绝不向外抛。
            LOG.warn("NotifyClient threw despite fallback (cause={}), event dropped", e.getClass().getSimpleName());
            return false;
        }
    }

    /** bossId 白名单形状：与客户端 postTelemetry(boss_defeated, bossId) 的契约对齐（kebab-case）。 */
    private static String sanitize(String detail) {
        if (detail == null) {
            return "unknown";
        }
        String stripped = detail.replaceAll("\\p{Cntrl}", "").trim();
        if (stripped.isEmpty()) {
            return "unknown";
        }
        return stripped.length() <= 64 ? stripped : stripped.substring(0, 64);
    }

    private static String unknownBossName(String bossId) {
        if (bossId == null || bossId.isBlank()) {
            return "某位 Boss";
        }
        return "未知 Boss（" + bossId + "）";
    }
}
