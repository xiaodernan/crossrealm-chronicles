package com.crossrealm.chronicles.ai.lore;

import com.crossrealm.chronicles.ai.AiErrors;
import com.crossrealm.chronicles.ai.RequestCorrelation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lore Oracle endpoint — the Star-Rail Advisor's deep-memory lane.
 * Same gateway, same rate limiter, same idempotency semantics (none — this is a read).
 */
@RestController
@RequestMapping("/api/ai/lore")
public class OracleController {

    private final LoreOracleService oracle;

    public OracleController(LoreOracleService oracle) {
        this.oracle = oracle;
    }

    /** The request object. limit = max excerpts fed to the oracle (0=use default, 1..6 allowed). */
    public record OracleRequest(
            @NotBlank @Size(max = 400) String question,
            @PositiveOrZero @Max(6) Integer limit) {}

    @PostMapping("/answer")
    public ResponseEntity<Map<String, Object>> answer(
            @Valid @RequestBody OracleRequest req,
            @RequestHeader(value = "X-Request-Id", required = false) String headerRequestId) {
        LoreOracleService.OracleResult result = oracle.answer(req.question(), req.limit());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", result.ok());
        body.put("answer", result.answer());
        body.put("sources", result.sources());
        body.put("model", result.model());
        body.put("cached", result.cached());
        body.put("upstreamCached", result.upstreamCached());
        body.put("latencyMs", result.latencyMs());
        String effectiveRequestId = RequestCorrelation.sanitizeInbound(headerRequestId);
        if (effectiveRequestId != null) {
            body.put("requestId", effectiveRequestId);
        }
        return ResponseEntity.ok(body);
    }

    /** 只读健康快照：ready + index size info — 不回显任何文本。 */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return oracle.health();
    }

    @ExceptionHandler(com.crossrealm.chronicles.ai.AdvisorUnavailableException.class)
    public ResponseEntity<Map<String, Object>> unavailable(com.crossrealm.chronicles.ai.AdvisorUnavailableException e) {
        return AiErrors.unavailable(e.getReason());
    }
}
