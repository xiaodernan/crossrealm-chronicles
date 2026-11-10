package com.crossrealm.chronicles.season;

import jakarta.annotation.PostConstruct;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 赛季名册与轮转（W-X14）。
 *
 * ## 为什么"当前赛季"是算出来的，不是存下来的
 *
 * 存一个"当前赛季"字段需要有人去翻它（定时任务、运维手动改、或者第一次请求时懒写）——
 * 三条路都会在重启/多实例/时区上出问题，而它要回答的其实只是一道除法：
 * **今天是第几个周期、这一周期排到第几个主题**。名册是常量、周期是配置，
 * 于是同一时刻两个实例必然给出同一个答案，重启不改变任何东西，也不需要分布式锁。
 *
 * ## 时钟是注入的
 *
 * `Clock` 由构造器注入（生产是 `Clock.systemUTC()`，测试给固定时刻）。这一条不是洁癖：
 * "轮转到底对不对"没法靠等两周来验证，只能用假时钟把边界（周期最后一天 / 第一天）走一遍。
 *
 * ## override 的口径
 *
 * 配置里的 `override` 只改"现在是哪个主题"，**不改周期读数** —— 运维强制换主题时，
 * 倒计时仍按真实日历走。否则一次手动切换会把"本赛季还剩几天"变成一句谎话。
 */
@Component
public class SeasonCatalog {

    /**
     * 四套主题，与游戏里四位原创母题同名（灰烬 / 深颚 / 薄暮 / 辉煌）。
     *
     * 顺序即轮转顺序：相邻两季的主题**不相似**（火 → 海 → 暮 → 光），
     * 这样"换季"玩家能一眼看出来；如果按字母排，`abyss` 与 `archon` 会连着两季都是"暗+重"。
     */
    private static final List<Season> SEASONS = List.of(
            new Season(
                    "ember",
                    "灰烬回响",
                    "旧火未熄，野地里的余烬重新烧起来",
                    List.of("burning-ground", "elite-surge"),
                    25),
            new Season(
                    "tide",
                    "深颚咸响",
                    "潮水退去，盐味里浮出不该醒的东西",
                    List.of("drowned-echo", "heavy-fog"),
                    20),
            new Season(
                    "gloom",
                    "薄暮回响",
                    "灯一盏盏灭下去，影子走得比人快",
                    List.of("gloom-veil", "swift-shades"),
                    30),
            new Season(
                    "radiant",
                    "辉煌残响",
                    "钟声压过旷野，金甲在光里列队",
                    List.of("radiant-decree", "armored-choir"),
                    30));

    private final SeasonServiceProperties properties;
    private final Clock clock;

    public SeasonCatalog(SeasonServiceProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * 配置里的 override 写错一个字母就**当场炸**，不回落。
     *
     * 回落看起来"更稳"，实际是把一次配置错误藏成"赛季莫名其妙变回默认"——
     * 运维改了配置、服务照常启动、玩家看到的却是另一个主题，没有任何一处报错。
     * 这个仓库对脏值的一贯口径就是"参数是配置/存储里的字符串时当场抛"。
     */
    @PostConstruct
    void validate() {
        String override = properties.getOverride();
        if (override != null && !override.isBlank() && find(override).isEmpty()) {
            throw new IllegalStateException(
                    "season-service.override=\"" + override + "\" 不是已知赛季（可用："
                            + SEASONS.stream().map(Season::id).toList() + "）");
        }
        if (properties.getCycleDays() <= 0) {
            throw new IllegalStateException(
                    "season-service.cycle-days 必须是正数，收到 " + properties.getCycleDays()
                            + " —— 0 或负数会让周期除法失去意义");
        }
    }

    public List<Season> seasons() {
        return SEASONS;
    }

    public Optional<Season> find(String id) {
        if (id == null) {
            return Optional.empty();
        }
        return SEASONS.stream().filter(s -> s.id().equals(id)).findFirst();
    }

    /** 当前生效的赛季（override 优先，否则按周期轮转） */
    public Season active() {
        String override = properties.getOverride();
        if (override != null && !override.isBlank()) {
            return find(override).orElseThrow();
        }
        return SEASONS.get(Math.floorMod(cycleIndex(), SEASONS.size()));
    }

    /** 本周期第几天（0 起），与 active() 用的是同一个 epochDay */
    public int dayInCycle() {
        return Math.floorMod(today().toEpochDay(), properties.getCycleDays());
    }

    /** 本周期还剩几天（含今天，最小 1） */
    public int daysRemaining() {
        return properties.getCycleDays() - dayInCycle();
    }

    /** 从纪元起的第几个周期（可为负，`floorMod` 保证取模后仍落在名册范围内） */
    long cycleIndex() {
        return Math.floorDiv(today().toEpochDay(), properties.getCycleDays());
    }

    private LocalDate today() {
        return LocalDate.now(clock);
    }
}
