package com.crossrealm.chronicles.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * W-Y4：异步顾问入口。
 *
 * <p>与同步的 {@code POST /api/ai/chat} **并存**，不是替换：老客户端不知道队列存在，
 * 一条老路都不用改；愿意要「提交后立刻拿回控制权」的客户端走这一条。
 * 网关的 {@code /api/ai/**} 路由已经覆盖，无需新增路由表。
 */
@RestController
@RequestMapping("/api/ai")
public class AdvisorJobController {

    private final AdvisorJobQueue queue;

    public AdvisorJobController(AdvisorJobQueue queue) {
        this.queue = queue;
    }

    /** requestId 是可选的幂等键：网络重连/重复点击时用同一个值，不会让上游被问两次。
     * 没写时由网关的 X-Request-Id 补（W-Z6）；body 写了就 body 优先——幂等键永远由客户端说了算。 */
    public record AsyncChatRequest(
            @NotBlank @Size(max = 400) String question,
            @Size(max = 8) Map<String, Object> context,
            @Size(max = 64) String requestId) {}

    @PostMapping("/chat/async")
    public ResponseEntity<Map<String, Object>> submit(@Valid @RequestBody AsyncChatRequest request,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        String effectiveRequestId = RequestCorrelation.resolve(request.requestId(), headerRequestId);
        AdvisorJobQueue.SubmitResult result = queue.submit(
                request.question().trim(), request.context(), effectiveRequestId);
        if (!result.accepted()) {
            // 背压要说清楚：429 + Retry-After，而不是 200 里塞一个"稍后再试"的字符串。
            // 拒绝也要带上 correlation id —— 玩家拿着 id 来找人，运维才有线索。
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "advisor-queue-full");
            body.put("retryAfterMs", queue.pollAfterMs());
            if (effectiveRequestId != null) {
                body.put("requestId", effectiveRequestId);
            }
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(Math.max(1, (queue.pollAfterMs() + 999) / 1000)))
                    .body(body);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", result.jobId());
        body.put("status", "queued");
        body.put("duplicate", result.duplicate());
        body.put("pollAfterMs", queue.pollAfterMs());
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
    }

    /** 轮询一个任务。终态带答案或死信原因；在飞时只有 status/attempts。 */
    @GetMapping("/jobs/{jobId}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String jobId) {
        return queue.view(jobId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "job-not-found", "jobId", jobId)));
    }

    /** 队列读数：容量/深度/在飞/拒绝/重试/死信，运维一眼看出是不是该扩容或限流。 */
    @GetMapping("/jobs/stats")
    public Map<String, Object> stats() {
        return queue.stats();
    }
}
