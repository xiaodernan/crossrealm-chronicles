package com.crossrealm.chronicles.season;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 赛季 REST 面（W-X14）。三条只读接口，全部落在网关的 `/api/seasons/**` 后面。
 *
 * - `GET /api/seasons`        名册 + 当前是谁（客户端启动时拉一次就够）
 * - `GET /api/seasons/active` 只要"这一轮"（客户端每局开始前拉，最常用）
 * - `GET /api/seasons/{id}`   指定一季（图鉴/资料页要用，也给运维核对名册）
 *
 * 没有 POST：赛季是**服务端编排**的东西，玩家/客户端不得改它。真要换季，
 * 走配置中心（`override`）或等周期 —— 一条不需要鉴权的写接口只会变成被滥用的开关。
 */
@RestController
public class SeasonController {

    private final SeasonCatalog catalog;

    public SeasonController(SeasonCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/api/seasons")
    @Cacheable(value = "seasons", key = "'list'")
    public Map<String, Object> list() {
        int dayInCycle = catalog.dayInCycle();
        int daysRemaining = catalog.daysRemaining();
        List<SeasonView> views = catalog.seasons().stream()
                .map(s -> SeasonView.of(s, dayInCycle, daysRemaining))
                .toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("activeId", catalog.active().id());
        result.put("cycleDays", dayInCycle + daysRemaining);
        result.put("seasons", views);
        return result;
    }

    /**
     * 当前赛季，带时间戳视图——客户端每局开始前拉的最重接口。
     * 5 分钟 TTL（CacheConfig）让重复请求命中，避免周期轮转计算在每调用次数上做重复工作。
     * 赛季切换后 TTL 自然过期回源，不需要显式 evict。
     */
    @GetMapping("/api/seasons/active")
    @Cacheable(value = "seasons", key = "'active'")
    public SeasonView active() {
        return SeasonView.of(catalog.active(), catalog.dayInCycle(), catalog.daysRemaining());
    }

    /**
     * 未知 id 返回 **404**，不是空对象。
     *
     * 空对象会让客户端把"这一季不存在"与"这一季没有词缀"混成一种情况 ——
     * 前者是调用方拼错了 id，后者是一个合法的赛季形态，两者该在调用方分开处理。
     */
    @GetMapping("/api/seasons/{id}")
    @Cacheable(value = "seasons", key = "#id")
    public SeasonView byId(@PathVariable String id) {
        Season season = catalog.find(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "unknown season id: " + id));
        return SeasonView.of(season, catalog.dayInCycle(), catalog.daysRemaining());
    }
}
