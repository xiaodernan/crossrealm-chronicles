package com.crossrealm.chronicles.game.telemetry;

import com.crossrealm.chronicles.game.GameServiceProperties;
import com.crossrealm.chronicles.game.notify.NotifyMirrorService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 遥测 API：/api/telemetry/events */
@RestController
public class TelemetryController {

    private final TelemetryService service;
    private final GameServiceProperties properties;
    private final NotifyMirrorService notifyMirror;

    public TelemetryController(TelemetryService service, GameServiceProperties properties,
                               NotifyMirrorService notifyMirror) {
        this.service = service;
        this.properties = properties;
        this.notifyMirror = notifyMirror;
    }

    @PostMapping("/api/telemetry/events")
    public ResponseEntity<Map<String, Object>> record(@Valid @RequestBody SubmitEvent body) {
        TelemetryEvent event = service.record(body.type().trim(),
                body.detail() == null ? "" : body.detail().trim());
        // W-Z50：高信号世界事件（boss_defeated）镜像到报讯台——吞掉一切失败，不拖垮入口
        notifyMirror.mirror(event.type(), event.detail());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "id", event.id(),
                "accepted", true));
    }

    @GetMapping("/api/telemetry/events/count")
    public Map<String, Object> count() {
        return Map.of(
                "count", service.count(),
                "maxEvents", properties.getTelemetry().getMaxEvents());
    }

    @GetMapping("/api/telemetry/events")
    public Map<String, Object> snapshot() {
        return Map.of(
                "items", service.snapshot(),
                "count", service.count());
    }

    /**
     * 窗口内事件频次摘要（W-X15）——按 type 聚合的次数榜（默认 Top-5，最多 20）。
     * 生产意义：运维/联调不必拉全量事件就能看到"这轮测试里大家都在干什么"。
     * 注意：窗口是 maxEvents 条内存尾巴，不是全量历史。
     */
    @GetMapping("/api/telemetry/summary")
    public Map<String, Object> summary(@RequestParam(name = "topN", defaultValue = "5") int topN) {
        return service.summarize(topN);
    }

    public record SubmitEvent(
            @NotBlank(message = "type 不能为空") @Size(max = 64) String type,
            @Size(max = 256) String detail) {
    }
}
