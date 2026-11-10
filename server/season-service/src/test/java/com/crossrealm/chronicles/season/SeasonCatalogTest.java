package com.crossrealm.chronicles.season;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 赛季轮转的纯逻辑门禁（不启 Spring 上下文 —— 这一层是除法与名册，没有容器可测）。
 *
 * ## 为什么必须用假时钟
 *
 * "两周换一次季"没法靠等来验证。这里把 `Clock` 固定到纪元日（1970-01-01 起的天数），
 * 于是"第 0 天 / 第 13 天 / 第 14 天 / 第 15 天"四个边界都能在一毫秒内走一遍，
 * 而且断言的是**具体哪一季**，不是"某一季"。
 *
 * 方法名用 ASCII（与仓库其它 Java 测试一致）：Windows 上 javac 的源码编码与终端编码
 * 是两件事，中文标识符能不能编过取决于两边都对；把中文放进 `@DisplayName` 就没有这个前提。
 */
class SeasonCatalogTest {

    private static Clock atEpochDay(long epochDay) {
        return Clock.fixed(Instant.ofEpochSecond(epochDay * 86400L), ZoneOffset.UTC);
    }

    private static SeasonCatalog catalog(long epochDay, int cycleDays, String override) {
        SeasonServiceProperties props = new SeasonServiceProperties();
        props.setCycleDays(cycleDays);
        props.setOverride(override);
        SeasonCatalog catalog = new SeasonCatalog(props, atEpochDay(epochDay));
        catalog.validate();
        return catalog;
    }

    @Test
    @DisplayName("第一周期是灰烬；第 14 天起换季")
    void rotationFollowsConfiguredCycle() {
        assertEquals("ember", catalog(0, 14, "").active().id());
        assertEquals("ember", catalog(13, 14, "").active().id(), "第 13 天仍属于第一周期");
        assertEquals("tide", catalog(14, 14, "").active().id(), "第 14 天是第二周期的第一天");
        assertEquals("tide", catalog(27, 14, "").active().id());
        assertEquals("gloom", catalog(28, 14, "").active().id());
        assertEquals("radiant", catalog(42, 14, "").active().id());
        assertEquals("ember", catalog(56, 14, "").active().id(), "第四季之后回到第一季");
    }

    @Test
    @DisplayName("周期读数自洽：第几天 + 剩余天数 = 周期长度")
    void cycleReadingsAreConsistent() {
        for (long day = 0; day < 60; day++) {
            SeasonCatalog catalog = catalog(day, 14, "");
            int inCycle = catalog.dayInCycle();
            int remaining = catalog.daysRemaining();
            assertEquals(14, inCycle + remaining, "day=" + day + " 的周期读数不闭合");
            assertTrue(inCycle >= 0 && inCycle < 14, "day=" + day + " 的第几天越界：" + inCycle);
            assertTrue(remaining >= 1 && remaining <= 14, "day=" + day + " 的剩余天数越界：" + remaining);
        }
    }

    @Test
    @DisplayName("周期长度可配：七天一轮时第七天换季")
    void cycleLengthIsConfigurable() {
        assertEquals("ember", catalog(6, 7, "").active().id());
        assertEquals("tide", catalog(7, 7, "").active().id());
        assertEquals("gloom", catalog(14, 7, "").active().id());
        assertEquals("radiant", catalog(21, 7, "").active().id());
        assertEquals("ember", catalog(28, 7, "").active().id());
    }

    @Test
    @DisplayName("override 只改主题，不改周期读数")
    void overrideChangesThemeButNotCountdown() {
        SeasonCatalog forced = catalog(13, 14, "radiant");
        assertEquals("radiant", forced.active().id());
        assertEquals(13, forced.dayInCycle(), "强制换季不该把倒计时重置");
        assertEquals(1, forced.daysRemaining());
    }

    @Test
    @DisplayName("override 写错当场炸，不静默回落")
    void unknownOverrideFailsFast() {
        SeasonServiceProperties props = new SeasonServiceProperties();
        props.setOverride("embr");
        SeasonCatalog broken = new SeasonCatalog(props, atEpochDay(0));
        IllegalStateException error = assertThrows(IllegalStateException.class, broken::validate);
        assertTrue(error.getMessage().contains("embr"), "报错要点名那个写错的 id");
    }

    @Test
    @DisplayName("周期长度非正数当场炸")
    void nonPositiveCycleDaysFailsFast() {
        SeasonServiceProperties props = new SeasonServiceProperties();
        props.setCycleDays(0);
        SeasonCatalog broken = new SeasonCatalog(props, atEpochDay(0));
        assertThrows(IllegalStateException.class, broken::validate);
    }

    @Test
    @DisplayName("名册四套主题：id 唯一、词缀非空、加成在 0..100")
    void rosterIsSane() {
        List<Season> seasons = catalog(0, 14, "").seasons();
        assertEquals(4, seasons.size());
        assertEquals(4, seasons.stream().map(Season::id).distinct().count(), "id 有重复");
        for (Season season : seasons) {
            assertFalse(season.modifierIds().isEmpty(), season.id() + " 一条词缀都没有");
            assertTrue(season.soulsBonusPct() >= 0 && season.soulsBonusPct() <= 100,
                    season.id() + " 的加成比例不在 0..100：" + season.soulsBonusPct());
            assertFalse(season.name().isBlank(), season.id() + " 没有名字");
            assertFalse(season.tagline().isBlank(), season.id() + " 没有一句话说明");
        }
    }

    @Test
    @DisplayName("名册不可变：调用方改不动共享的那一份")
    void rosterIsImmutable() {
        Season season = catalog(0, 14, "").seasons().get(0);
        assertThrows(UnsupportedOperationException.class, () -> season.modifierIds().add("hacked"));
    }

    @Test
    @DisplayName("find：未知与空值都返回空")
    void findHandlesUnknownAndNull() {
        SeasonCatalog catalog = catalog(0, 14, "");
        assertTrue(catalog.find("gloom").isPresent());
        assertTrue(catalog.find("nope").isEmpty());
        assertTrue(catalog.find(null).isEmpty());
    }

    @Test
    @DisplayName("纪元之前的日期也不越界：floorMod 兜住负数")
    void negativeEpochDayDoesNotOverflow() {
        // epochDay = -1 时 floorDiv(-1,14) = -1，floorMod(-1,4) = 3 ⇒ 应当是名册最后一季
        SeasonCatalog before = catalog(-1, 14, "");
        assertSame(before.seasons().get(3), before.active());
        assertEquals(13, before.dayInCycle(), "周期最后一天");
    }
}
